/*
 * What a tool call is actually doing, said in words.
 *
 * The card used to show the tool's own name — `Bash`, `Grep`, `mcp__x__y` — which tells
 * an office employee nothing about whether the agent is reading their inbox or deleting
 * a file. The tool name still shows, small, beside the label, because someone
 * technical will want it; the sentence is what the card leads with.
 *
 * Bash is the important case: the agent supplies its own `description` for every bash
 * call ("Read the last 5 emails"), so the best label is usually already in the input.
 *
 * Pure: no react, no electron, and no node:path (this runs in the browser bundle).
 */

const LABEL_LIMIT = 60;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

// A non-empty trimmed string field, or nothing. Tool inputs are the model's own JSON:
// a field can be absent, null, or a number, and none of that should throw.
const field = (input: unknown, key: string): string | undefined => {
  if (!isRecord(input)) return undefined;
  const value = input[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const truncate = (label: string): string => (label.length <= LABEL_LIMIT ? label : `${label.slice(0, LABEL_LIMIT - 1).trimEnd()}…`);

// The last segment of a path, on either platform's separator. A path that is nothing
// but separators has no name to show, so the whole thing is used.
const fileName = (path: string): string =>
  path
    .split(/[\\/]/)
    .filter((segment) => segment.length > 0)
    .at(-1) ?? path;

// URL.parse returns null instead of throwing, so this needs no try/catch (the same
// reason settings-doc uses it).
const hostOf = (url: string): string | undefined => URL.parse(url)?.hostname;

// `mcp__gmail__send_message` is a wire name, not a sentence. Its last segment, with the
// separators opened out, is close enough to one.
const MCP_PREFIX = 'mcp__';
const prettifyName = (name: string): string => {
  if (!name.startsWith(MCP_PREFIX)) return name;
  const segments = name.slice(MCP_PREFIX.length).split('__');
  const tool = segments.at(-1);
  if (tool === undefined || tool.length === 0) return name;
  return `Using ${tool.replace(/[-_]+/g, ' ')}`;
};

const named = (path: string | undefined, verb: string, fallback: string): string => (path === undefined ? fallback : `${verb} ${fileName(path)}`);

const quoted = (term: string | undefined, prefix: string, fallback: string): string => (term === undefined ? fallback : `${prefix} “${term}”`);

// The badge beside the label: the tool's own wire name, except for the one that matters
// to a person. A bash call that runs the Microsoft 365 CLI is not "Bash" to the user, it
// is the app asking their mailbox something, and half the cards in a normal conversation
// are exactly that.
const OFFICE_CLI = /(^|[\s;&|(/])ask-marcel-office(\s|$)/;

export const toolBadge = (name: string, input: unknown): string => {
  if (name !== 'Bash') return name;
  const command = field(input, 'command');
  return command !== undefined && OFFICE_CLI.test(command) ? 'Ask Marcel Command' : name;
};

export const toolLabel = (name: string, input: unknown): string => {
  switch (name) {
    case 'Bash':
      // The agent writes this itself, in the user's language, for every bash call.
      return truncate(field(input, 'description') ?? 'Running a command');
    case 'Read':
      return truncate(named(field(input, 'file_path'), 'Reading', 'Reading a file'));
    case 'Write':
      return truncate(named(field(input, 'file_path'), 'Creating', 'Creating a file'));
    case 'Edit':
    case 'MultiEdit':
      return truncate(named(field(input, 'file_path'), 'Editing', 'Editing a file'));
    case 'NotebookEdit':
      return 'Editing a notebook';
    case 'Grep':
      return truncate(quoted(field(input, 'pattern'), 'Searching for', 'Searching your files'));
    case 'Glob':
      return 'Looking for files';
    // Withdrawn (see WITHDRAWN_TOOLS): no new turn can produce one. Kept so the
    // conversations that already contain a search still read as sentences.
    case 'WebSearch':
      return truncate(quoted(field(input, 'query'), 'Searching the web for', 'Searching the web'));
    case 'WebFetch': {
      const url = field(input, 'url');
      const host = url === undefined ? undefined : hostOf(url);
      return truncate(host === undefined ? 'Reading a web page' : `Reading ${host}`);
    }
    case 'Skill': {
      const skill = field(input, 'skill') ?? field(input, 'command') ?? field(input, 'name');
      return truncate(skill === undefined ? 'Using a skill' : `Using the ${skill} skill`);
    }
    // The SDK has named this tool both ways across versions.
    case 'Task':
    case 'Agent': {
      const description = field(input, 'description');
      if (description !== undefined) return truncate(description);
      const helper = field(input, 'subagent_type');
      return truncate(helper === undefined ? 'Asking an agent' : `Asking the ${helper} agent`);
    }
    case 'TodoWrite':
      return 'Organising the steps';
    default:
      return truncate(prettifyName(name));
  }
};
