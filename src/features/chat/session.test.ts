import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatRepository, FilesRepository } from '@/lib/data';
import { claimSession, newChat, openConversation, rememberedConversation, sendMessage, useChatSession } from './session';

function fakeChat(overrides: Partial<ChatRepository> = {}) {
  let release: () => void = () => undefined;
  const createConversation = vi.fn((title?: string) => Promise.resolve({ id: 'c1', title }));
  const getMessages = vi.fn(() =>
    Promise.resolve([
      { id: 'm1', conversationId: 'c1', role: 'user', content: 'Hello', createdAt: '2026-01-01T00:00:00Z', status: 'complete' },
      { id: 'm2', conversationId: 'c1', role: 'assistant', content: 'Hi there', createdAt: '2026-01-01T00:00:01Z', status: 'complete' },
    ]),
  );
  const chat = {
    createConversation,
    getMessages,
    sendMessage: vi.fn(async (options: { onToken?: (token: string) => void }) => {
      options.onToken?.('Hi ');
      await new Promise<void>((resolve) => (release = resolve));
      options.onToken?.('there');
      return { id: 'r1', conversationId: 'c1', role: 'assistant', content: 'Hi there', createdAt: '', status: 'complete' };
    }),
    cancelGeneration: vi.fn(),
    ...overrides,
  } as unknown as ChatRepository;
  return { chat, finish: () => release(), createConversation, getMessages };
}

const files = {} as FilesRepository;
const send = (chat: ChatRepository, text = 'Hello') =>
  sendMessage({ chat, files, text, signedIn: true, guestReply: '', titleFrom: (value) => value, onSettled: () => undefined });

describe('chat session', () => {
  beforeEach(() => {
    localStorage.clear();
    useChatSession.setState({ owner: '' });
    claimSession('user-1');
  });

  it('writes the reply into the open thread (not only to History) and remembers the chat', async () => {
    const { chat, finish, createConversation, getMessages } = fakeChat();
    const sending = send(chat);
    await vi.waitFor(() => expect(useChatSession.getState().messages[1]?.content).toBe('Hi '));
    expect(useChatSession.getState().conversationId).toBe('c1');
    expect(rememberedConversation('user-1')).toBe('c1');

    // The page puts ?c=c1 in the address and opens it: the live thread is kept, not reloaded.
    await openConversation(chat, 'c1', () => undefined);
    expect(getMessages).not.toHaveBeenCalled();

    finish();
    await sending;
    const messages = useChatSession.getState().messages;
    expect(messages.map((m) => [m.role, m.content, m.status])).toEqual([
      ['user', 'Hello', 'complete'],
      ['assistant', 'Hi there', 'complete'],
    ]);
    expect(createConversation).toHaveBeenCalledTimes(1);
  });

  it('only "New chat" leaves the current chat; a late reply for the old one is not mixed in', async () => {
    const { chat, finish } = fakeChat();
    const sending = send(chat);
    await vi.waitFor(() => expect(useChatSession.getState().conversationId).toBe('c1'));
    newChat();
    finish();
    await sending;
    expect(useChatSession.getState()).toMatchObject({ conversationId: null, messages: [], busy: false });
    expect(rememberedConversation('user-1')).toBeNull();
  });

  it('reopens a remembered conversation from the server after a reload', async () => {
    const { chat } = fakeChat();
    await openConversation(chat, 'c1', () => undefined);
    expect(useChatSession.getState().messages.map((m) => m.content)).toEqual(['Hello', 'Hi there']);
    expect(useChatSession.getState().busy).toBe(false);
  });

  it('starts fresh when the remembered conversation no longer exists', async () => {
    const { chat } = fakeChat({ getMessages: vi.fn(() => Promise.reject(new Error('Not found'))) });
    const onMissing = vi.fn();
    await openConversation(chat, 'gone', onMissing);
    expect(onMissing).toHaveBeenCalled();
    expect(useChatSession.getState()).toMatchObject({ conversationId: null, messages: [] });
    expect(rememberedConversation('user-1')).toBeNull();
  });

  it('another account signing in does not see the previous chat', async () => {
    const { chat, finish } = fakeChat();
    const sending = send(chat);
    await vi.waitFor(() => expect(useChatSession.getState().messages[1]?.content).toBe('Hi '));
    finish();
    await sending;
    claimSession('user-2');
    expect(useChatSession.getState().messages).toEqual([]);
  });
});
