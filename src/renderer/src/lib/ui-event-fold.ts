/*
 * Applies the UIEvent stream to what the chat screen shows. The renderer-side
 * mirror of sdk-event-fold, and pure for the same reason: it is the whole
 * correctness surface of the live transcript, so it is unit-tested rather than
 * poked at through the DOM.
 *
 * Events are broadcast to the window, not addressed to a view, so every event is
 * checked against the conversation on screen first. A turn still running in the
 * background must never write into the conversation the user switched to.
 */
import type { TurnUsage, UIEvent } from '../../../shared/ipc-contract.ts';
import type { Message, MessagePart } from '../../../shared/types.ts';

// One thing a subagent did, shown nested under the tool call that spawned it. No
// result body: the step list says what was done and whether it worked, and the
// subagent's own conclusion arrives as the spawning tool's result.
export type SubagentStep = {
  readonly toolUseId: string;
  readonly name: string;
  readonly input: unknown;
  readonly status: 'running' | 'done' | 'error';
};

export type ChatView = {
  readonly conversationId?: string;
  readonly title: string;
  readonly messages: readonly Message[];
  readonly isStreaming: boolean;
  readonly error?: string;
  readonly lastUsage?: TurnUsage;
  // Keyed by the tool call that spawned the subagent. Live only, never persisted:
  // this is how a delegated job is watched, not how it is recorded.
  readonly subagentSteps?: Readonly<Record<string, readonly SubagentStep[]>>;
};

export const emptyChat = (conversationId?: string): ChatView => ({
  ...(conversationId === undefined ? {} : { conversationId }),
  title: '',
  messages: [],
  isStreaming: false,
});

const appendText = (parts: readonly MessagePart[], delta: string): readonly MessagePart[] => {
  const last = parts.at(-1);
  if (last?.type === 'text') return [...parts.slice(0, -1), { type: 'text', text: last.text + delta }];
  return [...parts, { type: 'text', text: delta }];
};

// Rewrites one message's parts in place, leaving every other message alone.
const patchMessage = (view: ChatView, messageId: string, patch: (parts: readonly MessagePart[]) => readonly MessagePart[]): ChatView => {
  // A message we never saw start: drop rather than invent a bubble out of order.
  if (!view.messages.some((m) => m.id === messageId)) return view;
  return { ...view, messages: view.messages.map((m) => (m.id === messageId ? { ...m, parts: patch(m.parts) } : m)) };
};

export const applyUIEvent = (view: ChatView, event: UIEvent): ChatView => {
  if (view.conversationId !== undefined && event.conversationId !== view.conversationId) return view;

  switch (event.type) {
    case 'turn-start':
      return {
        ...view,
        // A new turn clears the last one's error: the user is watching this one now.
        error: undefined,
        isStreaming: true,
        messages: [...view.messages, { id: event.messageId, role: 'assistant', parts: [], createdAt: '' }],
      };

    case 'text-delta':
      return patchMessage(view, event.messageId, (parts) => appendText(parts, event.delta));

    case 'tool-start':
      return patchMessage(view, event.messageId, (parts) => [...parts, { type: 'tool', toolUseId: event.toolUseId, name: event.name, input: event.input, status: 'running' }]);

    case 'tool-result':
      return patchMessage(view, event.messageId, (parts) =>
        parts.map((p) => (p.type === 'tool' && p.toolUseId === event.toolUseId ? { ...p, status: event.isError ? 'error' : 'done', result: event.result } : p))
      );

    case 'subagent-tool-start': {
      const steps = view.subagentSteps?.[event.parentToolUseId] ?? [];
      return {
        ...view,
        subagentSteps: { ...view.subagentSteps, [event.parentToolUseId]: [...steps, { toolUseId: event.toolUseId, name: event.name, input: event.input, status: 'running' }] },
      };
    }

    case 'subagent-tool-result': {
      const steps = view.subagentSteps?.[event.parentToolUseId];
      // A step we never saw start, same rule as the ghost tool result above.
      if (steps === undefined) return view;
      return {
        ...view,
        subagentSteps: {
          ...view.subagentSteps,
          [event.parentToolUseId]: steps.map((step) => (step.toolUseId === event.toolUseId ? { ...step, status: event.isError ? 'error' : 'done' } : step)),
        },
      };
    }

    case 'turn-done':
      return { ...view, isStreaming: false, lastUsage: event.usage };

    case 'error':
      return { ...view, isStreaming: false, error: event.message };

    case 'title':
      return { ...view, title: event.title };

    default:
      return view;
  }
};

// The user's own message, shown immediately rather than waiting for the turn to end.
// The runtime persists the real one; this is the optimistic echo.
export const appendUserMessage = (view: ChatView, id: string, text: string, createdAt: string): ChatView => ({
  ...view,
  error: undefined,
  messages: [...view.messages, { id, role: 'user', parts: [{ type: 'text', text }], createdAt }],
});
