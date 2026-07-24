import type { FC } from 'react';
import { Button } from '../../atoms/button/index.tsx';

export type EmptyConversationsProps = {
  onNew: () => void;
};

// Shown in the main area when every conversation has been deleted: the sidebar still
// offers New, but the empty canvas needs its own way forward. The whole canvas is a
// window-move surface (there is no title bar and no header here); the card opts out so its
// button still clicks.
export const EmptyConversations: FC<EmptyConversationsProps> = ({ onNew }) => (
  <section className="flex flex-1 [-webkit-app-region:drag]">
    <div className="m-auto flex max-w-sm flex-col items-center gap-y-4 p-8 text-center [-webkit-app-region:no-drag]">
      <h2 className="text-lg font-semibold tracking-tight text-ink">No conversation open</h2>
      <p className="text-sm text-ink-muted">Start a new one to talk to the agent.</p>
      <Button onClick={onNew}>New conversation</Button>
    </div>
  </section>
);

EmptyConversations.displayName = 'EmptyConversations';
