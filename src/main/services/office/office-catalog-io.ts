/*
 * Reads the Microsoft 365 CLI's own commands.json off disk, once.
 *
 * The thin IO shell around office-catalog: the parsing and grouping are pure and
 * tested there, this only reads the file and remembers the answer. A failure is an
 * empty catalog rather than an error the caller must handle: the settings screen then
 * has nothing to list, and the guard falls back to blocking only what it knows by name
 * (the sign-in commands and the destructive shell shapes). Neither is worth failing a
 * launch over.
 */
import { readFileSync } from 'node:fs';
import { commandCategoryIndex, parseOfficeCatalog } from '../../../shared/office-catalog.ts';
import type { OfficeCategory } from '../../../shared/office-catalog.ts';

export type OfficeCatalog = {
  readonly categories: () => readonly OfficeCategory[];
  readonly commandCategories: () => ReadonlyMap<string, string>;
};

const readCatalog = (catalogPath: string): readonly OfficeCategory[] => {
  try {
    const parsed = parseOfficeCatalog(JSON.parse(readFileSync(catalogPath, 'utf8')));
    return parsed.ok ? parsed.value : [];
  } catch {
    return [];
  }
};

// Read once at launch: the file ships inside the CLI package and cannot change while
// the app runs.
export const createOfficeCatalog = (catalogPath: string): OfficeCatalog => {
  const categories = readCatalog(catalogPath);
  const index = commandCategoryIndex(categories);
  return { categories: () => categories, commandCategories: () => index };
};
