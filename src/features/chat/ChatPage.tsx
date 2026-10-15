import { useRef, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useApiClient, apiErrorMessage } from '@/lib/api/client';
import { ChatComposer } from '@/features/chat/ChatComposer';
import { ChatBackground } from '@/features/chat/ChatBackground';
import { createChatRequest, createConversation, streamChatRequest } from '@/features/chat/api';
import { useBillingStore } from '@/features/billing/store';
import { useAuth } from '@/lib/supabase';
import type { ChatRequest } from '@/features/chat/types';

interface LocalMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  status?: 'sending' | 'streaming' | 'complete' | 'error';
  metadata?: Record<string, unknown>;
}

type ChatPersistenceMode = 'ephemeral' | 'persistent';

const CHAT_HISTORY_KEY = 'jt-code-chat-history';

function saveChatSession(messages: LocalMessage[], conversationId: string | null, persistenceMode: ChatPersistenceMode) {
  if (persistenceMode !== 'persistent' || !conversationId || messages.length <= 1) return;
  const title = messages.find((m) => m.role === 'user')?.content.slice(0, 60) || 'New chat';
  const lastAssistant = [...messages].reverse().find((m: LocalMessage) => m.role === 'assistant' && m.status === 'complete');
  const preview = lastAssistant?.content.slice(0, 120) || '';
  const item = {
    id: conversationId,
    title,
    preview,
    messages: messages.length,
    updatedAt: new Date().toISOString(),
  };
  try {
    const saved = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || '[]') as unknown[];
    const filtered = Array.isArray(saved) ? saved.filter((s: unknown) => {
      const record = s as { id?: string };
      return record.id !== item.id;
    }) : [];
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify([item, ...filtered].slice(0, 50)));
  } catch {
    // ignore
  }
}

/**
 * Types out a sequence of text segments one after another, so a headline
 * can be split into differently-styled parts (e.g. a plain lead-in and a
 * colored accent) while still animating as one continuous typing effect.
 */
function useTypingSequence(segments: string[], speed = 60) {
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [displayed, setDisplayed] = useState<string[]>(() => segments.map(() => ''));
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed(segments.map(() => ''));
    setSegmentIndex(0);
    setDone(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments.join('\u0000')]);

  useEffect(() => {
    if (done || segmentIndex >= segments.length) {
      if (!done) setDone(true);
      return;
    }
    const text = segments[segmentIndex] ?? '';
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setDisplayed((prev) => {
        const next = [...prev];
        next[segmentIndex] = text.slice(0, i);
        return next;
      });
      if (i >= text.length) {
        clearInterval(interval);
        setSegmentIndex((prev) => prev + 1);
      }
    }, speed);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentIndex, speed, done]);

  return { displayed, done };
}

export function ChatPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const { isSignedIn } = useAuth();
  const persistenceMode: ChatPersistenceMode = isSignedIn ? 'persistent' : 'ephemeral';
  const conversationId = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([
    { id: 'welcome', role: 'assistant', content: t('chat.welcome'), status: 'complete' },
  ]);
  const [busy, setBusy] = useState(false);

  const headline = useTypingSequence([t('chat.headlineLead'), t('chat.headlineAccent')], 160);
  const hasConversation = messages.length > 1;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const loadConversations = useCallback(() => {
    if (!isSignedIn) return;
    // conversations state managed separately; sidebar handles history via /app/history route
  }, [isSignedIn]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  async function send(text: string) {
    setBusy(true);
    const userMessageId = crypto.randomUUID();
    setMessages((current) => [...current, { id: userMessageId, role: 'user', content: text, status: 'complete' }]);
    if (persistenceMode === 'persistent') {
      useBillingStore.getState().consumeCredits(5, 'Chat');
    }

    const assistantId = crypto.randomUUID();
    setMessages((current) => [...current, { id: assistantId, role: 'assistant', content: '', status: 'streaming' }]);

    try {
      if (persistenceMode === 'ephemeral') {
        window.setTimeout(() => {
          setMessages((current) => current.map((message) =>
            message.id === assistantId
              ? { ...message, content: t('chat.guestEphemeralReply'), status: 'complete' }
              : message
          ));
          setBusy(false);
        }, 350);
        return;
      }

      if (!conversationId.current) {
        const conversation = await createConversation(client);
        conversationId.current = conversation.id;
        void loadConversations();
      }

      const request = await createChatRequest(client, {
        conversationId: conversationId.current,
        chatInput: text,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale: navigator.language,
      });

      await streamChatRequest(client, request.id, ({ type, data }) => {
        setMessages((current) => current.map((message) => {
          if (message.id !== assistantId) return message;
          if (type === 'failed') {
            const errorData = data as { message?: string };
            return { ...message, content: errorData.message ?? t('chat.requestFailed'), status: 'error' };
          }
          const updated = data as Partial<ChatRequest>;
          return { ...message, content: updated.outputText || t('chat.statusRunning', { status: updated.status ?? 'running' }), status: 'streaming' };
        }));
      });

      setMessages((current) => {
        const updated: LocalMessage[] = current.map((message) =>
          message.id === assistantId ? { ...message, status: 'complete' } : message
        );
        saveChatSession(updated, conversationId.current, persistenceMode);
        return updated;
      });
    } catch (error) {
      setMessages((current) => {
        const updated: LocalMessage[] = current.map((message) =>
          message.id === assistantId
            ? { ...message, content: apiErrorMessage(error), status: 'error' }
            : message
        );
        saveChatSession(updated, conversationId.current, persistenceMode);
        return updated;
      });
    } finally {
      setBusy(false);
    }
  }

  if (!hasConversation) {
    return (
      <section className="chat-workspace" data-persistence-mode={persistenceMode}>
        <ChatBackground />

        <div className="chat-landing pointer-events-auto">
          <section className="chat-landing-content">
            <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 w-[520px] h-[360px] rounded-full bg-[radial-gradient(ellipse_at_center,var(--primary)_0%,transparent_70%)] opacity-[0.08] dark:opacity-[0.18] blur-3xl" />

            <h1 className="chat-headline relative text-center my-4">
              {headline.displayed[0]}
              <span className="chat-headline-accent">{headline.displayed[1]}</span>
              {!headline.done && <span className="chat-cursor" />}
            </h1>

            <div className="relative w-full max-w-[720px] flex flex-col items-center gap-4 mt-12">
              <ChatComposer disabled={busy} onSubmit={send} placeholder={t('chat.composerPlaceholder')} />
            </div>
          </section>
        </div>
      </section>
    );
  }

  return (
    <section className="chat-workspace" data-persistence-mode={persistenceMode}>
      <ChatBackground />

      <div className="chat-scroll">
        <div className="message-list">
          {messages.map((message) => (
            <article
              key={message.id}
              className={`message ${message.role}${message.status === 'streaming' ? ' streaming' : ''}${message.status === 'error' ? ' error' : ''}`}
            >
              <span className="message-role">
                {message.role === 'user' ? t('chat.roleYou') : t('chat.roleAssistant')}
              </span>
              <p>
                {message.content}
                {message.status === 'streaming' && <span className="chat-cursor" />}
              </p>
            </article>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="relative z-10 px-4 pb-6 pt-2">
        <ChatComposer disabled={busy} onSubmit={send} placeholder={t('chat.composerPlaceholder')} />
      </div>
    </section>
  );
}