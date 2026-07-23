/*
 * Who the user is, fetched once and kept.
 *
 * `my-quick-context` costs nine Graph calls and returns the things every other command
 * needs: the user's name and job, the tenant's timezone, and the ids of their inbox,
 * drive, calendar, planner and notebook. The agent used to run it once per conversation,
 * which meant paying for it again in every new thread. The app runs it instead, stores the
 * answer, and hands it to every turn.
 *
 * Process output is untrusted input, so this parser is the checkpoint: only `user.id` is
 * load-bearing, and the CLI itself documents every other field as absent when its
 * sub-call failed.
 */
export type QuickContextIds = {
  readonly primaryDriveId?: string;
  readonly inboxId?: string;
  readonly primaryCalendarId?: string;
  readonly primaryPlannerPlanId?: string;
  readonly defaultNotebookId?: string;
};

export type QuickContext = {
  readonly displayName: string;
  // What to call them in the UI. Empty when the directory gave no display name.
  readonly firstName: string;
  readonly email: string;
  readonly jobTitle?: string;
  readonly tenantTimeZone?: string;
  readonly ids: QuickContextIds;
};

// How long a stored context is trusted. Job titles and inbox ids change rarely; a week
// keeps it current without making sign-in slower.
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const stringOr = (value: unknown): string | undefined => (typeof value === 'string' && value.length > 0 ? value : undefined);

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

// Western order, which is what this tenant's directory uses ("Vincent DELACOURT"). A
// surname-first directory would need its own rule; there is no signal here to detect one,
// so guessing would be worse than taking the first word.
const firstNameOf = (displayName: string): string => displayName.trim().split(/\s+/)[0] ?? '';

const idsOf = (data: Record<string, unknown>): QuickContextIds => {
  const primaryDriveId = stringOr(data['primaryDriveId']);
  const inboxId = stringOr(data['inboxId']);
  const primaryCalendarId = stringOr(data['primaryCalendarId']);
  const primaryPlannerPlanId = stringOr(data['primaryPlannerPlanId']);
  const defaultNotebookId = stringOr(data['defaultNotebookId']);
  return {
    ...(primaryDriveId === undefined ? {} : { primaryDriveId }),
    ...(inboxId === undefined ? {} : { inboxId }),
    ...(primaryCalendarId === undefined ? {} : { primaryCalendarId }),
    ...(primaryPlannerPlanId === undefined ? {} : { primaryPlannerPlanId }),
    ...(defaultNotebookId === undefined ? {} : { defaultNotebookId }),
  };
};

export const parseQuickContext = (stdout: string): QuickContext | undefined => {
  const parsed = parseJson(stdout);
  if (!isRecord(parsed) || parsed['ok'] !== true) return undefined;
  const data = parsed['data'];
  if (!isRecord(data)) return undefined;
  const user = data['user'];
  // Without the user block there is nothing worth storing: it is the one part the CLI
  // guarantees, so its absence means the call did not really succeed.
  if (!isRecord(user) || stringOr(user['id']) === undefined) return undefined;

  const displayName = stringOr(user['displayName']) ?? '';
  const jobTitle = stringOr(user['jobTitle']);
  const tenantTimeZone = stringOr(data['tenantTimeZone']);
  return {
    displayName,
    firstName: firstNameOf(displayName),
    email: stringOr(user['mail']) ?? stringOr(user['userPrincipalName']) ?? '',
    ...(jobTitle === undefined ? {} : { jobTitle }),
    ...(tenantTimeZone === undefined ? {} : { tenantTimeZone }),
    ids: idsOf(data),
  };
};

const idLines = (ids: QuickContextIds): readonly string[] => Object.entries(ids).map(([name, value]) => `- ${name}: ${value}`);

// What rides in every system prompt. Compact on purpose: names, role, timezone, ids.
export const quickContextBlock = (context: QuickContext | undefined): string => {
  if (context === undefined) return '';
  const lines = [
    '## Who you are working for',
    '',
    `- Name: ${context.displayName}`,
    ...(context.email.length > 0 ? [`- Email: ${context.email}`] : []),
    ...(context.jobTitle === undefined ? [] : [`- Job title: ${context.jobTitle}`]),
    ...(context.tenantTimeZone === undefined ? [] : [`- Their timezone (convert every UTC timestamp to this): ${context.tenantTimeZone}`]),
    ...idLines(context.ids),
    '',
    'This is their quick context, already fetched. Do NOT run `my-quick-context` again unless something above is missing and you need it.',
  ];
  return lines.join('\n');
};

// What the app wrote last time, read back. Its own file, so the shape is known, but it is
// still a file on disk a user or a crash could have mangled.
export const parseStoredQuickContext = (value: unknown): { readonly fetchedAt: string; readonly context: QuickContext } | undefined => {
  if (!isRecord(value)) return undefined;
  const fetchedAt = stringOr(value['fetchedAt']);
  const context = value['context'];
  if (fetchedAt === undefined || !isRecord(context)) return undefined;
  const displayName = stringOr(context['displayName']) ?? '';
  const jobTitle = stringOr(context['jobTitle']);
  const tenantTimeZone = stringOr(context['tenantTimeZone']);
  return {
    fetchedAt,
    context: {
      displayName,
      firstName: stringOr(context['firstName']) ?? firstNameOf(displayName),
      email: stringOr(context['email']) ?? '',
      ...(jobTitle === undefined ? {} : { jobTitle }),
      ...(tenantTimeZone === undefined ? {} : { tenantTimeZone }),
      ids: isRecord(context['ids']) ? idsOf(context['ids']) : {},
    },
  };
};

export const isQuickContextStale = (fetchedAt: string | undefined, now: Date): boolean => {
  if (fetchedAt === undefined) return true;
  const at = Date.parse(fetchedAt);
  if (Number.isNaN(at)) return true;
  return now.getTime() - at >= STALE_AFTER_MS;
};
