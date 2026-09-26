/*
 * The two moves the mail reader used to guess at, pinned to the calls that were verified
 * against a live mailbox on CLI 2.6.0.
 *
 * One delegated "what did I miss this week" turn spent 29 of its 31 failed steps on them:
 * 20 trying to reach a meeting invitation's event (selecting event fields on the message,
 * `--expand event` without the type cast, commands that do not exist), and 9 trying to reach
 * a thread from a message id (passing the message id where the conversationId belongs). The
 * prompt named the thread listing but never said how to get its id from a message, and said
 * nothing about invitations at all.
 *
 * Phrase checks, like the doctrine guards in mail-reader.test.ts: the point is that a later
 * edit cannot delete the one working call and leave the reader guessing again.
 */
import { describe, expect, test } from 'bun:test';
import { mailReader } from './mail-reader.ts';

describe('the mail reader on the moves it used to guess', () => {
  test("reaches a thread from a message id by reading the message's conversationId first", () => {
    expect(mailReader.prompt).toMatch(/get-mail-message --message-id '<id>'[^\n]*conversationId/);
  });

  test("reads a meeting invitation's time, place and response through its linked event", () => {
    expect(mailReader.prompt).toContain("--expand 'microsoft.graph.eventMessage/event(");
  });
});
