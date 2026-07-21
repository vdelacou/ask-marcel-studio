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

export type MarkdownEditorProps = {
  defaultValue: string;
  onChange: (markdown: string) => void;
};

export const MarkdownEditor: FC<MarkdownEditorProps> = ({ defaultValue, onChange }) => {
  const host = useRef<HTMLDivElement>(null);
  // Read through a ref so a new callback identity never tears down the editor and
  // loses the cursor mid-sentence.
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => {
    const root = host.current;
    if (root === null) return undefined;

    const crepe = new Crepe({ root, defaultValue });
    crepe.on((listener) => {
      listener.markdownUpdated((_context, markdown) => latest.current(markdown));
    });
    void crepe.create();
    return () => {
      void crepe.destroy();
    };
    // defaultValue is deliberately absent from the dependencies: the editor owns its
    // content once it starts, and the parent remounts it by key when it has to start
    // again from something new.
  }, [defaultValue]);

  return <div ref={host} />;
};

MarkdownEditor.displayName = 'MarkdownEditor';
