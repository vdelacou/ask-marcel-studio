import { describe, expect, test } from 'bun:test';
import { addConversation, emptyConversationList, loadConversations, removeConversation, retitleConversation, selectConversation } from './conversation-list.ts';
import { conversationId } from '../../../shared/conversation-id.ts';
import type { ConversationMeta } from '../../../shared/types.ts';

const id = (n: number): ConversationMeta['id'] => {
  const built = conversationId(`00000000-0000-0000-0000-00000000000${n}`);
  if (!built.ok) throw new Error('bad test id');
  return built.value;
};

const meta = (n: number, updatedAt: string, title = `conv ${n}`): ConversationMeta => ({
  id: id(n),
  title,
  model: 'p::m',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt,
});

describe('the conversation sidebar list', () => {
  test('loading orders the newest first and opens it', () => {
    const view = loadConversations([meta(1, '2026-01-01T00:00:00.000Z'), meta(2, '2026-02-01T00:00:00.000Z')]);
    expect(view.conversations.map((c) => c.id)).toEqual([id(2), id(1)]);
    expect(view.activeId).toBe(id(2));
  });

  test('loading nothing opens nothing', () => {
    expect(loadConversations([])).toEqual(emptyConversationList);
  });

  test('selecting a listed conversation makes it active', () => {
    const view = selectConversation(loadConversations([meta(1, 'a'), meta(2, 'b')]), id(1));
    expect(view.activeId).toBe(id(1));
  });

  test('selecting an unknown conversation changes nothing', () => {
    const before = loadConversations([meta(1, 'a')]);
    expect(selectConversation(before, id(9))).toEqual(before);
  });

  test('a new conversation goes to the top and opens', () => {
    const view = addConversation(loadConversations([meta(1, 'a')]), meta(2, 'b'));
    expect(view.conversations[0]?.id).toBe(id(2));
    expect(view.activeId).toBe(id(2));
  });

  test('renaming updates the title in place and keeps it open', () => {
    const view = retitleConversation(selectConversation(loadConversations([meta(1, 'a'), meta(2, 'b')]), id(1)), id(1), 'Renamed');
    expect(view.conversations.find((c) => c.id === id(1))?.title).toBe('Renamed');
    expect(view.activeId).toBe(id(1));
  });

  test('retitling an unknown conversation changes nothing', () => {
    const before = loadConversations([meta(1, 'a')]);
    expect(retitleConversation(before, id(9), 'x')).toEqual(before);
  });

  test('deleting the open conversation opens the next one', () => {
    const view = removeConversation(loadConversations([meta(1, 'a'), meta(2, 'b')]), id(2));
    expect(view.conversations.map((c) => c.id)).toEqual([id(1)]);
    expect(view.activeId).toBe(id(1));
  });

  test('deleting a background conversation keeps the current one open', () => {
    const view = removeConversation(selectConversation(loadConversations([meta(1, 'a'), meta(2, 'b')]), id(2)), id(1));
    expect(view.activeId).toBe(id(2));
  });

  test('deleting the last conversation opens nothing', () => {
    const view = removeConversation(loadConversations([meta(1, 'a')]), id(1));
    expect(view.activeId).toBeUndefined();
  });
});
