/*
 * The python service: provision the per-user venv from the embedded runtime and report
 * its state.
 *
 * Pure orchestration with an injected IO seam (hard rule 13), so no process is spawned and
 * no file is touched in a test. The seam is the SDK-side slice (how to run a binary, read
 * and write the marker, remove the venv); the composition root wires it to child_process +
 * node:fs. This module owns only the policy: build once against the current runtime, seed
 * the venv offline from bundled wheels, stamp a version marker, and rebuild when the
 * runtime changes. A single-flight lock stops a second call building a second venv.
 */
import { statusFromMarker } from '../../../shared/python-status.ts';
import type { PythonStatus } from '../../../shared/python-status.ts';

export type PythonRunOutcome =
  { readonly ran: true; readonly stdout: string; readonly stderr: string; readonly code: number; readonly timedOut: boolean } | { readonly ran: false; readonly message: string };

export type PythonIo = {
  readonly run: (binary: string, args: readonly string[], timeoutMs: number) => Promise<PythonRunOutcome>;
  readonly readMarker: () => Promise<string | undefined>;
  readonly writeMarker: (content: string) => Promise<void>;
  readonly removeVenv: () => Promise<void>;
};

export type PythonProvisionConfig = {
  readonly runtimePython: string;
  readonly venvPython: string;
  readonly venvDir: string;
  readonly wheelsDir: string;
  readonly seedPackages: readonly string[];
  // The runtime build string stamped into the marker; a change forces a rebuild.
  readonly build: string;
};

export type PythonService = {
  readonly status: () => Promise<PythonStatus>;
  readonly provision: () => Promise<PythonStatus>;
};

// Creating the venv is fast; the offline seed unpacks numpy/pandas and gets longer.
const VENV_TIMEOUT_MS = 60_000;
const SEED_TIMEOUT_MS = 180_000;

// undefined means the run succeeded; a string is the failure reason for the status.
const runFailure = (outcome: PythonRunOutcome, label: string): string | undefined => {
  if (!outcome.ran) return `${label}: ${outcome.message}`;
  if (outcome.timedOut) return `${label}: timed out`;
  if (outcome.code === 0) return undefined;
  const detail = outcome.stderr.trim();
  const reason = detail.length > 0 ? detail : `exit ${outcome.code}`;
  return `${label}: ${reason}`;
};

export const createPythonService = (io: PythonIo, config: PythonProvisionConfig): PythonService => {
  let inFlight: Promise<PythonStatus> | undefined;

  const runProvision = async (): Promise<PythonStatus> => {
    if ((await io.readMarker()) === config.build) return { state: 'ready', version: config.build };

    // Clean slate: a half-built venv from a failed run must not be trusted.
    await io.removeVenv();
    const created = await io.run(config.runtimePython, ['-m', 'venv', config.venvDir], VENV_TIMEOUT_MS);
    const createFail = runFailure(created, 'could not create the python environment');
    if (createFail !== undefined) return { state: 'failed', message: createFail };

    const seedArgs = ['-m', 'pip', 'install', '--no-index', '--find-links', config.wheelsDir, ...config.seedPackages];
    const seeded = await io.run(config.venvPython, seedArgs, SEED_TIMEOUT_MS);
    const seedFail = runFailure(seeded, 'could not install the bundled python packages');
    if (seedFail !== undefined) return { state: 'failed', message: seedFail };

    // Stamp last: the marker is the proof that both steps completed.
    await io.writeMarker(config.build);
    return { state: 'ready', version: config.build };
  };

  const provision = (): Promise<PythonStatus> => {
    if (inFlight !== undefined) return inFlight;
    const flight = runProvision().finally(() => {
      inFlight = undefined;
    });
    inFlight = flight;
    return flight;
  };

  const status = async (): Promise<PythonStatus> => {
    // A build in flight is reported as such, so the UI can say "setting up" rather than
    // "not installed" during the first-launch window.
    if (inFlight !== undefined) return { state: 'provisioning' };
    return statusFromMarker(await io.readMarker(), config.build);
  };

  return { status, provision };
};
