import type { FC } from 'react';

// Props-only (rule 21). A status-only view of the embedded Python runtime, resolved by the
// page shell from the python status. There is no action: the venv builds itself at launch.
export type PythonView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'provisioning' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'not-provisioned' }
  | { readonly kind: 'failed'; readonly message: string };

export type PythonPanelProps = {
  view: PythonView;
};

const statusLine = (view: PythonView): string => {
  if (view.kind === 'loading') return 'Checking the Python runtime…';
  if (view.kind === 'provisioning') return 'Setting up Python. This runs once on first launch and takes a moment.';
  if (view.kind === 'ready') return 'Ready. The agent can run python3 and pip3.';
  if (view.kind === 'not-provisioned') return 'Not set up yet. It builds automatically the next time the app starts.';
  return `Setup failed: ${view.message}`;
};

const tone = (view: PythonView): string => {
  if (view.kind === 'ready') return 'text-success';
  if (view.kind === 'failed') return 'text-danger';
  return 'text-ink-muted';
};

export const PythonPanel: FC<PythonPanelProps> = ({ view }) => (
  <section className="flex flex-col gap-y-4">
    <header className="flex flex-col gap-y-1">
      <h2 className="text-lg font-semibold tracking-tight text-ink">Python</h2>
      <p className={`text-sm ${tone(view)}`}>{statusLine(view)}</p>
    </header>
    <p className="text-sm text-ink-muted">
      A private Python with openpyxl and pandas ships inside the app, so the agent can read a spreadsheet or crunch a CSV offline. Nothing is installed on your system.
    </p>
  </section>
);

PythonPanel.displayName = 'PythonPanel';
