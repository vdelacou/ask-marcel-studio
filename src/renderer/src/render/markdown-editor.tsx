/*
 * The rich editor: markdown that does not look like markdown.
 *
 * This app is for people who do not write markdown, and a voice profile or a skill is
 * prose. Milkdown's Crepe editor edits it as formatted text and serialises back to
 * markdown, so the file on disk stays a file the agent can read.
 *
 * Lives in render/, beside the markdown renderer, for the same reason: it owns a
 * third-party library and a mutable ref, so it cannot be a design-system component
 * (rule 21). The panels mount it into a logic-free container.
 *
 * The parent remounts it with a key when the document changes underneath; Crepe takes
 * its starting value once and owns the DOM from then on.
 */
import { useEffect, useRef } from 'react';
import type { FC } from 'react';
import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import { unescapeAmpersands } from '../lib/markdown-ampersands.ts';
import { reportedText } from '../lib/autosave.ts';

export type MarkdownEditorProps = {
  defaultValue: string;
  onChange: (markdown: string) => void;
  // The text as the editor closes, and as it first showed it. Crepe waits 200 ms before it reports
  // a change and cancels that wait when it is destroyed, so the last words typed before a close
  // reach the page only through here. The opening text is in Crepe's own markdown, for telling a
  // real change from Crepe writing the same document its own way.
  onLeave?: (markdown: string, opened: string) => void;
};

export const MarkdownEditor: FC<MarkdownEditorProps> = ({ defaultValue, onChange, onLeave }) => {
  const host = useRef<HTMLDivElement>(null);
  // Read through a ref so a new callback identity never tears down the editor and
  // loses the cursor mid-sentence.
  const latest = useRef(onChange);
  latest.current = onChange;
  const leave = useRef(onLeave);
  leave.current = onLeave;
  // The starting text, captured once per mount. Held in a ref rather than read straight
  // from the prop because the prop is the LIVE document: the panels feed every keystroke
  // back in, so an effect depending on it destroyed and rebuilt the editor on every
  // letter, throwing away the DOM node holding the cursor. A ref is not a reactive value,
  // so the effect below can honestly depend on nothing and run once.
  const initial = useRef(defaultValue);

  useEffect(() => {
    const root = host.current;
    if (root === null) return undefined;

    // The document as Crepe first wrote it out, once it has finished starting: only then does it
    // have a document to report or hand over.
    let opened: string | undefined;
    const crepe = new Crepe({ root, defaultValue: initial.current });
    crepe.on((listener) => {
      listener.markdownUpdated((_context, markdown) => {
        const text = reportedText(unescapeAmpersands(markdown), opened, initial.current);
        if (text !== undefined) latest.current(text);
      });
    });
    void crepe.create().then(() => {
      opened = unescapeAmpersands(crepe.getMarkdown());
    });
    return () => {
      if (opened !== undefined) leave.current?.(unescapeAmpersands(crepe.getMarkdown()), opened);
      void crepe.destroy();
    };
    // Nothing: the editor owns its content once it starts, and the parent remounts it by
    // key when it has to start again from something new.
  }, []);

  return <div ref={host} />;
};

MarkdownEditor.displayName = 'MarkdownEditor';
