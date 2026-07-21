/*
 * Which Microsoft 365 categories the agent may use.
 *
 * Stored as the categories that are switched OFF, so that switching nothing off (the
 * normal case) stores nothing, and a category the CLI adds in a later version is
 * available without anyone editing settings.
 *
 * `meta` is never disableable: it holds the sign-in self-check and the paging helpers,
 * and turning it off would leave the agent unable to tell the user why anything failed.
 *
 * Pure: zero electron imports, so `bun test` covers it.
 */
import type { OfficePolicy } from './types.ts';

export const ALWAYS_ENABLED_CATEGORY = 'meta';

export const isCategoryEnabled = (policy: OfficePolicy | undefined, category: string): boolean => {
  if (category === ALWAYS_ENABLED_CATEGORY) return true;
  return !(policy?.disabledCategories.includes(category) ?? false);
};

// Normalised on the way in: sorted and deduplicated, so the file does not churn when
// the same set is saved twice.
export const toggleCategory = (policy: OfficePolicy | undefined, category: string, enabled: boolean): OfficePolicy => {
  const current = new Set(policy?.disabledCategories ?? []);
  if (enabled || category === ALWAYS_ENABLED_CATEGORY) current.delete(category);
  else current.add(category);
  return { disabledCategories: [...current].sort((a, b) => a.localeCompare(b)) };
};
