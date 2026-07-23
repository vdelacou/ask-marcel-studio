---
name: answer-from-m365
description: Answer a question from the user's own Microsoft 365 by retrieving live content with the read-only ask-marcel-office CLI, Outlook mail, OneDrive and SharePoint files, the people directory, calendar, To Do and Planner, OneNote. Use for ANY factual question about their work content, even when they name no tool or source and even when they assume you cannot see their data. Triggers include asking the status of something, "catch me up on my inbox", finding or summarizing the latest document about a topic, who someone is and their number or manager, whether we heard back on something, what is on the calendar or plate, what the user committed to this week, and who reports to whom. Do NOT use it to draft or send mail (that is the draft-outlook-email skill), to schedule, or to change anything, this skill only reads.
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
decision. Resolve every distinct person on a thread, sender, To, and Cc, via the people
path, so the answer says who each player is, not just what they said. Search several angles
(files, mail, people) in parallel, then answer from the fuller picture, not the first email
you opened.

Loop is bounded: if a round surfaces a lead (a name, a project, a referenced doc, an
unfamiliar term), chase it from another angle, a synonym, a person, a `filetype:`, a date.
Stop after 4 rounds; name what you could not find.

## Search query rules

KQL or free text. Keywords, not sentences (`Q3 budget 2025`, `from:alice subject:invoice`,
`filetype:xlsx roadmap`).

- **Exact phrases:** put double quotes inside `--query` when word order matters
  (`'"budget allocation"'`, `'subject:"project timeline"'`).
- **Narrow `search-all-files`.** It aggregates every hit into one response (no pagination);
  a broad one-word query buries you and can crash the text output, add a `filetype:` or a
  second keyword, or re-run with `--output json`. Past ~5000 hits results truncate silently.
- Large search output goes to a file with a shell redirect (`> hits.txt`), never
  `--output-path` (searches reject the flag). Extract fields with the Grep tool or
  `grep -B2 -A6 'name: <file>'` over the default text layout; never Read the redirected
  file whole back into the conversation, and treat `jq` as optional, not every machine
  has it.

## Read an email in full: delegate to `mail-reader`

Never open a thread inline. Hand the `mail-reader` agent (Agent tool) the `conversationId`,
or any one `message-id` on the thread (a mail hit's `id` is a message-id), plus the question
and the tenant time zone. It lists the thread, reads the newest message with its quoted
history, converts the attachments by type, fetches content-bearing inline images, and
resolves SharePoint links to `driveId` + `itemId`. It returns structure, key claims with
message/attachment locations and pinpoint quotes, anomalies (including any unsent draft on
the thread, which the draft skill must revise rather than duplicate), leads, and what it
could not open. Chase its leads from the main conversation: a resolved link is a document
read (below), an older mail its quotes name is a new search.

## Read a document in full: delegate to `doc-reader`

First get the file's ids from a search hit: `--item-id` is the top-level `id` (same indent
as `name`); `--drive-id` is `parentReference.driveId`. Ignore `parentReference.id` (the
folder), `listItem.id`, and `sharepointIds`, the wrong id 404s. A sharing URL needs no
resolving on your side; the reader handles it.

Never download or convert a document inline. Hand the `doc-reader` agent (Agent tool) the
two ids, or the sharing URL, or a local path, plus the question and the tenant time zone,
one agent per document, in parallel when several matter. It reads by type (deck text first,
sheet by sheet for Excel, the Read tool for PDFs and scans, zips unpacked) and returns
structure, key figures with page/sheet/cell locations and pinpoint quotes, anomalies
(recomputed formula errors, totals that do not reconcile), leads, and what it could not
open. Cite from its quotes and locations; chase its leads from the main conversation.

## People, the commands (do not guess names)

- **You**: `my-quick-context` or `get-current-user`. **Your manager**: `get-my-manager`.
  **Someone else's manager**: `get-user-manager --user-id '<id>'`. **Your reports**:
  `list-my-direct-reports`. **Someone else's reports**: `list-user-direct-reports --user-id
  '<id>'`. **Colleagues you work with**: `list-relevant-people`. **Anyone by name**:
  `get-user` (two-step, below). There is no `get-manager`, recurse manager/reports
  commands to walk an org tree.

## People, pitfalls that change answers

- Two-step: `get-user --user-id '<name>'` returns candidates (`id, mail, jobTitle,
  department`); then `get-user --id '<guid>' --select displayName,jobTitle,department,mail,mobilePhone,businessPhones,officeLocation,userPrincipalName`
  for the full profile. Omitting `--select` silently drops `department`.
- A candidate id that is **not a GUID** is an external contact, re-query by its `mail`.
- Only the full-profile path, `get-user` with a GUID / UPN / email, rides the **elevated
  token**, which expires independently and cannot refresh headlessly; preflight it with
  `scopes-check` (no Graph call, the `elevated` block reports `available`). Name-search
  `get-user`, `list-relevant-people`, `get-user-manager`, and `list-user-direct-reports` run
  on the basic token and keep working when it is cold: walk the org tree with those first,
  they already carry title, department, and mail. Only when the missing fields (phones,
  office) actually matter, tell the user to click Login in Settings; do not wait or retry
  into a hang, and never run `login` yourself.
- Directory fields (`jobTitle`, `officeLocation`, `department`) can lag reality by months,
  present them as directory values; if the user contradicts one, believe the user.
- Reporting lines are often a matrix (a solid-line and a dotted-line manager). When the
  directory `manager` is empty (common for senior staff), the real line usually lives in an
  org-chart deck on SharePoint, search for it, and say which line is solid vs dotted.
- **Role titles are org-local.** "Who is the CIO of X" can have no literal CIO: the IT chief
  may be titled "Chief Transformation Officer", "IS&T Director", or "Directeur du Système
  d'Information". The person entity of federated search matches names and company, not job
  titles, so a literal-title query surfaces name lookalikes and misses the real holder; and
  a roster whose "<role>" row is empty means the literal title is unused there, never that
  the function is vacant. Resolve the holder in this order, and do not answer before step 3:
  1. `microsoft-search-query` on the role plus the org for leads: decks, rosters, and
     especially a "<role> Office" support person (a "CIO Office Manager" hit is gold, her
     manager usually IS the holder). Collect every candidate leader named for that org.
  2. `get-user` every candidate you might name. A candidate whose directory department or
     company sits in a parent division or a region is not that org's own leadership: keep
     them out, or state their scope explicitly.
  3. Walk `get-user-manager` from the strongest candidates and from the "<role> Office"
     person until the chain leaves the function. The holder is the last person inside it:
     the CTO / CISO / infrastructure leads report to them, and they report to the org's
     head. Two or three of these one-call walks decide what no deck can. Crown the parent,
     never the child: the holder is the person those leads report TO, not the most
     senior-sounding title below them (a CTO who reports to a Chief Transformation Officer
     is not the IT chief; their boss is).
  Answer with the holder's actual directory title and its scope, noting when nobody holds
  the literal one. A meeting attendee list mixes divisions and regions and is not an org
  chart; where it conflicts with the directory, the directory wins.

## Call-shape gotchas

- Dates are strict ISO 8601 UTC with a trailing `Z` (`2026-04-01T00:00:00Z`); relative forms
  `now`, `+21d`, `today`, `start-of-week`, `+7d` also work.
- Mail folders take Graph well-known names (`inbox`, `sentitems`, `drafts`, `deleteditems`,
  `archive`, `junkemail`), not hunted ids.
- Server-side `isRead` / `flag` filters on mail listings are unreliable (Graph is eventually
  consistent). List with a date filter + `--orderby "receivedDateTime desc"`, then read the
  fields off the rows yourself.
- `microsoft-search-query` takes only `--query` (KQL); there is no `--entity-types`, filter
  client-side on `resource.@odata.type`. For mail, `hitId` is the `messageId`. It returns six
  fixed 25-hit containers (no `--top`, no `--select`) and routinely exceeds 100 KB, so
  shell-redirect it to a file and extract with a script.
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
*Verified against ask-marcel-office v2.2.0 (2026-07-23).*
