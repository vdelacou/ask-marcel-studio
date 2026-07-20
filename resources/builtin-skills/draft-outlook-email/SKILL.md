---
name: draft-outlook-email
description: Prepare an UNSENT Outlook draft — a reply, a forward, or a new mail — grounded in the user's own Microsoft 365 via the ask-marcel-office CLI. Use when the user asks to reply to a thread, forward something, or write, prepare, or draft an email. Triggers include "reply to X saying…", "draft a reply to that thread", "forward this to Z", "prepare an email to Y", and drafting a reply to the oldest email still waiting on the user. The draft ALWAYS stays unsent in Outlook Drafts — the CLI can never send, and the user reviews and sends in Outlook. Do NOT use this skill to answer a question or read content (that is answer-from-m365); use it only when the deliverable is a draft.
---

# Draft an Outlook email

The CLI's only write is an UNSENT draft (reply, forward, or new mail). It cannot send and
cannot delete a draft (the user removes one in Outlook). Read anything you need to ground the
draft with the read procedure (answer-from-m365); this skill is the write.

## Approval first

Dictated vs composed turns on who wrote the *words*, not who set the intent. Text the user
handed you verbatim is dictated → create immediately. If the user gave the gist and left you
to write the prose ("reply saying I agree", "tell them yes", "write it properly"), the reply
is **composed** → show the exact body text and get a yes BEFORE creating. Never create a
draft whose wording the user has not seen. If the reply's substance does not rest on a thread
attachment or linked doc, you may leave it unread — but name that skip when you show the body.

Because the CLI cannot delete a draft, a created draft stays in Outlook until the user removes
it — one more reason not to create before approval, and not to create duplicates.

## Draft to the right person

Decide who owns the response — the same "whose move is it" read as a catch-up. If the user
owns it, reply on the thread. If a colleague owns it, draft an internal mail to that owner
(delegating or aligning) instead of answering the outside sender directly. Whoever you named
as owner is who the draft goes to. Never assert a reporting line or team ownership in the
wording ("my team", "your team") without checking it via the people path — presence on the
same thread is not a reporting line.

## Write in the user's voice

Before composing anything you wrote (not dictated), study one or two of the user's own recent
SENT messages — greeting, sign-off, sentence length, formality. Once per session is enough.

```bash
ask-marcel-office search-mail-messages --query 'from:me to:<recipient>'   # same person; or drop to: and add the topic
ask-marcel-office list-mail-folder-messages --mail-folder-id sentitems --top 10 --select id,subject,toRecipients,sentDateTime
```

Skip the noise: meeting auto-responses and invites (`@odata.type: eventMessageResponse` /
`eventMessageRequest`; subjects starting `Accepted:/Declined:/Tentative:`) and one-line acks
teach nothing — filter on the visible `@odata.type` before opening. A `from:me` hit is not
proof of authorship: check the `From:` line before mirroring. Then `convert-mail-to-markdown`
a good sample and mirror its voice. Compose in the language the *recipient* uses on the
thread (a thread can mix languages across branches; match the person the draft goes to). Make
the reply move the recipient's ask forward with the concrete details from your topic search,
not a bare acknowledgement — and promise only what you have confirmed exists.

## HTML body format

Wrap the body in `font-family:Aptos,Aptos_EmbeddedFont,Aptos_MSFontService,Calibri,Helvetica,sans-serif; font-size:11pt`
(repeat it on any `<table>` and its cells). Outlook normalizes bare `<p>` to `margin:0cm`, so
author each paragraph as `<p style="margin:0cm">…</p>` followed by a `<div><br></div>` spacer
(Outlook's blank-line idiom), including after lists and tables.

## Reply — always to the thread's NEWEST message

List the thread and take the max `receivedDateTime`; read it first so the reply answers the
actual ask (a reply threaded under a superseded message misleads everyone).

```bash
ask-marcel-office list-conversation-messages --conversation-id '<id>' --select id,subject,from,receivedDateTime,isDraft
ask-marcel-office create-reply-draft --reply-to-message-id '<newest id>' --body-content '<reply text>'
```

Reply-ALL by default (recipients, `RE:` subject, quoted history inherited); pass
`--reply-all false` for sender-only. On `create-reply-draft` / `create-forward-draft`,
`--body-content` fills the text ABOVE the quote (Graph's `comment`) and the command inserts
the `<hr>` divider itself, below your comment; pass `--body-content-type HTML` for markup —
the quoted thread stays byte-identical. So the saved body reads: your comment, then the
`<hr>` divider, then the quoted history — your comment leads.

**Forward:** `create-forward-draft --forward-message-id '<id>' --to-recipients 'a@x,b@y'
--body-content '<comment>'` (`--to-recipients` required; `FW:` subject and quote inherited).

**New mail:** `create-mail-draft --subject '<s>' --body-content '<body>' --to-recipients 'a@x'`
(optional `--cc-recipients`, `--bcc-recipients`, `--importance`, `--body-content-type HTML`).

## Signature

Graph-created drafts carry none. When the user wants one (or the draft is outward-facing):

```bash
ask-marcel-office get-mail-signature --output-path sig.html
```

It returns the user's signature block with logo and booking images already inlined as
self-contained base64 `data:` URIs. Append the block WHOLE — do not strip the `<img>` tags;
the images are self-contained and paste into a fresh draft without breaking. The block is
large (~55 KB, one endless line), so fetch it ONCE per session with `--output-path`, reuse
that file, and build each signed body blind: `cat body.html sig.html > reply.html`. (Caveat:
`data:` images render in Outlook web and most clients but Outlook desktop may block them; the
"Book time to meet with me" link is a real link and always works — say so at handover.) If
the scan finds nothing, hand the draft over unsigned and say so.

## Revise, never recreate

Before creating a reply or forward, check whether the thread already has a draft. The
reliable check is the thread listing above with `isDraft` in `--select`: a `from: me` row
with `isDraft: true` is the existing draft. Fallback when it may live off-thread:
`find-mail-drafts` (matches recent drafts client-side on subject and recipients). Do NOT rely
on a `conversationId` `$filter` over the Drafts folder — reply/forward drafts split across
several conversationIds and the filter lags just-created items, so both quietly miss and you
pile up duplicates the user must delete by hand.

Update the existing draft with `update-mail-draft`:
- **Text on a threaded draft:** `--comment '<new text>'` rewrites ONLY what sits above the
  quoted history and keeps the quote byte-identical; repeated edits replace, not stack. NEVER
  use `--body-content` on a threaded draft — it replaces the ENTIRE body, quote included. For
  markup pass `--body-content-type HTML` alongside `--comment`. The update splice inserts NO
  `<hr>` divider, so end your comment with
  `<hr align="center" size="2" style="margin-right:0cm; margin-left:0cm; width:98%">` to
  restore the separator.
- **Text on a plain new-mail draft:** `--body-content` (no quote to lose; `--comment` is
  refused there).
- **Recipients:** `--to/cc/bcc-recipients` replace the whole list; pass `''` to clear one.
- A draft's message-id can change after an edit. If a follow-up call fails with
  `ErrorItemNotFound`, re-fetch the current id via `list-conversation-messages` or
  `find-mail-drafts` and retry — do not reuse a cached id.

## Verify, then hand over

Verify before handover with `convert-mail-to-markdown --message-id '<draft id>' --keep-quoted
true --output-path render.md`, then grep it for the markers that prove the draft is right —
the greeting, one phrase per paragraph, the signature's "Book time" link, the divider, the
quoted `From:` line — rather than pulling the whole render into context (a signed draft always
exceeds the size hint). Hand over with the `webLink` from the LATEST write response as a
clickable link to the draft in Outlook Drafts, ready to review and send. When the substance
came from things you searched, end with the same Sources footer as an answer.

---
*Verified against ask-marcel-office v2.2.0 (2026-07-20).*
