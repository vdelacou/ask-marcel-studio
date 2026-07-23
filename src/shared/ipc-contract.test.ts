/*
 * The channel names are a contract between two processes that are built separately.
 * A typo does not fail the build: main listens on one string, the renderer invokes
 * another, and the call just hangs. Pinning them is what turns that into a test
 * failure instead of a mystery.
 */
import { describe, expect, test } from 'bun:test';
import { CHANNEL, CHAT_EVENT, MEMORY_EVENT } from './ipc-contract.ts';

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
      skillsCreate: 'skills:create',
      skillsRestore: 'skills:restore',
      agentsList: 'agents:list',
      agentsSave: 'agents:save',
      agentsRemove: 'agents:remove',
      agentsRestore: 'agents:restore',
      agentFileGet: 'agent-file:get',
      agentFileSave: 'agent-file:save',
      agentFileRegenerate: 'agent-file:regenerate',
      modelsTest: 'models:test',
      officeStatus: 'office:status',
      officeLogin: 'office:login',
      officeLogout: 'office:logout',
      officeCommands: 'office:commands',
      officeQuickContext: 'office:quickContext',
      memoryPending: 'memory:pending',
      memoryResolve: 'memory:resolve',
      memoryRead: 'memory:read',
      memoryWrite: 'memory:write',
      memoryList: 'memory:list',
      memoryAdd: 'memory:add',
      memoryUpdate: 'memory:update',
      memoryDelete: 'memory:delete',
      memoryClearAll: 'memory:clearAll',
      memoryHistory: 'memory:history',
      updateStatus: 'update:status',
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

  test('neither event stream collides with an invoke channel', () => {
    expect(Object.values(CHANNEL)).not.toContain(CHAT_EVENT);
    expect(Object.values(CHANNEL)).not.toContain(MEMORY_EVENT);
  });

  test('the second main-to-renderer stream keeps its name', () => {
    // Renaming this silently stops the app ever asking the user about a word it
    // noticed: main would send on one channel and the renderer listen on another.
    expect(MEMORY_EVENT).toBe('memory:event');
  });

  test('the two main-to-renderer streams are not the same stream', () => {
    expect(MEMORY_EVENT).not.toBe(CHAT_EVENT);
  });
});
