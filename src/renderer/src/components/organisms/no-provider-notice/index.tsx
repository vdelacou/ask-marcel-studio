import type { FC } from 'react';
import { Button } from '../../atoms/button/index.tsx';

export type NoProviderNoticeProps = {
  onOpenSettings: () => void;
};

// The zero-provider empty state. Names the cause and the next step rather than
// showing a chat box that can only fail.
export const NoProviderNotice: FC<NoProviderNoticeProps> = ({ onOpenSettings }) => (
  <section className="m-auto flex max-w-sm flex-col items-center gap-y-4 p-8 text-center">
    <h2 className="text-lg font-semibold tracking-tight text-ink">No model yet</h2>
    <p className="text-sm text-ink-muted">Add an Anthropic key, or any OpenAI-compatible endpoint, and this becomes a conversation.</p>
    <Button onClick={onOpenSettings}>Open settings</Button>
  </section>
);

NoProviderNotice.displayName = 'NoProviderNotice';
