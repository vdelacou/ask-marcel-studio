/*
 * Renders assistant markdown to a React node, with shiki syntax highlighting.
 *
 * App-side, not design-system (rule 21): react-markdown and the highlighter are
 * libraries with logic, so they live here and the result is handed to the prop-pure
 * ChatMessage as an already-rendered node. The design system never imports either.
 *
 * Security (rule 12): the model's text is untrusted, but react-markdown is the
 * checkpoint — it emits React elements, never raw HTML, and strips dangerous URL
 * protocols by default, so nothing reaches an HTML sink. Shiki escapes code content,
 * and no dangerouslySetInnerHTML appears anywhere on this path.
 *
 * The highlighter is a synchronous singleton over a curated language set (docs/PLAN.md
 * said "lazy-loaded"; sync-bundled is the sanctioned simplification, because an async
 * highlighter would force a hook and rule 21 keeps hooks out of the render path). An
 * unlisted language falls back to plain text rather than throwing.
 */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeShikiFromHighlighter from '@shikijs/rehype/core';
import { createHighlighterCoreSync } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import githubLight from '@shikijs/themes/github-light';
import githubDark from '@shikijs/themes/github-dark';
import bash from '@shikijs/langs/bash';
import css from '@shikijs/langs/css';
import diff from '@shikijs/langs/diff';
import html from '@shikijs/langs/html';
import javascript from '@shikijs/langs/javascript';
import json from '@shikijs/langs/json';
import markdown from '@shikijs/langs/markdown';
import python from '@shikijs/langs/python';
import tsx from '@shikijs/langs/tsx';
import typescript from '@shikijs/langs/typescript';
import yaml from '@shikijs/langs/yaml';
import type { AnchorHTMLAttributes, FC, ReactNode } from 'react';
import type { ExtraProps } from 'react-markdown';

const highlighter = createHighlighterCoreSync({
  themes: [githubLight, githubDark],
  langs: [bash, css, diff, html, javascript, json, markdown, python, tsx, typescript, yaml],
  engine: createJavaScriptRegexEngine(),
});

// Links open in the OS browser, never in the app window: main's setWindowOpenHandler
// denies in-app navigation and shells out, so target=_blank is all that is needed.
const ExternalLink: FC<AnchorHTMLAttributes<HTMLAnchorElement> & ExtraProps> = ({ node: _node, children, ...props }) => (
  <a {...props} target="_blank" rel="noreferrer noopener">
    {children}
  </a>
);

export const renderMarkdown = (text: string): ReactNode => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    rehypePlugins={[[rehypeShikiFromHighlighter, highlighter, { themes: { light: 'github-light', dark: 'github-dark' }, fallbackLanguage: 'text' }]]}
    components={{ a: ExternalLink }}
  >
    {text}
  </ReactMarkdown>
);
