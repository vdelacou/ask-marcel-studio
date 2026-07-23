import { describe, expect, test } from 'bun:test';
import { createTitleJob } from './title-job.ts';
import type { TitleJobDeps } from './title-job.ts';
import type { Conversation } from '../../../shared/types.ts';
import type { ConversationsStore } from '../store/conversations-store.ts';
import { ok, err } from '../../../shared/result.ts';
import type { Result } from '../../../shared/result.ts';
import type { ConversationMeta } from '../../../shared/types.ts';
import { toMeta } from '../../../shared/conversation-doc.ts';
import type { StoreError } from '../../../shared/ipc-contract.ts';

const ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

const conversationWith = (over: Partial<Conversation> = {}): Conversation => ({
  id: ID as Conversation['id'],
  title: 'find the b27 email',
  model: 'lvmh::deepseek-v4-pro',
  createdAt: '2026-07-24T00:00:00.000Z',
  updatedAt: '2026-07-24T00:00:00.000Z',
  messages: [
    { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'find the b27 email' }], createdAt: '2026-07-24T00:00:00.000Z' },
    { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'Hervé sent it on 15 July.' }], createdAt: '2026-07-24T00:00:01.000Z' },
  ],
  ...over,
});

// Hand-written fakes (rule 13): no SDK, no disk.
const harness = (
  options: { readonly conversation?: Conversation; readonly answer?: Result<string, string>; readonly missing?: boolean } = {}
): {
  readonly job: ReturnType<typeof createTitleJob>;
  readonly named: string[];
  readonly announced: string[];
  readonly prompts: string[];
  readonly models: (string | undefined)[];
} => {
  const named: string[] = [];
  const announced: string[] = [];
  const prompts: string[] = [];
  const models: (string | undefined)[] = [];
  const conversation = options.conversation ?? conversationWith();

  const conversations = {
    get: (): Promise<Result<Conversation, StoreError>> => Promise.resolve(options.missing === true ? err({ kind: 'not-found', message: 'gone' }) : ok(conversation)),
    setGeneratedTitle: (_id: string, title: string): Promise<Result<ConversationMeta, StoreError>> => {
      named.push(title);
      return Promise.resolve(ok(toMeta({ ...conversation, title })));
    },
  } as unknown as ConversationsStore;

  const deps: TitleJobDeps = {
    conversations,
    runAgentText: (input) => {
      prompts.push(input.prompt);
      return Promise.resolve(options.answer ?? ok('Hervé’s B27 budget figures'));
    },
    session: (preferred) => {
      models.push(preferred);
      return Promise.resolve(ok({ model: 'm', cwd: '/tmp', env: {}, hooks: {} }));
    },
    onTitle: (_id, title) => announced.push(title),
  };
  return { job: createTitleJob(deps), named, announced, prompts, models };
};

const signal = (): AbortSignal => new AbortController().signal;

describe('naming a conversation once it has said something', () => {
  test('the conversation is named after what was actually discussed', async () => {
    const { job, named, announced } = harness();

    const outcome = await job.run(ID, signal());

    expect(outcome.ok).toBe(true);
    expect(named).toEqual(['Hervé’s B27 budget figures']);
    expect(announced).toEqual(['Hervé’s B27 budget figures']);
  });

  test('it runs on the conversation’s own model, not on whatever was last used elsewhere', async () => {
    const { job, models } = harness();

    await job.run(ID, signal());

    expect(models).toEqual(['lvmh::deepseek-v4-pro']);
  });

  test('both sides of the exchange are shown to the model', async () => {
    const { job, prompts } = harness();

    await job.run(ID, signal());

    expect(prompts[0]).toContain('find the b27 email');
    expect(prompts[0]).toContain('Hervé sent it on 15 July.');
  });

  test('a conversation the user named themselves is left alone', async () => {
    const { job, named } = harness({ conversation: conversationWith({ userRenamed: true }) });

    const outcome = await job.run(ID, signal());

    expect(outcome.ok).toBe(false);
    expect(named).toEqual([]);
  });

  test('a conversation deleted while the job waited is not resurrected', async () => {
    const { job, named } = harness({ missing: true });

    expect((await job.run(ID, signal())).ok).toBe(false);
    expect(named).toEqual([]);
  });

  test('a turn that produced no words is not named after nothing', async () => {
    const quiet = conversationWith({
      messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'do the thing' }], createdAt: '2026-07-24T00:00:00.000Z' }],
    });
    const { job, named } = harness({ conversation: quiet });

    expect((await job.run(ID, signal())).ok).toBe(false);
    expect(named).toEqual([]);
  });

  test('a model that refused says nothing, and the sidebar keeps what it had', async () => {
    const { job, named } = harness({ answer: ok('I cannot name this conversation.') });

    expect((await job.run(ID, signal())).ok).toBe(false);
    expect(named).toEqual([]);
  });

  test('a failed turn is a failure, not a silent skip', async () => {
    const { job } = harness({ answer: err('the model was unreachable') });

    const outcome = await job.run(ID, signal());

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected err');
    expect(outcome.error.kind).toBe('failed');
  });
});
