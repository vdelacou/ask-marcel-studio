/*
 * Which SDK transcript folders to sweep, and which stale files to trim.
 *
 * The Claude Agent SDK writes a transcript per conversation workspace under
 * claude-config/projects/<encoded-workspace-path>/. Nothing ever cleaned them, so they had
 * grown to ~193 MB with a folder for every conversation ever opened, most long deleted.
 *
 * A live conversation's transcript is never age-capped: its sdkSessionId resumes from it
 * for the whole life of the conversation. So the rule is: keep the folder of every
 * conversation that still exists (and the background workspace, which never resumes), sweep
 * the rest, and cap the background workspace's own transcripts by age since it accumulates
 * without bound.
 *
 * Pure: the encoding and the set arithmetic here; the readdir and rm are the IO shell's.
 */

// The SDK derives a project folder name from a workspace's absolute path by replacing every
// non-alphanumeric run... actually every non-alphanumeric CHARACTER, with a dash. Pinned by
// a test against a real on-disk name.
export const sdkProjectDirName = (absoluteWorkspacePath: string): string => absoluteWorkspacePath.replace(/[^A-Za-z0-9]/g, '-');

// The folders to delete: every project folder present that is not one we mean to keep.
export const planTranscriptSweep = (input: { readonly present: readonly string[]; readonly keep: readonly string[] }): readonly string[] => {
  const keep = new Set(input.keep);
  return input.present.filter((name) => !keep.has(name));
};

// Inside the background workspace's own transcript folder, the jsonl files older than the
// cutoff. It never resumes, so its history is disposable; other folders are kept whole.
export const staleJsonl = (files: readonly { readonly name: string; readonly mtimeMs: number }[], cutoffMs: number): readonly string[] =>
  files.filter((file) => file.name.endsWith('.jsonl') && file.mtimeMs < cutoffMs).map((file) => file.name);
