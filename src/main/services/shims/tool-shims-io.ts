/*
 * The tool-shim IO shell: write the node/npm/npx PATH shims into <userData>/bin.
 *
 * The pure content is shared/tool-shims.ts; this file only touches the filesystem, so it
 * carries no unit tests and stays out of the coverage tiers, mirroring office-io.ts. The
 * unix shims are made executable so the agent's PATH resolves them; the .cmd twins are for
 * Windows. node:fs (not Bun.write) because the main process runs Electron's Node runtime
 * and chmod has no Bun equivalent. See .claude/LESSONS.md (rule 20 in the main process).
 */
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { toolShimScripts } from '../../../shared/tool-shims.ts';
import type { ShimPair } from '../../../shared/tool-shims.ts';
import { binDir, npmCacheDir, npmPrefixDir, pipCacheDir } from '../../../shared/paths.ts';
import { platformOf, pythonVenvDir, venvPythonPath } from '../../../shared/python-paths.ts';

export type ToolCliLocation = {
  readonly execPath: string;
  readonly npmCliPath: string;
  readonly npxCliPath: string;
};

const writeShimPair = async (dir: string, name: string, pair: ShimPair): Promise<void> => {
  const unixPath = join(dir, name);
  await writeFile(unixPath, pair.unix, 'utf8');
  await chmod(unixPath, 0o755);
  await writeFile(join(dir, `${name}.cmd`), pair.windows, 'utf8');
};

export const writeToolShims = async (userData: string, location: ToolCliLocation): Promise<void> => {
  const dir = binDir(userData);
  // Directory boundary: Bun has no mkdir, so node:fs is the sanctioned tool (rule 20).
  await mkdir(dir, { recursive: true });
  const pythonPath = venvPythonPath(pythonVenvDir(userData), platformOf(process.platform));
  const scripts = toolShimScripts({ ...location, npmPrefixDir: npmPrefixDir(userData), npmCacheDir: npmCacheDir(userData), pythonPath, pipCacheDir: pipCacheDir(userData) });
  // python3/pip3 are aliases of python/pip: the agent reaches for either name.
  const shims: readonly (readonly [string, ShimPair])[] = [
    ['node', scripts.node],
    ['npm', scripts.npm],
    ['npx', scripts.npx],
    ['python', scripts.python],
    ['python3', scripts.python],
    ['pip', scripts.pip],
    ['pip3', scripts.pip],
  ];
  await Promise.all(shims.map(([name, pair]) => writeShimPair(dir, name, pair)));
};
