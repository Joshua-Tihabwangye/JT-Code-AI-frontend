import { create } from 'zustand';
import { apiErrorMessage } from '@/lib/api/http';
import type { ChatRepository, FilesRepository } from '@/lib/data';

export interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status: 'complete' | 'streaming' | 'error' | 'canceled';
  attachments?: string[];
}

/**
 * The chat the user is in. It lives outside the chat page, so leaving the page (or a reply still
 * streaming) never loses the thread: coming back picks up exactly where the user stopped. Only
 * "New chat" starts a fresh one. The open conversation is also remembered across reloads.
 */
interface ChatSession {
  /** Whose chat this is (another account signing in starts clean). */
  owner: string;
  conversationId: string | null;
  messages: ThreadMessage[];
  busy: boolean;
  status: string;
  loadError: string;
  /** Bumped by every new chat / opened conversation: replies for an older thread are ignored. */
  thread: number;
}

const initial = { conversationId: null, messages: [], busy: false, status: '', loadError: '' };
export const useChatSession = create<ChatSession>(() => ({ owner: '', thread: 0, ...initial }));

const KEY = 'jt-code.chat.current';
const storageKey = (owner: string) => `${KEY}:${owner}`;

/** The conversation the user had open last time (survives reloads), if any. */
export function rememberedConversation(owner: string): string | null {
  try {
    return localStorage.getItem(storageKey(owner));
  } catch {
    return null;
  }
}

function remember(owner: string, id: string | null) {
  try {
    if (id) localStorage.setItem(storageKey(owner), id);
    else localStorage.removeItem(storageKey(owner));
  } catch {
    /* Private mode / blocked storage: the chat still works for this visit. */
  }
}

/** Make sure the session belongs to ``owner`` (signing in as someone else starts clean). */
export function claimSession(owner: string) {
  if (useChatSession.getState().owner !== owner) useChatSession.setState((s) => ({ owner, thread: s.thread + 1, ...initial }));
}

/** Start a new chat (the only thing that leaves the current one). */
export function newChat() {
  const { owner } = useChatSession.getState();
  remember(owner, null);
  useChatSession.setState((s) => ({ thread: s.thread + 1, ...initial }));
}

const fromServer = (loaded: Awaited<ReturnType<ChatRepository['getMessages']>>): ThreadMessage[] =>
  loaded
    .filter((m) => m.role !== 'system')
    .map((m) => ({ id: m.id, role: m.role, content: m.content, status: m.status }));

/** A reply is still being written on the server (e.g. the page was reloaded mid-answer). */
const awaitingReply = (messages: ThreadMessage[]) => {
  const last = messages.at(-1);
  return !!last && (last.role === 'user' || last.status === 'streaming');
};

/** Open a saved conversation (from History or a reload). Nothing happens if it is already open. */
export async function openConversation(chat: ChatRepository, id: string, onMissing: () => void) {
  const state = useChatSession.getState();
  if (state.conversationId === id && (state.messages.length || state.busy)) return;
  const thread = state.thread + 1;
  remember(state.owner, id);
  useChatSession.setState({ ...initial, conversationId: id, thread });
  const current = () => useChatSession.getState().thread === thread;
  let messages: ThreadMessage[];
  try {
    messages = fromServer(await chat.getMessages(id));
  } catch {
    if (!current()) return;
    // A conversation that was deleted (or is not this user's): start fresh instead of showing an error.
    remember(state.owner, null);
    useChatSession.setState({ ...initial });
    onMissing();
    return;
  }
  if (!current()) return;
  useChatSession.setState({ messages });
  // Still answering (e.g. reloaded mid-reply): follow the reply until it is finished.
  try {
    for (let tries = 0; awaitingReply(messages) && tries < 90; tries += 1) {
      useChatSession.setState({ busy: true });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (!current()) return;
      messages = fromServer(await chat.getMessages(id));
      if (!current()) return;
      useChatSession.setState({ messages });
    }
  } catch {
    /* The thread stays as last loaded; the reply shows when the conversation is opened again. */
  }
  if (current()) useChatSession.setState({ busy: false });
}

interface SendOptions {
  chat: ChatRepository;
  files: FilesRepository;
  text: string;
  attachments?: File[];
  signedIn: boolean;
  guestReply: string;
  titleFrom: (text: string) => string;
  onSettled: () => void;
}

/** Send a message and stream the reply into the open thread. */
export async function sendMessage({ chat, files, text, attachments = [], signedIn, guestReply, titleFrom, onSettled }: SendOptions) {
  const { thread } = useChatSession.getState();
  const assistantId = crypto.randomUUID();
  const current = () => useChatSession.getState().thread === thread;
  const patchAssistant = (patch: (message: ThreadMessage) => ThreadMessage) => {
    if (!current()) return; // the user moved to another chat: the reply is still saved on the server
    useChatSession.setState((s) => ({ messages: s.messages.map((m) => (m.id === assistantId ? patch(m) : m)) }));
  };
  useChatSession.setState((s) => ({
    messages: [
      ...s.messages,
      { id: crypto.randomUUID(), role: 'user', content: text, status: 'complete', attachments: attachments.map((f) => f.name) },
      { id: assistantId, role: 'assistant', content: '', status: 'streaming' },
    ],
  }));

  if (!signedIn) {
    // Guests can try the composer; answers need an account (and its credits).
    patchAssistant((m) => ({ ...m, content: guestReply, status: 'complete' }));
    return;
  }

  useChatSession.setState({ busy: true, status: 'queued' });
  try {
    let id = useChatSession.getState().conversationId;
    if (!id) {
      const conversation = await chat.createConversation(titleFrom(text));
      id = conversation.id;
      if (current()) {
        useChatSession.setState({ conversationId: id });
        // The chat page puts it in the address; coming back resumes it.
        remember(useChatSession.getState().owner, id);
      }
    }
    for (const file of attachments) {
      const uploaded = await files.upload({ file });
      await files.attachToChat(uploaded.id, id);
    }
    const reply = await chat.sendMessage({
      conversationId: id,
      content: text,
      model: 'auto',
      onStatus: (status) => current() && useChatSession.setState({ status }),
      onToken: (token) => patchAssistant((m) => ({ ...m, content: m.content + token })),
    });
    patchAssistant((m) => ({ ...m, content: reply.content || m.content, status: reply.status === 'streaming' ? 'complete' : reply.status }));
  } catch (error) {
    patchAssistant((m) => ({ ...m, content: apiErrorMessage(error), status: 'error' }));
  } finally {
    if (current()) useChatSession.setState({ busy: false, status: '' });
    onSettled();
  }
}
