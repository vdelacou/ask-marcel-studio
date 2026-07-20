---
name: answer-from-m365
description: Answer a question from the user's own Microsoft 365 by retrieving live content with the read-only ask-marcel-office CLI — Outlook mail, OneDrive and SharePoint files, the people directory, calendar, To Do and Planner, OneNote. Use for ANY factual question about their work content, even when they name no tool or source and even when they assume you cannot see their data. Triggers include asking the status of something, "catch me up on my inbox", finding or summarizing the latest document about a topic, who someone is and their number or manager, whether we heard back on something, what is on the calendar or plate, what the user committed to this week, and who reports to whom. Do NOT use it to draft or send mail (that is the draft-outlook-email skill), to schedule, or to change anything — this skill only reads.
---

# Answer a question from Microsoft 365

Thin orchestrator over `ask-marcel-office`. The core prompt already carries the CLI's nature,
the auth doctrine, `my-quick-context`, the routing table, the ground rules (newest wins, UTC
→ tenantTimeZone, `--output-path` only on body commands), and the Sources footer. This skill
is the read procedure: pick commands, follow leads, assemble a sourced answer.

## Build context before you answer

For any status / catch-up / decision question, after reading the primary source run a topic
search: `search-all-files` and `search-mail-messages` on the subject and its key nouns (the
project, the vendor, any document it names) to pull the actual deck, figures, or prior
decision. Resolve every distinct person on a thread — sender, To, and Cc — via the people
path, so the answer says who each player is, not just what they said. Search several angles
(files, mail, people) in parallel, then answer from the fuller picture, not the first email
you opened.

Loop is bounded: if a round surfaces a lead (a name, a project, a referenced doc, an
unfamiliar term), chase it from another angle — a synonym, a person, a `filetype:`, a date.
Stop after 4 rounds; name what you could not find.

## Search query rules

KQL or free text. Keywords, not sentences (`Q3 budget 2025`, `from:alice subject:invoice`,
`filetype:xlsx roadmap`).

- **Exact phrases:** put double quotes inside `--query` when word order matters
  (`'"budget allocation"'`, `'subject:"project timeline"'`).
- **Narrow `search-all-files`.** It aggregates every hit into one response (no pagination);
  a broad one-word query buries you and can crash the text output — add a `filetype:` or a
  second keyword, or re-run with `--output json`. Past ~5000 hits results truncate silently.
- Large `search-all-files` output goes to a file with a shell redirect (`> out.json`), never
  `--output-path` (it rejects the flag).

## Read an email in full

Start from any `message-id` (a mail hit's `id` is a message-id; the hit also carries
`conversationId`).

1. **List the thread:**
   ```bash
   ask-marcel-office list-conversation-messages --conversation-id '<id>' --select id,subject,from,receivedDateTime,hasAttachments,isDraft
   ```
   A subject edit mid-thread breaks the chain: if quoted history names older mails not
   listed, search the original subject or the quoted senders. An `isDraft: true` row from the
   user is an existing unsent draft (the draft skill revises that one, never a second).
2. **Read the newest with its quoted history:**
   ```bash
   ask-marcel-office convert-mail-to-markdown --message-id '<newest id>' --keep-quoted true
   ```
   One call usually returns the whole thread (replies quote history); default quote-stripping
   handles localized From/date headers. Inline images render as `[inline image: …]`
   placeholders — never `--inline-images true`. When one is content-bearing, fetch it:
   `get-mail-attachment --message-id '<id>' --attachment-id '<attId>' --output-path img.png`,
   then Read it.
3. **Attachments** (`hasAttachments` true): `list-mail-attachments`, then convert by size and
   type, or `get-mail-attachment ... --output-path att.<ext>` for large/raw files. A big or
   many-part attachment is a good candidate to hand to the `m365-reader` subagent.
4. **SharePoint links in the body:** `extract-sharepoint-links-in-mail --message-id '<id>'`
   → each returns `driveId` + `itemId` to read as a document. A link that returns
   `accessDenied` while siblings open is a per-file permission gap — name it inaccessible.

## Read a document in full

Take the right two ids from a search hit: `--item-id` is the top-level `id` (same indent as
`name`); `--drive-id` is `parentReference.driveId`. Ignore `parentReference.id` (the folder),
`listItem.id`, and `sharepointIds` — the wrong id 404s. A sharing URL resolves via
`resolve-drive-share-link --url '<url>'` → driveId + itemId + tenantId; if that tenantId is
not the user's, thread `--tenant-id` through every download/convert for that file.

Read by type:
- **PDF / CSV / text:** `download-drive-item-content --drive-id … --item-id … --output-path
  file.<ext>`, then Read it. A PDF over ~10 pages needs Read's `pages` parameter (e.g.
  `pages: "1-15"`), at most 20 pages per call — read a longer one in chunks.
- **Word / Excel / OpenDocument:** `download-drive-item-as-markdown --drive-id … --item-id …
  --include-metadata true` (surfaces comments, tracked changes, hidden text). Leave images as
  `[image: …]` placeholders — never `--inline-images true`. A scrambled Word/ODF conversion
  (scanned pages, layout to soup): fall back to `download-drive-item-as-pdf` and Read the PDF.
- **PowerPoint / layout-critical:** `download-drive-item-as-pdf … --output-path deck.pdf`,
  then Read the PDF.
- **Big / many-sheet Excel:** go sheet by sheet — `list-excel-worksheets`, then
  `get-excel-used-range --worksheet-id '<name>' --full true`. Converted sheets keep formula
  errors (`#REF!`, `#N/A`) verbatim; when a summary cell shows one, recompute from the detail
  rows and say you did. Count rows/categories with a script (`grep -c`, `awk`), never by eye.

An oversized document (long deck, many-sheet workbook, zip of scans) is exactly what the
`m365-reader` subagent is for: hand it the ids and the question, keep the summary.

## People — the commands (do not guess names)

- **You**: `my-quick-context` or `get-current-user`. **Your manager**: `get-my-manager`.
  **Someone else's manager**: `get-user-manager --user-id '<id>'`. **Your reports**:
  `list-my-direct-reports`. **Someone else's reports**: `list-user-direct-reports --user-id
  '<id>'`. **Colleagues you work with**: `list-relevant-people`. **Anyone by name**:
  `get-user` (two-step, below). There is no `get-manager` — recurse manager/reports
  commands to walk an org tree.

## People — pitfalls that change answers

- Two-step: `get-user --user-id '<name>'` returns candidates (`id, mail, jobTitle,
  department`); then `get-user --id '<guid>' --select displayName,jobTitle,department,mail,mobilePhone,businessPhones,officeLocation,userPrincipalName`
  for the full profile. Omitting `--select` silently drops `department`.
- A candidate id that is **not a GUID** is an external contact — re-query by its `mail`.
- Full profile fields ride the **elevated token**, which expires independently and cannot
  refresh headlessly. If a lookup fails or returns nothing quickly, treat it as an expired
  elevated token: tell the user to click Login in Settings; do not wait or retry into a hang.
- Directory fields (`jobTitle`, `officeLocation`, `department`) can lag reality by months —
  present them as directory values; if the user contradicts one, believe the user.
- Reporting lines are often a matrix (a solid-line and a dotted-line manager). When the
  directory `manager` is empty (common for senior staff), the real line usually lives in an
  org-chart deck on SharePoint — search for it, and say which line is solid vs dotted.

## Call-shape gotchas

- Dates are strict ISO 8601 UTC with a trailing `Z` (`2026-04-01T00:00:00Z`); relative forms
  `now`, `+21d`, `today`, `start-of-week`, `+7d` also work.
- Mail folders take Graph well-known names (`inbox`, `sentitems`, `drafts`, `deleteditems`,
  `archive`, `junkemail`), not hunted ids.
- Server-side `isRead` / `flag` filters on mail listings are unreliable (Graph is eventually
  consistent). List with a date filter + `--orderby "receivedDateTime desc"`, then read the
  fields off the rows yourself.
- `microsoft-search-query` takes only `--query` (KQL); there is no `--entity-types` — filter
  client-side on `resource.@odata.type`. For mail, `hitId` is the `messageId`.
- Teams chat and OneNote are limited: OneNote search is title-substring only, Teams chat
  content is not searchable, To Do / Planner need their direct commands (not federated search).
- Scratch files: write to absolute paths (`/tmp/…`); the shell does NOT keep its working
  directory between commands, so a `cd` then a relative path fails. Prefer the default text
  output for simple reads; use `--output json` + a parser only to extract fields.

## Answer

Lead with the current state; name who owns the next action and what the user's own option is;
resolve every person on the thread. End with the Sources footer from the core prompt, citing
page / sheet / cell and the short phrase you used wherever a claim rests on a specific figure.

---
*Verified against ask-marcel-office v2.2.0 (2026-07-20).*
