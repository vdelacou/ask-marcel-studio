import { describe, expect, test } from 'bun:test';
import { accountKeyFor } from './account-key.ts';
import {
  binDir,
  claudeConfigDir,
  conversationFilePath,
  conversationsDir,
  agentsFilePath,
  backgroundWorkspaceDir,
  importsDir,
  memoryDir,
  memoryFilePath,
  memoryQueuePath,
  memoryStatePath,
  npmCacheDir,
  signatureFilePath,
  voiceProfileFilePath,
  quickContextFilePath,
  cliCheatsheetPath,
  memoryDbPath,
  memoryMigratedMarkerPath,
  mainLogPath,
  accountDir,
  accountsDir,
  currentAccountPath,
  npmPrefixDir,
  pipCacheDir,
  settingsFilePath,
  skillDir,
  skillsDir,
  workspaceDir,
  workspacesDir,
} from './paths.ts';
import { skillFolderName } from './skill-name.ts';
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

  test('npm keeps its global installs and cache inside the data folder', () => {
    expect(npmPrefixDir(USER_DATA)).toBe(`${USER_DATA}/npm-global`);
    expect(npmCacheDir(USER_DATA)).toBe(`${USER_DATA}/npm-cache`);
  });

  test('pip keeps its download cache inside the data folder', () => {
    expect(pipCacheDir(USER_DATA)).toBe(`${USER_DATA}/pip-cache`);
  });

  test('skills live under the agent config folder, which is what settingSources loads', () => {
    expect(skillsDir(USER_DATA)).toBe(`${USER_DATA}/claude-config/skills`);
  });

  test('each skill gets its own folder, named by its checkpointed name', () => {
    const folder = unwrap(skillFolderName('pirate-voice'));

    expect(skillDir(USER_DATA, folder)).toBe(`${USER_DATA}/claude-config/skills/pirate-voice`);
  });

  test('a skill folder never escapes the skills folder', () => {
    const folder = unwrap(skillFolderName('pirate-voice'));

    expect(skillDir(USER_DATA, folder).startsWith(`${USER_DATA}/claude-config/skills/`)).toBe(true);
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

describe('where the agent finds what the user wrote about themselves', () => {
  test('the signature sits in the folder the agent already reads', () => {
    // The drafting skill opens it as $CLAUDE_CONFIG_DIR/signature.html, so it has to
    // live under the same directory the agent's config points at.
    expect(signatureFilePath('/data')).toBe(`${claudeConfigDir('/data')}/signature.html`);
  });

  test('the voice profile sits beside it', () => {
    expect(voiceProfileFilePath('/data')).toBe(`${claudeConfigDir('/data')}/voice-profile.md`);
  });

  test('the quick context sits there too, because a skill may want an id the block left out', () => {
    expect(quickContextFilePath('/data')).toBe(`${claudeConfigDir('/data')}/quick-context.json`);
  });
});

describe('where work the app does on its own happens', () => {
  test('a background job runs outside every conversation folder', () => {
    // Workspaces belong to conversations and are deleted with them; a job that outlives
    // one must not have its scratch swept away underneath it.
    expect(backgroundWorkspaceDir('/data')).toBe('/data/background-workspace');
    expect(backgroundWorkspaceDir('/data').startsWith(workspacesDir('/data'))).toBe(false);
  });
});

describe('where the notes the app keeps live', () => {
  test('the notes sit in the folder the agent already reads', () => {
    expect(memoryDir(USER_DATA)).toBe(`${claudeConfigDir(USER_DATA)}/memory`);
    expect(memoryFilePath(USER_DATA, 'jargon')).toBe(`${claudeConfigDir(USER_DATA)}/memory/jargon.md`);
  });

  test('the app’s own bookkeeping about them does not', () => {
    // What the app wants to ask, and how far it has read, are none of the agent's
    // business.
    expect(memoryQueuePath(USER_DATA).startsWith(claudeConfigDir(USER_DATA))).toBe(false);
    expect(memoryStatePath(USER_DATA)).toBe(`${USER_DATA}/memory/state.json`);
  });

  test('the helpers file sits beside the settings', () => {
    expect(agentsFilePath(USER_DATA)).toBe(`${USER_DATA}/agents.json`);
  });

  test('an imported file lands inside the conversation’s own workspace', () => {
    expect(importsDir(USER_DATA, ID).startsWith(workspaceDir(USER_DATA, ID))).toBe(true);
  });
});

describe('keeping one account’s world out of another’s', () => {
  test('each account has its own folder under the data folder', () => {
    const one = accountKeyFor({ id: 'id-1', email: 'vincent@lvmh.com' });
    const other = accountKeyFor({ id: 'id-2', email: 'someone@lvmh.com' });

    expect(accountDir(USER_DATA, one)).not.toBe(accountDir(USER_DATA, other));
    expect(accountDir(USER_DATA, one).startsWith(`${accountsDir(USER_DATA)}/`)).toBe(true);
  });

  test('an account folder never escapes the data folder', () => {
    const key = accountKeyFor({ id: '../../etc', email: '../../../etc/passwd' });

    expect(accountDir(USER_DATA, key).startsWith(`${USER_DATA}/accounts/`)).toBe(true);
    expect(accountDir(USER_DATA, key)).not.toContain('..');
  });

  test('the record of which account is open sits above them all', () => {
    expect(currentAccountPath(USER_DATA)).toBe(`${USER_DATA}/current-account.json`);
  });

  test('handing a store an account folder puts its conversations inside that account', () => {
    // This is the whole mechanism: the stores keep taking a data folder, and the
    // composition root hands them the account's one.
    const key = accountKeyFor({ id: 'id-1', email: 'vincent@lvmh.com' });

    expect(conversationsDir(accountDir(USER_DATA, key)).startsWith(accountDir(USER_DATA, key))).toBe(true);
  });
});

describe('where the agent finds the flags it should not guess', () => {
  test('the cheat-sheet sits in the folder the agent already reads', () => {
    expect(cliCheatsheetPath('/data')).toBe(`${claudeConfigDir('/data')}/cli-cheatsheet.md`);
  });
});

describe('where the searchable memory keeps its database', () => {
  test('the memory db is bookkeeping, so it sits outside the agent-readable folder', () => {
    expect(memoryDbPath('/data')).toBe('/data/memory/memory.db');
    expect(memoryDbPath('/data').startsWith(claudeConfigDir('/data'))).toBe(false);
  });

  test('the once-only migration marker sits beside the app bookkeeping', () => {
    expect(memoryMigratedMarkerPath('/data')).toBe('/data/memory/migrated.json');
  });
});

describe('where the app keeps its own log', () => {
  test('the log is app-level, so it sits at the top of the data folder', () => {
    expect(mainLogPath('/data')).toBe('/data/logs/main.log');
  });
});
