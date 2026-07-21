import { describe, expect, test } from 'bun:test';
import { createPythonService } from './python-service.ts';
import type { PythonIo, PythonRunOutcome } from './python-service.ts';

const BUILD = '3.13.14+20260718';
const CONFIG = {
  runtimePython: '/rt/python/bin/python3',
  venvPython: '/ud/py/bin/python',
  venvDir: '/ud/py',
  wheelsDir: '/rt/wheels',
  seedPackages: ['openpyxl', 'certifi'] as const,
  build: BUILD,
};

const ranOk = (): PythonRunOutcome => ({ ran: true, code: 0, stdout: '', stderr: '', timedOut: false });

type Call = { binary: string; args: readonly string[] };
const fakeIo = (
  marker: string | undefined,
  outcomes: readonly PythonRunOutcome[]
): { io: PythonIo; state: { marker: string | undefined; removed: number; written: string | undefined; calls: Call[] } } => {
  const state = { marker, removed: 0, written: undefined as string | undefined, calls: [] as Call[] };
  const queue = [...outcomes];
  const io: PythonIo = {
    run: (binary, args) => {
      state.calls.push({ binary, args });
      const next = queue.shift();
      if (next === undefined) throw new Error('no scripted outcome for this run call');
      return Promise.resolve(next);
    },
    readMarker: () => Promise.resolve(state.marker),
    writeMarker: (content) => {
      state.written = content;
      state.marker = content;
      return Promise.resolve();
    },
    removeVenv: () => {
      state.removed += 1;
      return Promise.resolve();
    },
  };
  return { io, state };
};

describe('provisioning the embedded python environment', () => {
  test('when the venv already matches the current build, provision is a no-op that reports ready', async () => {
    const { io, state } = fakeIo(BUILD, []);
    const service = createPythonService(io, CONFIG);

    expect(await service.provision()).toEqual({ state: 'ready', version: BUILD });
    expect(state.calls).toEqual([]);
    expect(state.removed).toBe(0);
  });

  test('a fresh machine builds the venv, seeds it offline, and stamps the build', async () => {
    const { io, state } = fakeIo(undefined, [ranOk(), ranOk()]);
    const service = createPythonService(io, CONFIG);

    expect(await service.provision()).toEqual({ state: 'ready', version: BUILD });
    expect(state.removed).toBe(1);
    expect(state.calls[0]).toEqual({ binary: CONFIG.runtimePython, args: ['-m', 'venv', CONFIG.venvDir] });
    expect(state.calls[1]).toEqual({ binary: CONFIG.venvPython, args: ['-m', 'pip', 'install', '--no-index', '--find-links', CONFIG.wheelsDir, 'openpyxl', 'certifi'] });
    expect(state.written).toBe(BUILD);
  });

  test('with nothing to seed, the venv is built and stamped without running pip at all', async () => {
    // The shipping configuration: no library is preinstalled, and pip errors when handed
    // no requirements, so the seed step must be skipped rather than run empty.
    const { io, state } = fakeIo(undefined, [ranOk()]);
    const service = createPythonService(io, { ...CONFIG, seedPackages: [] });

    expect(await service.provision()).toEqual({ state: 'ready', version: BUILD });
    expect(state.calls).toEqual([{ binary: CONFIG.runtimePython, args: ['-m', 'venv', CONFIG.venvDir] }]);
    expect(state.written).toBe(BUILD);
  });

  test('a stale venv from an older build is rebuilt against the current one', async () => {
    const { io, state } = fakeIo('3.12.0+old', [ranOk(), ranOk()]);
    const service = createPythonService(io, CONFIG);

    await service.provision();
    expect(state.removed).toBe(1);
    expect(state.written).toBe(BUILD);
  });

  test('when the venv cannot be created, provision fails and never reaches pip or stamps the build', async () => {
    const { io, state } = fakeIo(undefined, [{ ran: true, code: 1, stdout: '', stderr: 'venv: permission denied', timedOut: false }]);
    const service = createPythonService(io, CONFIG);

    const status = await service.provision();
    expect(status.state).toBe('failed');
    expect(status).toMatchObject({ message: expect.stringContaining('permission denied') });
    expect(state.calls).toHaveLength(1);
    expect(state.written).toBeUndefined();
  });

  test('when the offline seed fails, provision fails and does not stamp the build', async () => {
    const { io, state } = fakeIo(undefined, [ranOk(), { ran: true, code: 1, stdout: '', stderr: 'No matching distribution found', timedOut: false }]);
    const service = createPythonService(io, CONFIG);

    const status = await service.provision();
    expect(status).toMatchObject({ state: 'failed', message: expect.stringContaining('No matching distribution') });
    expect(state.written).toBeUndefined();
  });

  test('when python cannot be launched at all, provision reports the launch failure', async () => {
    const { io } = fakeIo(undefined, [{ ran: false, message: 'ENOENT: no such file' }]);
    const service = createPythonService(io, CONFIG);

    expect(await service.provision()).toMatchObject({ state: 'failed', message: expect.stringContaining('ENOENT') });
  });

  test('a seed that times out reports a timeout rather than hanging', async () => {
    const { io } = fakeIo(undefined, [ranOk(), { ran: true, code: 143, stdout: '', stderr: '', timedOut: true }]);
    const service = createPythonService(io, CONFIG);

    expect(await service.provision()).toMatchObject({ state: 'failed', message: expect.stringContaining('timed out') });
  });

  test('concurrent provisions share one build rather than racing', async () => {
    const { io, state } = fakeIo(undefined, [ranOk(), ranOk()]);
    const service = createPythonService(io, CONFIG);

    const [a, b] = await Promise.all([service.provision(), service.provision()]);
    expect(a).toEqual(b);
    expect(state.removed).toBe(1);
    expect(state.calls).toHaveLength(2);
  });

  test('status reads the marker without running anything', async () => {
    const { io, state } = fakeIo(BUILD, []);
    const service = createPythonService(io, CONFIG);

    expect(await service.status()).toEqual({ state: 'ready', version: BUILD });
    expect(state.calls).toEqual([]);
  });

  test('status reports provisioning while a build is in flight', async () => {
    const io: PythonIo = {
      run: () => new Promise<PythonRunOutcome>(() => undefined), // hangs: the build never finishes
      readMarker: () => Promise.resolve(undefined),
      writeMarker: () => Promise.resolve(),
      removeVenv: () => Promise.resolve(),
    };
    const service = createPythonService(io, CONFIG);

    void service.provision();
    expect(await service.status()).toEqual({ state: 'provisioning' });
  });
});
