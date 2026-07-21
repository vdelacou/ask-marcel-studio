/*
 * The channel names are a contract between two processes that are built separately.
 * A typo does not fail the build: main listens on one string, the renderer invokes
 * another, and the call just hangs. Pinning them is what turns that into a test
 * failure instead of a mystery.
 */
import { describe, expect, test } from 'bun:test';
import { CHANNEL, CHAT_EVENT } from './ipc-contract.ts';

describe('the channels main and the renderer agree on', () => {
  test('every channel keeps its exact name on the wire', () => {
    expect(CHANNEL).toEqual({
      settingsGet: 'settings:get',
      settingsSave: 'settings:save',
      conversationsList: 'conversations:list',
      conversationsCreate: 'conversations:create',
      conversationsGet: 'conversations:get',
      conversationsRename: 'conversations:rename',
      conversationsSetModel: 'conversations:setModel',
      conversationsDelete: 'conversations:delete',
      conversationsImportPick: 'conversations:importPick',
      conversationsImportPaths: 'conversations:importPaths',
      conversationsImportData: 'conversations:importData',
      chatSend: 'chat:send',
      chatCancel: 'chat:cancel',
      skillsList: 'skills:list',
      skillsAdd: 'skills:add',
      skillsRemove: 'skills:remove',
      skillsRead: 'skills:read',
      skillsWrite: 'skills:write',
      skillsRestore: 'skills:restore',
      agentsList: 'agents:list',
      agentsSave: 'agents:save',
      agentsRemove: 'agents:remove',
      agentsRestore: 'agents:restore',
      agentFileGet: 'agent-file:get',
      agentFileSave: 'agent-file:save',
      agentFileRegenerate: 'agent-file:regenerate',
      officeStatus: 'office:status',
      officeLogin: 'office:login',
      officeCommands: 'office:commands',
    });
  });

  test('the one main-to-renderer stream keeps its name', () => {
    // Renaming this silently stops every turn from reaching the UI: main would send
    // on one channel and the renderer would listen on another, with no error anywhere.
    expect(CHAT_EVENT).toBe('chat:event');
  });

  test('no two channels share a name', () => {
    const names = Object.values(CHANNEL);

    expect(new Set(names).size).toBe(names.length);
  });

  test('the event stream does not collide with an invoke channel', () => {
    expect(Object.values(CHANNEL)).not.toContain(CHAT_EVENT);
  });
});
