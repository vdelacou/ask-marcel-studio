import type { FC, ReactNode } from 'react';

// Props-only (rule 21). Receives the already-rendered markdown tree (built app-side in
// render/markdown) and owns its typography, so all styling stays sealed in the design
// system (rule 22). Shiki emits `<pre class="shiki">`; its dark-theme swap lives in
// globals.css because it targets a class this component does not author.
export type MarkdownViewProps = {
  children: ReactNode;
};

const typography = [
  'text-sm leading-relaxed',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_p]:my-2',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1',
  '[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2',
  '[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-surface [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:text-[0.85em]',
  '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:p-3 [&_pre]:text-xs [&_pre]:leading-relaxed',
  '[&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:font-semibold',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-border-subtle [&_blockquote]:pl-3 [&_blockquote]:text-ink-muted',
  '[&_hr]:my-3 [&_hr]:border-border-subtle',
  '[&_table]:my-2 [&_table]:block [&_table]:overflow-x-auto [&_table]:text-xs [&_th]:border [&_th]:border-border-subtle [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:border-border-subtle [&_td]:px-2 [&_td]:py-1',
].join(' ');

export const MarkdownView: FC<MarkdownViewProps> = ({ children }) => <div className={typography}>{children}</div>;

MarkdownView.displayName = 'MarkdownView';
