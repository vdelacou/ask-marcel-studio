import type { FC } from 'react';
import { Button } from '../../atoms/button/index.tsx';
import { AgentCard } from '../../molecules/agent-card/index.tsx';

export type AgentRow = { name: string; description: string; isBuiltIn: boolean; isModified: boolean };

export type AgentsPanelProps = {
  agents: readonly AgentRow[];
  error?: string;
  onAdd: () => void;
  onEdit: (name: string) => void;
};

export const AgentsPanel: FC<AgentsPanelProps> = ({ agents, error, onAdd, onEdit }) => (
  <section className="flex flex-col gap-y-4">
    <header className="flex items-baseline justify-between">
      <div className="flex flex-col gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Helpers</h2>
        <p className="text-sm text-ink-muted">Marcel hands long or repetitive jobs to a helper so the conversation stays readable.</p>
      </div>
      <Button variant="secondary" onClick={onAdd}>
        Add helper
      </Button>
    </header>

    {agents.length === 0 && <p className="rounded-panel border border-dashed border-border-subtle p-8 text-center text-sm text-ink-muted">No helpers yet.</p>}

    {agents.map((agent) => (
      <AgentCard key={agent.name} name={agent.name} description={agent.description} isBuiltIn={agent.isBuiltIn} isModified={agent.isModified} onEdit={() => onEdit(agent.name)} />
    ))}

    {error !== undefined && (
      <p role="alert" className="rounded-md border border-danger bg-danger-wash px-3 py-2 text-xs text-danger">
        {error}
      </p>
    )}
  </section>
);

AgentsPanel.displayName = 'AgentsPanel';
