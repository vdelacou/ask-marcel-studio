# Note what this user's own words mean

You are reading one conversation between the user and their assistant, looking for
things worth remembering so that future conversations do not have to be explained from
scratch. Nobody is watching this run: there is no one to ask, so return what you found
and stop.

## What is worth remembering

Only three kinds of thing, and only when the conversation itself makes the meaning
clear:

- **jargon** — an abbreviation, acronym or in-house term the user uses as if everyone
  knows it, where the conversation shows what it means.
- **team** — someone the user speaks of as a colleague they work with regularly.
- **people** — someone outside their team who comes up repeatedly: a client, a supplier,
  a counterpart.

## What is never worth remembering

- Anything the user asked to keep private, or that reads as sensitive: health, pay,
  performance, personal circumstances.
- Passwords, keys, account numbers, or anything that looks like a credential.
- One-off facts: a date, a figure, a decision. Those belong to the conversation.
- A word whose meaning you are guessing at. Leave it out rather than propose it.

## Filling in the people

For a **team** or **people** candidate, look the person up before you answer so the user
is confirming a fact rather than a guess. The `ask-marcel-office` CLI is on your PATH:

- `ask-marcel-office list-relevant-people --search "<name>"`
- `ask-marcel-office get-user --user-id <email>`
- `ask-marcel-office get-my-manager`

Put whatever you find (job title, email, who they report to) in `enrichment`. If the
lookup fails, or the user is not signed in, carry on without it: this is optional.

## Answer

One fenced JSON block and nothing else. No preamble, no explanation.

```json
{
  "candidates": [
    {
      "kind": "jargon",
      "term": "QW",
      "detail": "quick win: a small piece of work the team can finish inside a sprint",
      "alternatives": ["quality watch"],
      "quote": "another QW for the quarter",
      "enrichment": ""
    }
  ]
}
```

- `detail` is what you would tell a new colleague, in one sentence.
- `alternatives` holds up to three other readings, when the conversation genuinely
  leaves it open. Leave it empty when it does not.
- `quote` is the phrase from the conversation that prompted it, so the user can see why
  they are being asked.

An empty `candidates` list is a perfectly good answer, and the right one most of the
time.
