/*
 * The agent's memory tools, as an in-process MCP server.
 *
 * Three tools the model can call in a conversation: search what is remembered, add
 * something the user asked to keep, forget something they asked to drop. In-process (the
 * SDK's createSdkMcpServer) rather than a CLI shim, because the store needs the settings
 * store's unsealed provider key, which only the running app has.
 *
 * Thin wiring: every decision about what to say is the pure memory-tools-core, and the
 * store is the port. This file turns a tool call into a store call and a store result into
 * the text the model reads.
 */
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { addConfirmation, clampSearchLimit, emptySearchRefusal, forgetConfirmation, forgetNotFound, renderSearchResult } from '../../../shared/memory-tools-core.ts';
import type { MemoryStore } from '../../../shared/memory-store.ts';
import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';

// The SDK's CallToolResult content is a loose union; the text shape is all this needs, so
// the return type is inferred rather than pinned.
const say = (text: string): { content: { type: 'text'; text: string }[] } => ({ content: [{ type: 'text', text }] });

export const createMemoryMcpServer = (store: MemoryStore, conversationId: string): McpSdkServerConfigWithInstance =>
  createSdkMcpServer({
    name: 'marcel-memory',
    version: '1.0.0',
    alwaysLoad: true,
    tools: [
      tool(
        'memory_search',
        'Search what you remember about this user and their world: a term, a person, a preference. Call this before saying you do not know one.',
        { query: z.string().describe('the term, person, or topic to look for'), limit: z.number().optional().describe('how many to return, 1 to 20') },
        async (args) => {
          const query = args.query.trim();
          if (query.length === 0) return say(emptySearchRefusal());
          const found = await store.search(query, clampSearchLimit(args.limit));
          if (!found.ok) return say(`Memory is unavailable right now (${found.error.kind}). Answer without it and do not claim it is empty.`);
          return say(renderSearchResult(found.value));
        }
      ),
      tool(
        'memory_add',
        'Remember something durable about the user, ONLY when they ask you to ("remember that…", "add to memory…"). One fact per call, as a short sentence.',
        { text: z.string().describe('the fact to remember, in a short sentence') },
        async (args) => {
          const added = await store.add({ text: args.text, source: 'chat', conversationId });
          if (!added.ok) return say(`Could not remember that (${added.error.kind}): ${added.error.message}`);
          return say(addConfirmation(added.value.text));
        }
      ),
      tool(
        'memory_forget',
        'Forget a memory the user asked you to drop. Search first to find its id, then pass that id.',
        { id: z.string().describe('the id of the memory to forget, from a search result') },
        async (args) => {
          const removed = await store.remove(args.id);
          if (!removed.ok)
            return removed.error.kind === 'not-found' ? say(forgetNotFound(args.id)) : say(`Could not forget that (${removed.error.kind}): ${removed.error.message}`);
          return say(forgetConfirmation(`memory ${args.id}`));
        }
      ),
    ],
  });
