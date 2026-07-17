import { describe, expect, test } from 'bun:test';
import { byMostRecentlyUpdated, newConversation, parseConversation, serialiseConversation, titleFromFirstMessage, toMeta } from './conversation-doc.ts';
import { conversationId } from './conversation-id.ts';
import { unwrap } from './result.ts';
import type { ConversationMeta } from './types.ts';

const ID = unwrap(conversationId('3f2504e0-4f89-41d3-9a0c-0305e82c3301'));
const NOW = '2026-07-17T12:00:00.000Z';

const onDisk = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  title: 'What is in my inbox',
  model: 'anthropic::claude-opus-4-8',
  createdAt: NOW,
  updatedAt: NOW,
  messages: [
    { id: 'm1', role: 'user', createdAt: NOW, parts: [{ type: 'text', text: 'what is in my inbox' }] },
    {
      id: 'm2',
      role: 'assistant',
      createdAt: NOW,
      parts: [
        { type: 'text', text: 'Checking.' },
        { type: 'tool', toolUseId: 't1', name: 'Bash', input: { command: 'ask-marcel-office list-mail' }, result: '3 messages', status: 'done' },
      ],
    },
  ],
};

describe('starting a new conversation', () => {
  test('a new conversation opens empty, on the chosen model, with both timestamps set', () => {
    const conversation = newConversation(ID, 'anthropic::claude-opus-4-8', NOW);

    expect(conversation.messages).toEqual([]);
    expect(conversation.model).toBe('anthropic::claude-opus-4-8');
    expect(conversation.createdAt).toBe(NOW);
    expect(conversation.updatedAt).toBe(NOW);
  });

  test('a new conversation has not resumed any agent session yet', () => {
    expect(newConversation(ID, 'anthropic::claude-opus-4-8', NOW).sdkSessionId).toBeUndefined();
  });
});

describe('naming a conversation after what the user first asked', () => {
  test('a short question becomes the title as typed', () => {
    expect(titleFromFirstMessage('what is in my inbox')).toBe('what is in my inbox');
  });

  test('a long question is cut short so the sidebar stays readable', () => {
    const title = titleFromFirstMessage('a'.repeat(200));

    expect(title).toHaveLength(60);
    expect(title.endsWith('…')).toBe(true);
  });

  test('a question spread over several lines becomes one line', () => {
    expect(titleFromFirstMessage('what is\n\n  in my   inbox\t')).toBe('what is in my inbox');
  });

  test('a message with nothing but whitespace still gets a usable title', () => {
    expect(titleFromFirstMessage('   \n  ')).toBe('New conversation');
  });

  test('a title cut short does not end on a stray space before the ellipsis', () => {
    expect(titleFromFirstMessage(`${'a'.repeat(58)} bbbbb`)).toBe(`${'a'.repeat(58)}…`);
  });
});

describe('reopening a conversation saved by an earlier run', () => {
  test('a saved conversation comes back with its messages in order', () => {
    const parsed = parseConversation(onDisk);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.messages).toHaveLength(2);
    expect(parsed.value.messages[0]?.role).toBe('user');
  });

  test('a saved tool call comes back with its input and result, so the card can render', () => {
    const parsed = parseConversation(onDisk);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const part = parsed.value.messages[1]?.parts[1];
    expect(part?.type).toBe('tool');
    if (part?.type !== 'tool') return;
    expect(part.name).toBe('Bash');
    expect(part.input).toEqual({ command: 'ask-marcel-office list-mail' });
    expect(part.result).toBe('3 messages');
    expect(part.status).toBe('done');
  });

  test('a conversation interrupted mid-turn keeps its still-running tool call', () => {
    const running = {
      ...onDisk,
      messages: [{ id: 'm1', role: 'assistant', createdAt: NOW, parts: [{ type: 'tool', toolUseId: 't1', name: 'Bash', input: {}, status: 'running' }] }],
    };

    expect(parseConversation(running).ok).toBe(true);
  });

  test('a resumed conversation keeps the agent session id that lets it continue', () => {
    const parsed = parseConversation({ ...onDisk, sdkSessionId: 'sess_123' });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.sdkSessionId).toBe('sess_123');
  });

  test('a conversation round-trips through serialise and parse unchanged', () => {
    const parsed = parseConversation(onDisk);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const again = parseConversation(JSON.parse(serialiseConversation(parsed.value)));

    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value).toEqual(parsed.value);
  });
});

describe('refusing a conversation file that cannot be trusted', () => {
  const rejections: ReadonlyArray<{ readonly why: string; readonly file: unknown; readonly message: string }> = [
    { why: 'a file that is not an object', file: 'nope', message: 'conversation must be an object' },
    { why: 'a file whose id is not a string', file: { ...onDisk, id: 42 }, message: 'conversation id must be a string' },
    // Load-bearing: the id inside the file builds the workspace path, and the
    // filename it was read from is no proof of what it contains.
    { why: 'a file whose id is a path traversal, even though the filename was a uuid', file: { ...onDisk, id: '../../../etc/passwd' }, message: 'conversation id must be a uuid' },
    { why: 'a file with no title', file: { ...onDisk, title: '' }, message: 'conversation title must be a non-empty string' },
    { why: 'a file with no model', file: { ...onDisk, model: '' }, message: 'conversation model must be a non-empty string' },
    { why: 'a file with no createdAt', file: { ...onDisk, createdAt: 0 }, message: 'conversation createdAt must be a string' },
    { why: 'a file with no updatedAt', file: { ...onDisk, updatedAt: 0 }, message: 'conversation updatedAt must be a string' },
    { why: 'a file whose session id is not a string', file: { ...onDisk, sdkSessionId: 7 }, message: 'conversation sdkSessionId must be a string' },
    { why: 'a file whose messages are not a list', file: { ...onDisk, messages: {} }, message: 'conversation messages must be an array' },
    { why: 'a message that is not an object', file: { ...onDisk, messages: ['hi'] }, message: 'message must be an object' },
    { why: 'a message with no id', file: { ...onDisk, messages: [{ role: 'user', createdAt: NOW, parts: [] }] }, message: 'message id must be a non-empty string' },
    {
      why: 'a message from an unknown speaker',
      file: { ...onDisk, messages: [{ id: 'm', role: 'system', createdAt: NOW, parts: [] }] },
      message: 'message role must be user or assistant, got system',
    },
    { why: 'a message with no timestamp', file: { ...onDisk, messages: [{ id: 'm', role: 'user', createdAt: 0, parts: [] }] }, message: 'message createdAt must be a string' },
    {
      why: 'a message whose parts are not a list',
      file: { ...onDisk, messages: [{ id: 'm', role: 'user', createdAt: NOW, parts: 'hi' }] },
      message: 'message parts must be an array',
    },
    { why: 'a part that is not an object', file: { ...onDisk, messages: [{ id: 'm', role: 'user', createdAt: NOW, parts: ['hi'] }] }, message: 'message part must be an object' },
    {
      why: 'a text part with no text',
      file: { ...onDisk, messages: [{ id: 'm', role: 'user', createdAt: NOW, parts: [{ type: 'text' }] }] },
      message: 'a text part must have text',
    },
    {
      why: 'a part of an unknown type',
      file: { ...onDisk, messages: [{ id: 'm', role: 'user', createdAt: NOW, parts: [{ type: 'image' }] }] },
      message: 'unknown message part type: image',
    },
    {
      why: 'a tool part with no toolUseId',
      file: { ...onDisk, messages: [{ id: 'm', role: 'assistant', createdAt: NOW, parts: [{ type: 'tool', name: 'Bash', status: 'done' }] }] },
      message: 'a tool part must have a toolUseId',
    },
    {
      why: 'a tool part with no name',
      file: { ...onDisk, messages: [{ id: 'm', role: 'assistant', createdAt: NOW, parts: [{ type: 'tool', toolUseId: 't', status: 'done' }] }] },
      message: 'a tool part must have a name',
    },
    {
      why: 'a tool part in an unknown state',
      file: { ...onDisk, messages: [{ id: 'm', role: 'assistant', createdAt: NOW, parts: [{ type: 'tool', toolUseId: 't', name: 'Bash', status: 'pending' }] }] },
      message: 'a tool part has an unknown status: pending',
    },
    {
      why: 'a tool part whose result is not text',
      file: { ...onDisk, messages: [{ id: 'm', role: 'assistant', createdAt: NOW, parts: [{ type: 'tool', toolUseId: 't', name: 'Bash', status: 'done', result: 42 }] }] },
      message: 'a tool part result must be a string',
    },
  ];

  for (const rejection of rejections) {
    test(`${rejection.why} is unreadable`, () => {
      const parsed = parseConversation(rejection.file);

      expect(parsed.ok).toBe(false);
      if (parsed.ok) return;
      expect(parsed.error.message).toBe(rejection.message);
    });
  }
});

describe('listing conversations in the sidebar', () => {
  test('the sidebar entry drops the messages, so listing does not read every message of every conversation', () => {
    const parsed = parseConversation(onDisk);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const meta = toMeta(parsed.value);

    expect(meta.title).toBe('What is in my inbox');
    expect('messages' in meta).toBe(false);
  });

  test('the most recently updated conversation is listed first', () => {
    const meta = (id: string, updatedAt: string): ConversationMeta => ({ ...toMeta(newConversation(ID, 'm', NOW)), title: id, updatedAt });
    const list = [meta('older', '2026-07-01T00:00:00.000Z'), meta('newest', '2026-07-17T00:00:00.000Z'), meta('middle', '2026-07-10T00:00:00.000Z')];

    expect([...list].sort(byMostRecentlyUpdated).map((c) => c.title)).toEqual(['newest', 'middle', 'older']);
  });
});
