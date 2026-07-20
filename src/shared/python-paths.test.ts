import { describe, expect, test } from 'bun:test';
import { platformOf, provisionMarkerPath, pythonVenvDir, runtimePythonPath, venvPythonPath } from './python-paths.ts';

const USER_DATA = '/Users/someone/Library/Application Support/ask-marcel-studio';
const RUNTIME = '/Applications/Ask Marcel Studio.app/Contents/Resources/python-runtime';

describe('locating the embedded python runtime and its per-user venv', () => {
  test('the venv lives in a short folder under the data folder, clear of the Windows path limit', () => {
    expect(pythonVenvDir(USER_DATA)).toBe(`${USER_DATA}/py`);
  });

  test('on unix the runtime binary is python/bin/python3 inside the runtime folder', () => {
    expect(runtimePythonPath(RUNTIME, 'unix')).toBe(`${RUNTIME}/python/bin/python3`);
  });

  test('on windows the runtime binary is python\\python.exe', () => {
    expect(runtimePythonPath('C:\\rt', 'win32')).toBe('C:\\rt\\python\\python.exe');
  });

  test('on unix the venv interpreter is bin/python', () => {
    expect(venvPythonPath(`${USER_DATA}/py`, 'unix')).toBe(`${USER_DATA}/py/bin/python`);
  });

  test('on windows the venv interpreter is Scripts\\python.exe', () => {
    expect(venvPythonPath('C:\\u\\py', 'win32')).toBe('C:\\u\\py\\Scripts\\python.exe');
  });

  test('the provision marker sits in the venv and records the build it was made against', () => {
    expect(provisionMarkerPath(`${USER_DATA}/py`)).toBe(`${USER_DATA}/py/.provisioned`);
  });

  test('the host platform string collapses to just win32 or unix', () => {
    expect(platformOf('win32')).toBe('win32');
    expect(platformOf('darwin')).toBe('unix');
  });
});
