/*
 * The embedded Python provision state, and how the venv marker maps to it.
 *
 * The venv is created against a specific runtime build and stamped with a marker holding
 * that build string. A match means the venv is current and ready; a missing or older
 * marker means it must be (re)built, because a venv embeds its interpreter's absolute
 * prefix and cannot survive a runtime bump. Pure so it is unit-tested and shared with the
 * IPC layer (rule 16 status, not an error).
 */
export type PythonStatus =
  | { readonly state: 'not-provisioned' }
  | { readonly state: 'provisioning' }
  | { readonly state: 'ready'; readonly version: string }
  | { readonly state: 'failed'; readonly message: string };

export const statusFromMarker = (marker: string | undefined, build: string): PythonStatus => (marker === build ? { state: 'ready', version: build } : { state: 'not-provisioned' });
