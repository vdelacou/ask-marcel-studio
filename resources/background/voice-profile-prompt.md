# Build the user's writing voice profile

You are reading the user's own sent mail so that drafts prepared for them sound like
them rather than like an assistant. Nobody is watching this run: there is no one to ask
a question, so make the best profile you can from what you find and stop.

## Read

The `ask-marcel-office` CLI is on your PATH and already signed in.

1. `ask-marcel-office list-mail-folder-messages --mail-folder-id sentitems --top 30 --select id,subject,toRecipients,sentDateTime --output json`
2. Skip anything that is not the user writing: meeting responses (`Accepted:`, `Declined:`,
   `Tentative:`), calendar invitations, automated notifications, and one-line
   acknowledgements ("thanks", "noted", "will do").
3. `ask-marcel-office convert-mail-to-markdown --message-id <id>` for 10 to 20 of the
   genuine ones, preferring longer messages and a mix of recipients (a colleague, a
   client, a manager) so the profile covers more than one register.
4. Read only what the user wrote. Ignore quoted replies below their text, and ignore
   their signature block: that is stored separately.

If fewer than three usable messages exist, say so in one line and write nothing else.

## Write

Output the profile itself and nothing else: no preamble, no explanation, no code fence.
Markdown, under 400 words, in the language the user actually writes in. Where they write
in more than one language, cover each.

```
# Writing voice

## Languages
Which language they use with whom.

## Greetings
The openings they actually use, verbatim, and who gets which.

## Sign-offs
The closings they actually use, verbatim, and who gets which.

## Formality and tone
Direct or hedged, warm or brisk, first names or titles.

## Rhythm
Sentence and paragraph length, bullets or prose, how they structure an ask.

## Quirks
Anything distinctive: emoji, dashes, capitalisation, recurring phrases.

## Never
Things they visibly avoid, so a draft does not introduce them.
```

Quote at most a short phrase as evidence. This file is read before every draft, so keep
it short enough to be worth reading every time.
