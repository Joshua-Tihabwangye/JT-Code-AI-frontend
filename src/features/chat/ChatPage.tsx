import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Paperclip, SquarePen, Square } from 'lucide-react';
import { ChatComposer } from '@/features/chat/ChatComposer';
import { ChatBackground } from '@/features/chat/ChatBackground';
import { useAuth } from '@/lib/supabase';
import { useRepository } from '@/lib/data';
import { Button } from '@/shared/components';
import { claimSession, newChat, openConversation, rememberedConversation, sendMessage, useChatSession } from '@/features/chat/session';

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
  const { isSignedIn, user, loading } = useAuth();
  const chat = useRepository('chat');
  const files = useRepository('files');
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const openedId = searchParams.get('c');
  const owner = user?.id ?? 'guest';
  // The thread lives in a session store: leaving this page never loses it (see ./session).
  const { conversationId, messages, busy, status, loadError } = useChatSession();
  const endRef = useRef<HTMLDivElement>(null);
  const headline = useTypingSequence([t('chat.headlineLead'), t('chat.headlineAccent')], 160);
  const persistenceMode = isSignedIn ? 'persistent' : 'ephemeral';

  useEffect(() => {
    if (!loading) claimSession(owner);
  }, [loading, owner]);

  // The address drives the thread, and only when the address itself changes: /app/chat?c=<id> opens
  // that conversation (from History); arriving with no ?c carries on with the chat the user was in
  // (also after a reload). "New chat" clears the chat first, so nothing here can bring the old one back.
  const handledId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!isSignedIn || openedId === handledId.current) return;
    handledId.current = openedId;
    if (openedId) {
      void openConversation(chat, openedId, () => setSearchParams({}, { replace: true }));
      return;
    }
    const resume = useChatSession.getState().conversationId ?? rememberedConversation(owner);
    if (resume) setSearchParams({ c: resume }, { replace: true });
  }, [openedId, isSignedIn, chat, owner, setSearchParams]);
  // A new chat's conversation is created with its first message: show its id in the address.
  useEffect(() => {
    if (isSignedIn && conversationId && !openedId) setSearchParams({ c: conversationId }, { replace: true });
  }, [conversationId, openedId, isSignedIn, setSearchParams]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  function send(text: string, attachments: File[] = []) {
    return sendMessage({
      chat,
      files,
      text,
      attachments,
      signedIn: isSignedIn,
      guestReply: t('chat.guestEphemeralReply'),
      titleFrom,
      onSettled: () => {
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
        void queryClient.invalidateQueries({ queryKey: ['billing'] });
      },
    });
  }

  function stop() {
    if (conversationId) chat.cancelGeneration(conversationId);
  }

  function startNewChat() {
    // A clean slate: the old chat is only reachable from History from now on.
    newChat();
    setSearchParams({}, { replace: true });
  }

  const hasThread = messages.length > 0 || !!loadError;
  return (
    <section className="chat-workspace" data-persistence-mode={persistenceMode}>
      <ChatBackground />

      {hasThread ? (
        <>
          {/* Only here, in the chat area: leave this chat and start another one. */}
          <div className="chat-toolbar">
            <button type="button" className="chat-new-button" onClick={startNewChat} title={t('chat.newChatHint')} data-testid="new-chat">
              <SquarePen size={16} aria-hidden="true" /> {t('chat.newChat')}
            </button>
          </div>
          <div className="chat-scroll" aria-live="polite">
            <div className="message-list">
              {loadError && <div className="message error">{loadError}</div>}
              {messages.map((message) => (
                <article key={message.id} className={`message ${message.role} ${message.status}`} data-testid={`message-${message.role}`}>
                  {/* No visible names (like ChatGPT/Gemini): the layout shows who is speaking; screen readers still hear it. */}
                  <span className="sr-only">{message.role === 'user' ? t('chat.you') : t('chat.assistant')}: </span>
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
            {busy && (
              <div className="mb-2 flex justify-center">
                <Button variant="outline" size="sm" onClick={stop} className="gap-1.5">
                  <Square size={14} /> {t('chat.stop')}
                </Button>
              </div>
            )}
            <ChatComposer disabled={busy} onSubmit={send} placeholder={t('chat.composerPlaceholder')} />
          </div>
        </>
      ) : (
        <div className="chat-landing pointer-events-auto">
          <section className="chat-landing-content">
            <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 w-[min(520px,100%)] h-[360px] rounded-full bg-[radial-gradient(ellipse_at_center,var(--primary)_0%,transparent_70%)] opacity-[0.08] dark:opacity-[0.18] blur-3xl" />
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
