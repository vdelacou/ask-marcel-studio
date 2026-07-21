/*
 * The guardrail on the agent's shell.
 *
 * The agent has a real shell in a real home directory, which is what makes it useful
 * and also what makes "tidy up those files" a sentence that could delete a career's
 * worth of documents. This decides, before a command runs, whether it is one of the
 * few shapes that can do irreversible damage outside the conversation's scratch folder.
 *
 * The principle is containment, not paranoia: deleting inside the workspace is the
 * agent's own business, and anything that is not a recognised destructive shape is
 * allowed. There is no approval prompt anywhere in this app, so a refusal has to be
 * rare enough never to block ordinary work, and specific enough to explain in a
 * sentence.
 *
 * It is conservative about what it cannot read: a command that computes part of itself
 * is refused when a destructive verb appears anywhere in it, and an unknown working
 * directory makes every relative path unprovable.
 *
 * Accepted residual risk: shell redirection. `> file` truncates without naming a verb
 * this can recognise, and parsing every redirection form reliably is not something a
 * hand-rolled scanner can promise.
 *
 * Pure: node:path is manipulation, not IO (rule 20), so `bun test` covers all of it.
 */
import { isAbsolute, relative, resolve } from 'node:path';
import { isCategoryEnabled } from './office-policy.ts';

export type BashGuardPolicy = {
  // The conversation's scratch folder, which is also the agent's working directory.
  readonly workspaceDir: string;
  readonly disabledOfficeCategories: readonly string[];
  // Microsoft 365 command name to its category, from the CLI's own catalog.
  readonly officeCommandCategories: ReadonlyMap<string, string>;
};

export type BashGuardVerdict = { readonly allow: true } | { readonly allow: false; readonly reason: string };

const ALLOW: BashGuardVerdict = { allow: true };
const deny = (reason: string): BashGuardVerdict => ({ allow: false, reason });

const DELETE_VERBS = ['rm', 'rmdir', 'unlink', 'shred'];
const PRIVILEGE = ['sudo', 'doas'];
const SYSTEM_TOOLS = ['diskutil', 'csrutil', 'launchctl', 'nvram', 'bless', 'shutdown', 'reboot', 'halt', 'fdisk'];
// Filesystem builders come as a family (mkfs.ext4, newfs_hfs), so they match by prefix.
const FORMAT_TOOL_PREFIXES = ['mkfs', 'newfs'];
const PERMISSION_TOOLS = ['chmod', 'chown', 'chgrp'];
const SHELLS = ['sh', 'bash', 'zsh', 'dash'];
// Words that stand in front of the real command without changing what it does.
const WRAPPERS = ['command', 'builtin', 'exec', 'nohup', 'time', 'env'];
const OFFICE_CLI = 'ask-marcel-office';
// Never available to the agent whatever the policy says: signing in is something the
// user does in Settings, so the browser window belongs to them, not to a turn.
const OFFICE_AUTH = ['login', 'logout'];

// Anything a substitution could be hiding that this module would otherwise refuse.
const OPAQUE_DENY_WORDS = [...DELETE_VERBS, ...PRIVILEGE, ...SYSTEM_TOOLS, ...FORMAT_TOOL_PREFIXES, 'dd'];

const SUBSTITUTION_HINT = 'run it as a plain command, without command substitution, so it can be checked';
const CONTINUE_HINT = 'Explain this to the user in plain words and carry on another way.';

type Segment = {
  readonly words: readonly string[];
  // The segment used `$( )` or backticks, so its real arguments are not knowable here.
  readonly opaque: boolean;
};

const SEPARATORS = ['&', '|', ';', '\n', '(', ')', '{', '}'];

// A quote-aware split into the pieces the shell would run one after another. Anything
// this cannot read confidently is marked opaque rather than guessed at.
const splitSegments = (command: string): readonly Segment[] => {
  const segments: Segment[] = [];
  let words: string[] = [];
  let word = '';
  let opaque = false;
  let quote: "'" | '"' | undefined;

  const endWord = (): void => {
    if (word.length > 0) words.push(word);
    word = '';
  };
  const endSegment = (): void => {
    endWord();
    segments.push({ words, opaque });
    words = [];
    opaque = false;
  };

  for (const [at, character] of [...command].entries()) {
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
      // A substitution is literal text inside single quotes and a real command inside
      // double ones, so only the second kind hides anything.
      else if (quote === '"' && character === '$' && command[at + 1] === '(') opaque = true;
      else word += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === '`' || (character === '$' && command[at + 1] === '(')) {
      opaque = true;
      word += character;
      continue;
    }
    if (SEPARATORS.includes(character)) {
      endSegment();
      continue;
    }
    if (character === ' ' || character === '\t') {
      endWord();
      continue;
    }
    word += character;
  }
  endSegment();
  return segments.filter((segment) => segment.words.length > 0);
};

const isAssignment = (word: string): boolean => /^[A-Za-z_]\w*=/.test(word);

const isFlag = (word: string): boolean => word.startsWith('-');

// Strips the words that stand in front of the real command: environment assignments,
// wrappers, and `nice -n 5`.
const realWords = (words: readonly string[]): readonly string[] => {
  let at = 0;
  while (at < words.length) {
    const word = words[at] ?? '';
    if (isAssignment(word) || WRAPPERS.includes(word)) {
      at += 1;
      continue;
    }
    if (word === 'nice') {
      at += 1;
      // `nice -n 5 cmd` and `nice -n5 cmd` both put the real command after the flags.
      while (at < words.length && isFlag(words[at] ?? '')) at += words[at] === '-n' ? 2 : 1;
      continue;
    }
    break;
  }
  return words.slice(at);
};

const isProvablyInside = (policy: BashGuardPolicy, cwd: string | undefined, target: string): boolean => {
  // An unknown working directory makes every relative path unknowable.
  if (cwd === undefined) return false;
  // `~` is the home directory and `$VAR` is anything at all: neither can be resolved
  // here, so neither is provably inside.
  if (target.startsWith('~') || target.includes('$')) return false;

  // The workspace itself relativises to '', which starts with neither '..' nor a root,
  // so it needs no special case.
  const rel = relative(policy.workspaceDir, resolve(cwd, target));
  return !rel.startsWith('..') && !isAbsolute(rel);
};

const operandsOf = (words: readonly string[]): readonly string[] => words.slice(1).filter((word) => !isFlag(word));

const outsideTarget = (policy: BashGuardPolicy, cwd: string | undefined, targets: readonly string[]): string | undefined =>
  targets.find((target) => !isProvablyInside(policy, cwd, target));

const officeVerdict = (policy: BashGuardPolicy, words: readonly string[]): BashGuardVerdict => {
  const at = words.findIndex((word) => word === OFFICE_CLI || word.endsWith(`/${OFFICE_CLI}`));
  if (at === -1) return ALLOW;

  const subcommand = words.slice(at + 1).find((word) => !isFlag(word));
  if (subcommand === undefined) return ALLOW;
  if (OFFICE_AUTH.includes(subcommand)) {
    return deny('signing in to Microsoft 365 is something the user does in Settings, never from a command. Ask them to open Settings and click Sign in.');
  }

  const category = policy.officeCommandCategories.get(subcommand);
  // A command the catalog does not know cannot be placed in a category, and refusing
  // everything unrecognised would break the CLI's own help and version commands.
  if (category === undefined) return ALLOW;
  if (isCategoryEnabled({ disabledCategories: policy.disabledOfficeCategories }, category)) return ALLOW;
  return deny(`the user has switched off ${category} access to Microsoft 365 in Settings, so this command is not available. ${CONTINUE_HINT}`);
};

const findVerdict = (policy: BashGuardPolicy, cwd: string | undefined, words: readonly string[]): BashGuardVerdict => {
  const destructive = words.includes('-delete') || (words.includes('-exec') && words.some((word) => DELETE_VERBS.includes(word)));
  if (!destructive) return ALLOW;

  // Every path-shaped argument counts as somewhere it could delete from. find's grammar
  // puts the roots first, but a pattern can name a path too, and being wrong in the
  // permissive direction here is the one that loses files.
  const outside = outsideTarget(policy, cwd, operandsOf(words));
  if (outside === undefined) return ALLOW;
  return deny(`this would delete files under ${outside}, which is outside this conversation's own folder. ${CONTINUE_HINT}`);
};

const ddVerdict = (policy: BashGuardPolicy, cwd: string | undefined, words: readonly string[]): BashGuardVerdict => {
  const output = words.find((word) => word.startsWith('of='))?.slice(3);
  if (output === undefined) return ALLOW;
  if (output.startsWith('/dev/')) return deny(`writing to ${output} would overwrite a disk. ${CONTINUE_HINT}`);
  if (isProvablyInside(policy, cwd, output)) return ALLOW;
  return deny(`this would overwrite ${output}, which is outside this conversation's own folder. ${CONTINUE_HINT}`);
};

const permissionVerdict = (policy: BashGuardPolicy, cwd: string | undefined, words: readonly string[]): BashGuardVerdict => {
  if (!words.some((word) => word === '-R' || word === '-r' || word === '--recursive')) return ALLOW;
  // The first operand is the mode or the owner, not a path.
  const outside = outsideTarget(policy, cwd, operandsOf(words).slice(1));
  if (outside === undefined) return ALLOW;
  return deny(`this would change permissions across ${outside}, which is outside this conversation's own folder. ${CONTINUE_HINT}`);
};

// A command that computes part of itself cannot be read here at all: the paths only
// exist once it has run. So when any part of it is a substitution, the whole line is
// searched for a destructive verb and refused if one appears anywhere in it. That
// refuses some harmless lines too (`rm -rf "$(pwd)/build"`), which is the trade this
// module states up front: the alternative is guessing.
const opaqueVerdict = (command: string, segments: readonly Segment[]): BashGuardVerdict => {
  if (!segments.some((segment) => segment.opaque)) return ALLOW;
  // Split into words and checked by membership rather than by a regex built from the
  // verb: same answer, and nothing here constructs a pattern at runtime.
  const words = new Set(command.split(/[^A-Za-z0-9_.-]+/));
  const hit = OPAQUE_DENY_WORDS.find((verb) => words.has(verb));
  if (hit === undefined) return ALLOW;
  return deny(`this hides part of the command inside a substitution and mentions ${hit}, which cannot be checked. ${SUBSTITUTION_HINT}. ${CONTINUE_HINT}`);
};

const MAX_SHELL_DEPTH = 3;

const evaluate = (command: string, policy: BashGuardPolicy, depth: number): BashGuardVerdict => {
  const segments = splitSegments(command);
  const opaque = opaqueVerdict(command, segments);
  if (!opaque.allow) return opaque;

  let cwd: string | undefined = policy.workspaceDir;
  for (const segment of segments) {
    const words = realWords(segment.words);
    // Empty only when the whole segment was wrapper words; no rule matches '' either way.
    const [head = ''] = words;

    const office = officeVerdict(policy, words);
    if (!office.allow) return office;

    if (PRIVILEGE.includes(head)) return deny(`commands run as an administrator are never available here. ${CONTINUE_HINT}`);
    if (SYSTEM_TOOLS.includes(head) || FORMAT_TOOL_PREFIXES.some((prefix) => head.startsWith(prefix)))
      return deny(`${head} changes the machine itself and is not available here. ${CONTINUE_HINT}`);

    if (SHELLS.includes(head) && depth < MAX_SHELL_DEPTH) {
      // `sh -c '<string>'`: the string is the real command.
      const flagAt = words.findIndex((word, index) => index > 0 && word.startsWith('-') && word.includes('c'));
      const inner = flagAt === -1 ? undefined : words[flagAt + 1];
      if (inner !== undefined) {
        const nested = evaluate(inner, policy, depth + 1);
        if (!nested.allow) return nested;
      }
    }

    if (head === 'cd') {
      const target = operandsOf(words)[0];
      // A bare `cd`, `cd -`, `cd ~` or `cd $DIR` all land somewhere this cannot name,
      // and from then on no relative path in the line is provable.
      cwd = target === undefined || target === '-' || target.startsWith('~') || target.includes('$') || cwd === undefined ? undefined : resolve(cwd, target);
      continue;
    }

    // Paths handed in on stdin cannot be checked, so a deletion driven by xargs is
    // refused whatever its arguments look like.
    if (head === 'xargs') {
      const inner = words.slice(1).find((word) => !isFlag(word));
      if (inner !== undefined && DELETE_VERBS.includes(inner)) {
        return deny(`this deletes whatever another command produced, which cannot be checked. List the files first, then delete them by name. ${CONTINUE_HINT}`);
      }
      continue;
    }

    if (DELETE_VERBS.includes(head)) {
      const outside = outsideTarget(policy, cwd, operandsOf(words));
      if (outside !== undefined) return deny(`this would delete ${outside}, which is outside this conversation's own folder. ${CONTINUE_HINT}`);
      continue;
    }

    if (head === 'find') {
      const verdict = findVerdict(policy, cwd, words);
      if (!verdict.allow) return verdict;
      continue;
    }

    if (head === 'dd') {
      const verdict = ddVerdict(policy, cwd, words);
      if (!verdict.allow) return verdict;
      continue;
    }

    if (PERMISSION_TOOLS.includes(head)) {
      const verdict = permissionVerdict(policy, cwd, words);
      if (!verdict.allow) return verdict;
    }
  }

  return ALLOW;
};

export const evaluateBashCommand = (command: string, policy: BashGuardPolicy): BashGuardVerdict => evaluate(command, policy, 0);
