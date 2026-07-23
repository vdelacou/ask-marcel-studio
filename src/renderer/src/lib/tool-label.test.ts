import { describe, expect, test } from 'bun:test';
import { toolLabel } from './tool-label.ts';

describe('saying what a tool call is doing', () => {
  test('a bash call uses the description the agent wrote for it', () => {
    expect(toolLabel('Bash', { command: 'ask-marcel-office list-mail-messages --top 5', description: 'Read the last 5 emails' })).toBe('Read the last 5 emails');
  });

  test('a bash call with no description says something true rather than showing the command', () => {
    expect(toolLabel('Bash', { command: 'ls -la' })).toBe('Running a command');
  });

  test('a description of only whitespace is treated as missing', () => {
    expect(toolLabel('Bash', { description: '   ' })).toBe('Running a command');
  });

  test('a description that is not a string is treated as missing', () => {
    expect(toolLabel('Bash', { description: 42 })).toBe('Running a command');
  });

  test('file tools name the file, not the whole path', () => {
    expect(toolLabel('Read', { file_path: '/Users/x/workspace/budget.xlsx' })).toBe('Reading budget.xlsx');
    expect(toolLabel('Write', { file_path: '/Users/x/Documents/report.docx' })).toBe('Creating report.docx');
    expect(toolLabel('Edit', { file_path: '/Users/x/Documents/report.docx' })).toBe('Editing report.docx');
    expect(toolLabel('MultiEdit', { file_path: '/Users/x/Documents/report.docx' })).toBe('Editing report.docx');
  });

  test('a windows path is split on its own separator', () => {
    expect(toolLabel('Read', { file_path: 'C:\\Users\\x\\notes.txt' })).toBe('Reading notes.txt');
  });

  test('a path that is nothing but separators falls back to showing it whole', () => {
    expect(toolLabel('Read', { file_path: '/' })).toBe('Reading /');
  });

  test('file tools without a path still read as a sentence', () => {
    expect(toolLabel('Read', {})).toBe('Reading a file');
    expect(toolLabel('Write', {})).toBe('Creating a file');
    expect(toolLabel('Edit', {})).toBe('Editing a file');
  });

  test('searching quotes what is being looked for', () => {
    expect(toolLabel('Grep', { pattern: 'invoice' })).toBe('Searching for “invoice”');
    expect(toolLabel('WebSearch', { query: 'aptos font' })).toBe('Searching the web for “aptos font”');
  });

  test('searching with nothing to quote still reads as a sentence', () => {
    expect(toolLabel('Grep', {})).toBe('Searching your files');
    expect(toolLabel('WebSearch', {})).toBe('Searching the web');
  });

  test('listing files needs no detail', () => {
    expect(toolLabel('Glob', { pattern: '**/*.ts' })).toBe('Looking for files');
    expect(toolLabel('NotebookEdit', {})).toBe('Editing a notebook');
    expect(toolLabel('TodoWrite', {})).toBe('Organising the steps');
  });

  test('fetching a page names the site, not the query string', () => {
    expect(toolLabel('WebFetch', { url: 'https://learn.microsoft.com/en-us/graph/api/overview?view=graph-rest-1.0' })).toBe('Reading learn.microsoft.com');
  });

  test('a url that cannot be parsed does not break the label', () => {
    expect(toolLabel('WebFetch', { url: 'not a url' })).toBe('Reading a web page');
  });

  test('fetching with no url at all still reads as a sentence', () => {
    expect(toolLabel('WebFetch', {})).toBe('Reading a web page');
  });

  test('a skill is named by the command that invoked it', () => {
    expect(toolLabel('Skill', { command: 'draft-outlook-email' })).toBe('Using the draft-outlook-email skill');
  });

  test('a skill given only a name is named by that', () => {
    expect(toolLabel('Skill', { name: 'answer-from-m365' })).toBe('Using the answer-from-m365 skill');
  });

  test('a skill invoked with the skill key, the shape the SDK actually sends, is named by it', () => {
    expect(toolLabel('Skill', { skill: 'answer-from-m365', args: 'CELINE CIO meeting deck' })).toBe('Using the answer-from-m365 skill');
  });

  test('a skill with neither still reads as a sentence', () => {
    expect(toolLabel('Skill', {})).toBe('Using a skill');
  });

  test('a delegated task uses its own description', () => {
    expect(toolLabel('Task', { description: 'Read the whole deck', subagent_type: 'm365-reader' })).toBe('Read the whole deck');
  });

  test('a delegation arriving under the Agent tool name reads the same way', () => {
    expect(toolLabel('Agent', { description: 'Read the latest CELINE CIO Meeting deck', subagent_type: 'doc-reader' })).toBe('Read the latest CELINE CIO Meeting deck');
  });

  test('a delegated task with no description names the helper', () => {
    expect(toolLabel('Task', { subagent_type: 'm365-reader' })).toBe('Asking the m365-reader helper');
  });

  test('a delegated task with neither still reads as a sentence', () => {
    expect(toolLabel('Task', {})).toBe('Asking a helper');
  });

  test('an mcp tool is shown as its own last segment, opened out', () => {
    expect(toolLabel('mcp__gmail__send_message', {})).toBe('Using send message');
  });

  test('an mcp name with nothing after the prefix is left alone', () => {
    expect(toolLabel('mcp__', {})).toBe('mcp__');
  });

  test('a tool we have no wording for is shown by name rather than mislabelled', () => {
    expect(toolLabel('SomeFutureTool', {})).toBe('SomeFutureTool');
  });

  test('a label longer than the card can show is cut with an ellipsis', () => {
    const long = 'Read every message in the shared mailbox and summarise what needs an answer today';

    expect(toolLabel('Bash', { description: long })).toBe('Read every message in the shared mailbox and summarise what…');
  });

  test('a label exactly at the limit is left whole', () => {
    const exact = 'x'.repeat(60);

    expect(toolLabel('Bash', { description: exact })).toBe(exact);
  });

  test('an input that is not an object at all is survivable', () => {
    expect(toolLabel('Bash', null)).toBe('Running a command');
    expect(toolLabel('Read', 'oops')).toBe('Reading a file');
    expect(toolLabel('Grep', [1, 2])).toBe('Searching your files');
  });
});
