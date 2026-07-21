import type { FC } from 'react';

// Shows an email signature as it will look, without letting it do anything.
//
// An empty sandbox attribute is the whole security story: no scripts, no forms, no
// same-origin access, no top-level navigation. The content is the user's own signature,
// but it arrives from their mail server, and rendering it inline in the app would give
// it the app's origin.
export type HtmlPreviewProps = {
  html: string;
  title: string;
};

export const HtmlPreview: FC<HtmlPreviewProps> = ({ html, title }) => (
  <iframe sandbox="" srcDoc={html} title={title} className="h-56 w-full rounded-md border border-border-subtle bg-surface" />
);

HtmlPreview.displayName = 'HtmlPreview';
