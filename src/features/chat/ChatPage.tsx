import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Paperclip, Plus, Square } from 'lucide-react';
import { ChatComposer } from '@/features/chat/ChatComposer';
import { ChatBackground } from '@/features/chat/ChatBackground';
import { useAuth } from '@/lib/supabase';
import { useRepository } from '@/lib/data';
import { apiErrorMessage } from '@/lib/api/http';
import { Button } from '@/shared/components';

interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status: 'complete' | 'streaming' | 'error' | 'canceled';
  attachments?: string[];
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

const titleFrom = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 60) || 'New chat';

export function ChatPage() {
  const { t } = useTranslation();
  const { isSignedIn } = useAuth();
  const chat = useRepository('chat');
  const files = useRepository('files');
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const openedId = searchParams.get('c');

  const [conversationId, setConversationId] = useState<string | null>(openedId);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [loadError, setLoadError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const headline = useTypingSequence([t('chat.headlineLead'), t('chat.headlineAccent')], 160);
  const persistenceMode = isSignedIn ? 'persistent' : 'ephemeral';

  // Open a conversation from History (/app/chat?c=<id>), or start fresh.
  useEffect(() => {
    if (!isSignedIn) return;
    if (!openedId) {
      setConversationId(null);
      setMessages([]);
      return;
    }
    let active = true;
    setLoadError('');
    setConversationId(openedId);
    chat
      .getMessages(openedId)
      .then((loaded) => {
        if (!active) return;
        setMessages(
          loaded
            .filter((m) => m.role !== 'system')
            .map((m) => ({ id: m.id, role: m.role, content: m.content, status: m.status === 'streaming' ? 'complete' : m.status })),
        );
      })
      .catch((error: unknown) => active && setLoadError(apiErrorMessage(error)));
    return () => {
      active = false;
    };
  }, [openedId, isSignedIn, chat]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const updateAssistant = useCallback((id: string, patch: (message: ThreadMessage) => ThreadMessage) => {
    setMessages((current) => current.map((message) => (message.id === id ? patch(message) : message)));
  }, []);

  async function send(text: string, attachments: File[] = []) {
    const assistantId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'user', content: text, status: 'complete', attachments: attachments.map((f) => f.name) },
      { id: assistantId, role: 'assistant', content: '', status: 'streaming' },
    ]);

    if (!isSignedIn) {
      // Guests can try the composer; answers need an account (and its credits).
      updateAssistant(assistantId, (m) => ({ ...m, content: t('chat.guestEphemeralReply'), status: 'complete' }));
      return;
    }

    setBusy(true);
    setStatus('queued');
    try {
      let id = conversationId;
      if (!id) {
        const conversation = await chat.createConversation(titleFrom(text));
        id = conversation.id;
        setConversationId(id);
        setSearchParams({ c: id }, { replace: true });
      }
      for (const file of attachments) {
        const uploaded = await files.upload({ file });
        await files.attachToChat(uploaded.id, id);
      }
      const reply = await chat.sendMessage({
        conversationId: id,
        content: text,
        model: 'auto',
        onStatus: setStatus,
        onToken: (token) => updateAssistant(assistantId, (m) => ({ ...m, content: m.content + token })),
      });
      updateAssistant(assistantId, (m) => ({
        ...m,
        content: reply.content || m.content,
        status: reply.status === 'streaming' ? 'complete' : reply.status,
      }));
    } catch (error) {
      updateAssistant(assistantId, (m) => ({ ...m, content: apiErrorMessage(error), status: 'error' }));
    } finally {
      setBusy(false);
      setStatus('');
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['billing'] });
    }
  }

  function stop() {
    if (conversationId) chat.cancelGeneration(conversationId);
  }

  function newChat() {
    setSearchParams({});
    setConversationId(null);
    setMessages([]);
  }

  const hasThread = messages.length > 0 || !!loadError;
  return (
    <section className="chat-workspace" data-persistence-mode={persistenceMode}>
      <ChatBackground />

      {hasThread ? (
        <>
          <div className="chat-scroll" aria-live="polite">
            <div className="message-list">
              {loadError && <div className="message error">{loadError}</div>}
              {messages.map((message) => (
                <article key={message.id} className={`message ${message.role} ${message.status}`} data-testid={`message-${message.role}`}>
                  <span className="message-role">{message.role === 'user' ? t('chat.you') : t('chat.assistant')}</span>
                  {message.content ? (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  ) : (
                    <p className="text-muted-foreground">{t('chat.statusRunning', { status: status || 'running' })}</p>
                  )}
                  {message.attachments && message.attachments.length > 0 && (
                    <p className="mt-2 flex flex-wrap gap-2 text-xs opacity-80">
                      {message.attachments.map((name) => (
                        <span key={name} className="inline-flex items-center gap-1"><Paperclip size={12} /> {name}</span>
                      ))}
                    </p>
                  )}
                  {message.status === 'canceled' && <p className="mt-1 text-xs text-muted-foreground">{t('chat.stopped')}</p>}
                </article>
              ))}
              <div ref={endRef} />
            </div>
          </div>
          <div className="relative z-[1] pb-4">
            <div className="mb-2 flex justify-center gap-2">
              {busy ? (
                <Button variant="outline" size="sm" onClick={stop} className="gap-1.5">
                  <Square size={14} /> {t('chat.stop')}
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={newChat} className="gap-1.5" data-testid="new-chat">
                  <Plus size={16} /> {t('chat.newChat')}
                </Button>
              )}
            </div>
            <ChatComposer disabled={busy} onSubmit={send} placeholder={t('chat.composerPlaceholder')} />
          </div>
        </>
      ) : (
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
      )}
    </section>
  );
}
