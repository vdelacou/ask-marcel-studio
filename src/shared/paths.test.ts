import { describe, expect, test } from 'bun:test';
import { binDir, claudeConfigDir, conversationFilePath, conversationsDir, settingsFilePath, workspaceDir, workspacesDir } from './paths.ts';
import { conversationId } from './conversation-id.ts';
import { unwrap } from './result.ts';

const USER_DATA = '/Users/someone/Library/Application Support/ask-marcel-studio';
const ID = unwrap(conversationId('3f2504e0-4f89-41d3-9a0c-0305e82c3301'));

describe('locating the files the app owns inside its own data folder', () => {
  test('settings live in a single json file at the top of the data folder', () => {
    expect(settingsFilePath(USER_DATA)).toBe(`${USER_DATA}/settings.json`);
  });

  test('a conversation is one json file named after its id', () => {
    expect(conversationFilePath(USER_DATA, ID)).toBe(`${USER_DATA}/conversations/3f2504e0-4f89-41d3-9a0c-0305e82c3301.json`);
  });

  test('a conversation gets its own workspace folder, which becomes the agent cwd', () => {
    expect(workspaceDir(USER_DATA, ID)).toBe(`${USER_DATA}/workspaces/3f2504e0-4f89-41d3-9a0c-0305e82c3301`);
  });

  test('the conversations and workspaces folders sit side by side under the data folder', () => {
    expect(conversationsDir(USER_DATA)).toBe(`${USER_DATA}/conversations`);
    expect(workspacesDir(USER_DATA)).toBe(`${USER_DATA}/workspaces`);
  });

  test('the agent reads its config from the app folder, not the developer own', () => {
    // Handed to the subprocess as CLAUDE_CONFIG_DIR, which is what makes the app's
    // skills load instead of whatever is in the developer's home directory.
    expect(claudeConfigDir(USER_DATA)).toBe(`${USER_DATA}/claude-config`);
  });

  test('the shim folder that goes first on the agent path lives in the data folder', () => {
    expect(binDir(USER_DATA)).toBe(`${USER_DATA}/bin`);
  });
});

describe('keeping every derived path inside the data folder', () => {
  // The id is branded, so it has already crossed its checkpoint (conversation-id.ts)
  // and cannot contain a traversal. These pin the containment that branding buys, so
  // that a later refactor of the path shape cannot quietly break out of userData.
  test('a conversation file never escapes the data folder', () => {
    expect(conversationFilePath(USER_DATA, ID).startsWith(`${USER_DATA}/`)).toBe(true);
  });

  test('a workspace never escapes the data folder', () => {
    expect(workspaceDir(USER_DATA, ID).startsWith(`${USER_DATA}/`)).toBe(true);
  });

  test('a data folder given with a trailing slash does not produce a doubled separator', () => {
    expect(conversationFilePath(`${USER_DATA}/`, ID)).toBe(`${USER_DATA}/conversations/3f2504e0-4f89-41d3-9a0c-0305e82c3301.json`);
  });
});
