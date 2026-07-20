/*
 * Assigns each provider a stable id, so the user never has to invent one.
 *
 * The id is the key half of a `providerId::modelId` reference (model-ref.ts), which
 * every conversation and the default model persist against. That makes it load-bearing
 * and, once set, immutable: regenerating it would orphan every stored reference. So a
 * provider that already has an id keeps it untouched; a new one (blank id) gets a slug
 * of its label, deduped against the others, falling back to its kind when the label has
 * no usable characters. A slug is [a-z0-9-] only, so it can never contain the '::'
 * separator the reference is split on.
 */
import type { Provider } from './types.ts';

const slugify = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const dedupe = (base: string, used: ReadonlySet<string>): string => {
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
};

export const assignProviderIds = (providers: readonly Provider[]): readonly Provider[] => {
  // Every existing id is reserved up front so a generated slug never lands on one. New
  // providers contribute a blank id here, which is harmless: a slug is never empty (it
  // falls back to the kind), so a blank can never collide with one.
  const used = new Set(providers.map((p) => p.id));
  return providers.map((provider) => {
    if (provider.id.length > 0) return provider;
    const id = dedupe(slugify(provider.label) || provider.kind, used);
    used.add(id);
    return { ...provider, id };
  });
};
