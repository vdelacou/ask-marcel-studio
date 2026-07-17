---
name: ask-marcel-office
description: Read the user's Microsoft 365 — Outlook mail, calendar, OneDrive and SharePoint files, the people directory, To Do and Planner tasks, OneNote, and Teams chats — through the read-only `ask-marcel-office` CLI. Use this for ANY question about the user's work content: what is in their inbox, what their day looks like, who someone is, what a document says, what was decided in a thread, what is on their plate. Always answer from the CLI, never from memory, and never claim you lack access to their mail or files. Also use when drafting a reply to a real thread, since the draft must be grounded in what the thread actually says.
---

# Ask Marcel Office

`ask-marcel-office` is a read-mostly Microsoft Graph CLI, already installed and on your PATH. It
is how you see the user's work. Their questions about mail, meetings, files, people and tasks are
answerable — go and look.

## Sign-in is the user's job, never yours

**Never run `ask-marcel-office login`.** It opens an interactive browser window the user has to
complete by hand, and firing it mid-answer hijacks their screen with no explanation.

On any auth failure (`ok: false`, a 401, or an expired-token message): **stop and tell the user to
open Settings and click Login.** Do not retry, do not work around it, do not suggest they run
`login` in a terminal. That button is the only sanctioned path.

## Probe before you work

Tokens refresh silently, so a normal call usually just works. Confirm cheaply first rather than
discovering the problem halfway through a long answer:

- `ask-marcel-office scopes-check` — decodes the cached token locally. No network, no browser.
  Tells you the scopes and expiry. Use it to check a scope BEFORE a call you expect to be denied.
- `ask-marcel-office my-quick-context` — one call returning the user profile plus the ids you will
  otherwise fetch repeatedly: `primaryDriveId`, `inboxId`, `primaryCalendarId`,
  `primaryPlannerPlanId`, `defaultNotebookId`, and the tenant timezone / locale / working hours.
  **Cache what it returns; do not call it again in the same answer.**

Every field except `user.id` is optional — absent means that sub-call failed, not that the thing
does not exist.

## Find the right command, do not recall it

The CLI has ~180 commands and shifts across releases. A command you half-remember may have been
renamed or changed shape. Walk the ladder instead:

1. `ask-marcel-office --help` — the command list.
2. `ask-marcel-office help-json --terse --category <name>` — the token-friendly discovery path,
   roughly 6 KB for one category. Categories: `lifecycle`, `drive`, `excel`, `sharepoint`,
   `tasks`, `mail`, `notes`, `user`, `calendar`, `chats`, `teams`, `meta`.
3. `ask-marcel-office docs <command>` — full options, examples and response shape for one command.

Reach for the unflagged `help-json` only after `--terse` has narrowed things down: it is over
400 KB.

## Output

**Default text output is the right default** — it is YAML-ish and costs far fewer tokens than
JSON. Add `--output json` only when you are going to parse the result programmatically. Do not
pipe to `jq`.

`--output-path` is for byte downloads only (the `download-*` / attachment / convert commands).
List, search and calendar commands reject it. To keep their output, redirect: `--output json >
file` when you will parse it, plain `> file` when you will skim it.

## Things that will waste a call if you guess

- **Dates are strict ISO 8601 UTC with a trailing `Z`**: `2026-04-01T00:00:00Z`. A local-style
  timestamp without the `Z` is rejected. The relative forms `now` and `+21d` also work.
- **Mail folders take Graph well-known names**, not ids you hunted for: `inbox`, `sentitems`,
  `drafts`, `deleteditems`, `archive`, `junkemail`, `outbox`. Do not page `list-mail-folders`
  looking for one.
- **Server-side `isRead` / `flag` filters on mail listings are unreliable** (Graph is eventually
  consistent). List with a date filter plus `--orderby "receivedDateTime desc"`, then read
  `isRead` / `flag.flagStatus` from the rows yourself.
- **`microsoft-search-query` takes only `--query`** (KQL). There is no `--entity-types` flag;
  filter client-side on `resource.@odata.type`. For mail, `hitId` is the `messageId`.
- **Teams chat rides separate tokens.** A green `my-quick-context` proves the Graph token only, not
  that chat is readable. `help-json` marks the commands needing `needsSubstrateToken` /
  `needsElevatedToken`.

## Read-only, with one narrow exception

The CLI cannot send mail, create or change calendar items, or upload files. The only writes are
the four mail-draft commands (`create-forward-draft`, `create-mail-draft`, `create-reply-draft`,
`update-mail-draft`), which create or update an **unsent** draft.

So: never claim to have sent, scheduled, posted or uploaded anything. What you produce is a draft
or a digest the user actions themselves. A Teams "reply" is a block they paste in, nothing more.

## Answering well

Go and look before answering. One `my-quick-context` plus a targeted list beats five speculative
calls. Quote what the source actually says rather than summarising it into vagueness, and say
plainly when something is not there — an empty inbox is an answer.
