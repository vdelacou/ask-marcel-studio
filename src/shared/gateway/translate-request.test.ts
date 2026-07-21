import { describe, expect, test } from 'bun:test';
import { translateRequest } from './translate-request.ts';
import type { TranslatedRequest } from './translate-request.ts';

const ask = (over: Record<string, unknown> = {}): unknown => ({
  model: 'lmstudio::qwen2.5',
  max_tokens: 4096,
  messages: [{ role: 'user', content: [{ type: 'text', text: 'what is in my inbox' }] }],
  ...over,
});

describe('passing on what the agent asked', () => {
  test('the model reference survives, since the gateway routes on it', () => {
    const t = translateRequest(ask());

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.modelRef).toBe('lmstudio::qwen2.5');
  });

  test('a user question becomes a user message', () => {
    const t = translateRequest(ask());

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'what is in my inbox' }] }]);
  });

  test('content given as a plain string is accepted, since the wire allows it', () => {
    const t = translateRequest(ask({ messages: [{ role: 'user', content: 'hello' }] }));

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'hello' }] }]);
  });

  test('the token ceiling is carried over', () => {
    const t = translateRequest(ask({ max_tokens: 512 }));

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.maxOutputTokens).toBe(512);
  });

  test('a streaming request is marked streaming', () => {
    const t = translateRequest(ask({ stream: true }));

    expect(t.ok && t.value.stream).toBe(true);
  });

  test('a request that does not ask to stream is not streaming', () => {
    const t = translateRequest(ask());

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.stream).toBe(false);
  });
});

describe('carrying the system prompt across', () => {
  test('a plain system string is carried', () => {
    const t = translateRequest(ask({ system: 'You are terse.' }));

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.system).toBe('You are terse.');
  });

  test('the system blocks the agent sends are joined into one prompt', () => {
    // The claude_code preset sends system as blocks, not a string.
    const t = translateRequest(
      ask({
        system: [
          { type: 'text', text: 'First.' },
          { type: 'text', text: 'Second.' },
        ],
      })
    );

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.system).toBe('First.\n\nSecond.');
  });

  test('cache_control on a system block is dropped, since it means nothing upstream', () => {
    const t = translateRequest(ask({ system: [{ type: 'text', text: 'Cached.', cache_control: { type: 'ephemeral' } }] }));

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.system).toBe('Cached.');
    expect(JSON.stringify(t.value)).not.toContain('cache_control');
  });

  test('an empty system prompt is omitted rather than sent as an empty string', () => {
    const t = translateRequest(ask({ system: '' }));

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect('system' in t.value).toBe(false);
  });

  test('system blocks that carry no text at all are omitted, not sent as an empty prompt', () => {
    const t = translateRequest(ask({ system: [{ type: 'image', source: {} }] }));

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect('system' in t.value).toBe(false);
  });

  test('a system field that is neither string nor array is ignored', () => {
    const t = translateRequest(ask({ system: 42 }));

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect('system' in t.value).toBe(false);
  });

  test('a tool result with no content at all becomes empty output rather than undefined', () => {
    const t = translateRequest(
      ask({
        messages: [
          { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }] },
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1' }] },
        ],
      })
    );

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.messages[1]).toMatchObject({ content: [{ output: { type: 'text', value: '' } }] });
  });
});

describe('replaying a tool call the agent already made', () => {
  const withToolTurn = (): unknown =>
    ask({
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'list my files' }] },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me look.' },
            { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ls' } },
          ],
        },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'a.txt' }] },
      ],
    });

  test('the assistant tool_use becomes a tool-call the model recognises as its own', () => {
    const t = translateRequest(withToolTurn());

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.messages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'Let me look.' },
        { type: 'tool-call', toolCallId: 'toolu_1', toolName: 'Bash', input: { command: 'ls' } },
      ],
    });
  });

  test('the tool_result becomes its own tool-role message, not another user turn', () => {
    const t = translateRequest(withToolTurn());

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.messages[2]).toEqual({
      role: 'tool',
      content: [{ type: 'tool-result', toolCallId: 'toolu_1', toolName: 'Bash', output: { type: 'text', value: 'a.txt' } }],
    });
  });

  test('the tool result is given the name of the call it answers', () => {
    // Anthropic's result block carries only the id; the AI SDK wants the name too, so
    // it has to be remembered from the tool_use that opened it.
    const t = translateRequest(withToolTurn());

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.messages[2]).toMatchObject({ content: [{ toolName: 'Bash' }] });
  });

  test('tool output sent as blocks is flattened to text', () => {
    const t = translateRequest(
      ask({
        messages: [
          { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: {} }] },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 't1',
                content: [
                  { type: 'text', text: 'line one' },
                  { type: 'text', text: 'line two' },
                ],
              },
            ],
          },
        ],
      })
    );

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.messages[1]).toMatchObject({ content: [{ output: { type: 'text', value: 'line one\nline two' } }] });
  });

  test('a message carrying both a tool result and text splits, results first', () => {
    const t = translateRequest(
      ask({
        messages: [
          { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }] },
          {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 't1', content: 'done' },
              { type: 'text', text: 'now what' },
            ],
          },
        ],
      })
    );

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.messages.map((m) => m.role)).toEqual(['assistant', 'tool', 'user']);
  });

  test('thinking blocks are dropped, since there is nowhere upstream to put them', () => {
    const t = translateRequest(
      ask({
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'hmm' },
              { type: 'text', text: 'Answer.' },
            ],
          },
        ],
      })
    );

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.messages[0]).toEqual({ role: 'assistant', content: [{ type: 'text', text: 'Answer.' }] });
  });

  test('an assistant turn with nothing usable left is dropped rather than sent empty', () => {
    const t = translateRequest(ask({ messages: [{ role: 'assistant', content: [{ type: 'thinking', thinking: 'hmm' }] }] }));

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.messages).toEqual([]);
  });
});

describe('carrying a system message the sdk put in the array', () => {
  // Caught live: the SDK sends system-role messages INSIDE messages, not only as the
  // top-level `system` field. Refusing them 400s every real turn, which is exactly
  // what the first gateway run did.
  test('a system-role message becomes a system message rather than a bad request', () => {
    const t = translateRequest(ask({ messages: [{ role: 'system', content: [{ type: 'text', text: 'You are Claude Code.' }] }] }));

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.messages).toEqual([{ role: 'system', content: 'You are Claude Code.' }]);
  });

  test('a system message in several blocks is joined, and anything without text is dropped', () => {
    const content = ['loose', { type: 'text', text: 'Rules.' }, { type: 'text' }, { type: 'text', text: '' }, { type: 'text', text: 'More rules.' }];
    const t = translateRequest(ask({ messages: [{ role: 'system', content }] }));

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.messages).toEqual([{ role: 'system', content: 'Rules.\n\nMore rules.' }]);
  });

  test('a system message given as a plain string is carried too', () => {
    const t = translateRequest(ask({ messages: [{ role: 'system', content: 'Be terse.' }] }));

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.messages).toEqual([{ role: 'system', content: 'Be terse.' }]);
  });

  test('a system message keeps its place in the conversation order', () => {
    const t = translateRequest(
      ask({
        messages: [
          { role: 'system', content: 'Rules.' },
          { role: 'user', content: 'hi' },
        ],
      })
    );

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.messages.map((m) => m.role)).toEqual(['system', 'user']);
  });

  test('an empty system message is dropped rather than sent blank', () => {
    const t = translateRequest(ask({ messages: [{ role: 'system', content: '' }] }));

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.messages).toEqual([]);
  });
});

describe('offering the agent tools', () => {
  test('a tool keeps its name, description and schema', () => {
    const t = translateRequest(ask({ tools: [{ name: 'Bash', description: 'Run a command', input_schema: { type: 'object', properties: { command: { type: 'string' } } } }] }));

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.tools).toEqual([{ name: 'Bash', description: 'Run a command', inputSchema: { type: 'object', properties: { command: { type: 'string' } } } }]);
  });

  test('a request with no tools offers none', () => {
    const t = translateRequest(ask());

    expect(t.ok && t.value.tools).toEqual([]);
  });

  test("a tool only Anthropic's own API can run is refused, not passed on as an ordinary one", () => {
    const t = translateRequest(ask({ tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }] }));

    expect(t.ok).toBe(false);
    if (t.ok) return;
    expect(t.error.message).toContain('web_search');
  });

  test('a tool that carries a schema is an ordinary one, whatever its type says', () => {
    const t = translateRequest(ask({ tools: [{ type: 'custom', name: 'Bash', description: 'd', input_schema: { type: 'object' } }] }));

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.tools.map((x) => x.name)).toEqual(['Bash']);
  });

  test('a tool entry that is not an object is skipped rather than breaking the turn', () => {
    const t = translateRequest(ask({ tools: ['nonsense', { name: 'Bash', description: 'd', input_schema: { type: 'object' } }] }));

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.tools.map((x) => x.name)).toEqual(['Bash']);
  });

  test('a tool with no name is skipped, since there would be nothing to call', () => {
    const t = translateRequest(ask({ tools: [{ description: 'nameless' }, { name: 'Read', description: 'd', input_schema: { type: 'object' } }] }));

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.tools.map((x) => x.name)).toEqual(['Read']);
  });

  test('a tool with no schema still gets one, since the model needs a shape', () => {
    const t = translateRequest(ask({ tools: [{ name: 'Bash' }] }));

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.tools[0]).toEqual({ name: 'Bash', description: '', inputSchema: { type: 'object' } });
  });

  test('a tool_result naming a tool the conversation never opened still translates', () => {
    // The name cannot be recovered, but dropping the result would lose the output.
    const t = translateRequest(ask({ messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'orphan', content: 'out' }] }] }));

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.messages[0]).toMatchObject({ content: [{ toolName: 'unknown' }] });
  });

  test('an assistant tool_use with no id is skipped rather than sent unusable', () => {
    const t = translateRequest(ask({ messages: [{ role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: {} }] }] }));

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.messages).toEqual([]);
  });

  test('a tool_result block with no id is skipped', () => {
    const t = translateRequest(ask({ messages: [{ role: 'user', content: [{ type: 'tool_result', content: 'out' }] }] }));

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.messages).toEqual([]);
  });

  const choices: ReadonlyArray<{ readonly wire: unknown; readonly want: TranslatedRequest['toolChoice'] }> = [
    { wire: { type: 'auto' }, want: 'auto' },
    { wire: { type: 'any' }, want: 'required' },
    { wire: { type: 'tool', name: 'Bash' }, want: { type: 'tool', toolName: 'Bash' } },
  ];

  for (const { wire, want } of choices) {
    test(`a tool_choice of ${JSON.stringify(wire)} maps to ${JSON.stringify(want)}`, () => {
      const t = translateRequest(ask({ tool_choice: wire }));

      expect(t.ok).toBe(true);
      if (!t.ok) return;
      expect(t.value.toolChoice).toEqual(want);
    });
  }

  test('no tool_choice leaves the model to decide', () => {
    const t = translateRequest(ask());

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect('toolChoice' in t.value).toBe(false);
  });

  test('a tool_choice of a kind we do not know leaves the model to decide, rather than guessing', () => {
    // Anthropic has added tool_choice kinds before ('none'), and inventing a mapping
    // for one we do not understand would silently change what the model may call.
    const t = translateRequest(ask({ tool_choice: { type: 'none' } }));

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect('toolChoice' in t.value).toBe(false);
  });

  test('a tool_choice that is not an object at all leaves the model to decide', () => {
    const t = translateRequest(ask({ tool_choice: 'auto' }));

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect('toolChoice' in t.value).toBe(false);
  });

  test('a tool_choice naming no tool falls back to letting the model choose', () => {
    const t = translateRequest(ask({ tool_choice: { type: 'tool' } }));

    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.toolChoice).toBe('auto');
  });
});

describe('refusing a request that cannot be routed', () => {
  const rejections: ReadonlyArray<{ readonly why: string; readonly body: unknown }> = [
    { why: 'a body that is not an object', body: 'nonsense' },
    { why: 'a body with no model', body: { messages: [] } },
    { why: 'a body with a blank model', body: { model: '', messages: [] } },
    { why: 'a body with no messages array', body: { model: 'a::b' } },
    { why: 'a message that is not an object', body: { model: 'a::b', messages: ['hi'] } },
    { why: 'a message from an unknown role', body: { model: 'a::b', messages: [{ role: 'wizard', content: 'x' }] } },
  ];

  for (const { why, body } of rejections) {
    test(`${why} is a bad request`, () => {
      const t = translateRequest(body);

      expect(t.ok).toBe(false);
      if (t.ok) return;
      expect(t.error.kind).toBe('bad-request');
    });
  }

  // The table above proves the refusal; these two prove the caller is told WHICH
  // refusal it was. The message is the body of the 400 the gateway sends back, so a
  // wrong or empty one is a turn failing for no stated reason.
  test('a body that is not an object says that, and not something else', () => {
    const t = translateRequest('nonsense');

    expect(t.ok).toBe(false);
    if (t.ok) return;
    expect(t.error.message).toBe('the request body must be an object');
  });

  test('a body with no model names the field it wants', () => {
    const t = translateRequest({ messages: [] });

    expect(t.ok).toBe(false);
    if (t.ok) return;
    expect(t.error.message).toBe('the request needs a model');
  });
});
