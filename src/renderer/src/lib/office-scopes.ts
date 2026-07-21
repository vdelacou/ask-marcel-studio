/*
 * Microsoft Graph scopes, said in words an office employee can act on.
 *
 * The settings panel used to render `31 permissions granted`, which is a number the
 * person reading it cannot do anything with: it names neither what was granted nor
 * whether that is more than they wanted. This module turns the token's scope list into
 * one plain sentence plus an expandable, per-scope explanation.
 *
 * Unknown scopes fall back to the raw string rather than being hidden: a scope we have
 * no wording for is still something the app was granted, and silently dropping it would
 * make the list a lie.
 *
 * Pure: no react, no electron, so `bun test` runs it.
 */

export type ScopeRow = { readonly scope: string; readonly label: string };

// Graph scopes arrive either bare (`Mail.Read`) or as a full resource URI
// (`https://graph.microsoft.com/Mail.Read`). Both name the same permission.
const GRAPH_PREFIXES = ['https://graph.microsoft.com/', 'https://outlook.office.com/'];

const bareScope = (scope: string): string => {
  const matched = GRAPH_PREFIXES.find((prefix) => scope.startsWith(prefix));
  return matched === undefined ? scope : scope.slice(matched.length);
};

const FRIENDLY: Readonly<Record<string, string>> = {
  'Mail.Read': 'Read your email',
  'Mail.ReadBasic': 'Read your email',
  'Mail.ReadWrite': 'Prepare email drafts (it never sends them)',
  'Mail.Send': 'Send email as you',
  'Files.Read': 'Read your files',
  'Files.Read.All': 'Read your files in OneDrive and SharePoint',
  'Files.ReadWrite': 'Read and change your files',
  'Files.ReadWrite.All': 'Read and change your files in OneDrive and SharePoint',
  'Sites.Read.All': 'Read the SharePoint sites you have access to',
  'Sites.ReadWrite.All': 'Read and change SharePoint sites you have access to',
  'Calendars.Read': 'Read your calendar',
  'Calendars.ReadWrite': 'Read and change your calendar',
  'Contacts.Read': 'Read your contacts',
  'People.Read': 'See the people you work with most',
  'User.Read': 'Read your own profile',
  'User.ReadBasic.All': 'Look colleagues up in the company directory',
  'User.Read.All': 'Read colleague profiles in the company directory',
  'Group.Read.All': 'Read the groups and teams you belong to',
  'Tasks.Read': 'Read your tasks',
  'Tasks.ReadWrite': 'Read and change your tasks',
  'Notes.Read': 'Read your OneNote notebooks',
  'Notes.Read.All': 'Read the OneNote notebooks you have access to',
  'Chat.Read': 'Read your Teams chats',
  'ChannelMessage.Read.All': 'Read messages in your Teams channels',
  'Team.ReadBasic.All': 'See which teams you belong to',
  offline_access: 'Stay signed in so you are not asked every day',
  openid: 'Confirm who you are',
  profile: 'Read your name and photo',
  email: 'Read your email address',
};

export const friendlyScope = (scope: string): string => FRIENDLY[bareScope(scope)] ?? scope;

export const scopeRows = (scopes: readonly string[]): readonly ScopeRow[] => {
  const rows = [...new Set(scopes)].map((scope) => ({ scope, label: friendlyScope(scope) }));
  // Sorted by what the reader sees, with the raw scope breaking ties so the order is
  // stable when two scopes share a wording.
  return [...rows].sort((a, b) => a.label.localeCompare(b.label) || a.scope.localeCompare(b.scope));
};

// The order areas are named in the summary sentence: most-asked-about first, so the
// sentence reads the way someone would describe their own work day.
const AREAS: readonly { readonly noun: string; readonly prefixes: readonly string[] }[] = [
  { noun: 'mail', prefixes: ['Mail.'] },
  { noun: 'files', prefixes: ['Files.', 'Sites.'] },
  { noun: 'calendar', prefixes: ['Calendars.'] },
  { noun: 'colleagues', prefixes: ['People.', 'Contacts.', 'User.ReadBasic', 'User.Read.All', 'Group.'] },
  { noun: 'tasks', prefixes: ['Tasks.'] },
  { noun: 'notes', prefixes: ['Notes.'] },
  { noun: 'Teams chats', prefixes: ['Chat.', 'ChannelMessage.', 'Team.'] },
];

// Built by folding rather than by indexing: every index here would need an
// out-of-range fallback that no input can reach, which is a branch a test can never
// cover.
const joinNouns = (nouns: readonly string[]): string =>
  nouns.reduce((sentence, noun, index) => {
    if (index === 0) return noun;
    return index === nouns.length - 1 ? `${sentence} and ${noun}` : `${sentence}, ${noun}`;
  }, '');

export const scopesSummary = (scopes: readonly string[]): string => {
  const bare = scopes.map(bareScope);
  const nouns = AREAS.filter((area) => area.prefixes.some((prefix) => bare.some((scope) => scope.startsWith(prefix)))).map((area) => area.noun);
  // A token with none of the areas we name is still a signed-in token; say that rather
  // than claiming access to nothing.
  if (nouns.length === 0) return 'Signed in to Microsoft 365.';
  return `Marcel can read your ${joinNouns(nouns)}.`;
};
