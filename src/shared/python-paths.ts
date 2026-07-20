/*
 * Where the embedded Python runtime and its per-user venv live.
 *
 * Pure on purpose, like paths.ts: the runtime folder and userData arrive as parameters,
 * so electron stays out of src/shared/** and the layout is unit-tested on either OS. The
 * runtime is a python-build-standalone tarball that always extracts to a `python/` folder;
 * the venv is created once under userData and every `pip install` lands in it.
 *
 * The two layouts differ on Windows (python.exe at the root vs bin/python3; Scripts\ vs
 * bin/), so the platform-taking functions join with the target OS's own separator via
 * node:path's posix/win32 sub-namespaces. That makes the Windows branch produce real
 * backslash paths even when the tests run on macOS. node:path is manipulation, not IO,
 * so it is allowed anywhere (rule 20).
 */
import { join, posix, win32 } from 'node:path';

export type PythonPlatform = 'win32' | 'unix';

export const platformOf = (nodePlatform: string): PythonPlatform => (nodePlatform === 'win32' ? 'win32' : 'unix');

// <userData>/py — deliberately short so venv + site-packages nesting stays clear of the
// Windows 260-char MAX_PATH limit.
export const pythonVenvDir = (userData: string): string => join(userData, 'py');

// The tarball extracts to a single `python/` folder; the interpreter sits at the root on
// Windows and under bin/ elsewhere.
export const runtimePythonPath = (runtimeDir: string, platform: PythonPlatform): string =>
  platform === 'win32' ? win32.join(runtimeDir, 'python', 'python.exe') : posix.join(runtimeDir, 'python', 'bin', 'python3');

// The venv interpreter, used to run `-m venv`, `-m pip`, and every agent `python3` call.
export const venvPythonPath = (venvDir: string, platform: PythonPlatform): string =>
  platform === 'win32' ? win32.join(venvDir, 'Scripts', 'python.exe') : posix.join(venvDir, 'bin', 'python');

// A stamp holding the runtime build the venv was created against. A venv embeds its
// interpreter's absolute prefix, so a runtime bump must force a rebuild; comparing this
// against the current build is how the service decides to re-provision.
export const provisionMarkerPath = (venvDir: string): string => join(venvDir, '.provisioned');
