/*
 * Naming a conversation after it has said something.
 *
 * The first message makes a poor title: it is a request, often long, sometimes only a
 * subject line. Once there is a question and an answer, a small model can say what the
 * conversation was about in a few words. That runs as a background job; this module is
 * the two pure halves of it, the asking and the reading.
 *
 * The model is asked for a title and nothing else, and is still assumed to have added a
 * preamble, quotes, a fence, or a refusal: everything it returns crosses this checkpoint
 * before it can become what the sidebar says (rule 32, model output is untrusted input).
 */
const CLIP = 1000;
const MAX_WORDS = 10;
const MAX_CHARS = 60;

const clip = (text: string, limit = CLIP): string => (text.length <= limit ? text : `${text.slice(0, limit)}…`);

export const buildTitlePrompt = (input: { readonly userText: string; readonly assistantText: string }): string =>
  [
    'Name this conversation the way a person would name it in a list.',
    '',
    'What they asked:',
    clip(input.userText),
    '',
    'What was answered:',
    clip(input.assistantText),
    '',
    'Reply with the title alone: at most ten words, no quotation marks, no trailing full stop,',
    'no preamble, and never the words "conversation", "chat" or "title". Use the language they used.',
  ].join('\n');

const FENCE_LINE = /^```.*$/;

// A fenced answer is common on the smaller models: take what is inside it.
const unfence = (raw: string): string => {
  const lines = raw.trim().split('\n');
  const opening = lines[0];
  if (opening === undefined || !FENCE_LINE.test(opening)) return raw;
  const closing = lines.at(-1) ?? '';
  const end = lines.length > 1 && FENCE_LINE.test(closing) ? lines.length - 1 : lines.length;
  return lines.slice(1, end).join('\n');
};

const QUOTES = ['"', "'", '“', '”', '«', '»'] as const;

const unwrapQuotes = (value: string): string => {
  const first = value.slice(0, 1);
  const last = value.slice(-1);
  if (value.length < 2) return value;
  const opens = QUOTES.some((quote) => quote === first);
  const closes = QUOTES.some((quote) => quote === last);
  return opens && closes ? value.slice(1, -1) : value;
};

// A model that would rather not answer says so in a sentence. That sentence is not a
// title, and a sidebar full of "I cannot" would be worse than a sidebar of first messages.
const REFUSALS = ['i cannot', 'i can not', "i can't", 'i am unable', "i'm unable", 'sorry', 'as an ai'] as const;

export const sanitizeGeneratedTitle = (raw: string): string | undefined => {
  const oneLine = unwrapQuotes(unfence(raw).replace(/\s+/g, ' ').trim());
  const withoutStop = oneLine.endsWith('.') ? oneLine.slice(0, -1).trimEnd() : oneLine;
  if (withoutStop.length === 0) return undefined;
  const lower = withoutStop.toLowerCase();
  if (REFUSALS.some((refusal) => lower.startsWith(refusal))) return undefined;

  const words = withoutStop.split(' ');
  const clipped = words.length <= MAX_WORDS ? withoutStop : words.slice(0, MAX_WORDS).join(' ');
  return clipped.length <= MAX_CHARS ? clipped : `${clipped.slice(0, MAX_CHARS - 1).trimEnd()}…`;
};
