import { describe, expect, test } from 'bun:test';
import { isCategoryEnabled, toggleCategory } from './office-policy.ts';

describe('deciding which parts of Microsoft 365 the agent may use', () => {
  test('with nothing configured everything is available', () => {
    expect(isCategoryEnabled(undefined, 'mail')).toBe(true);
  });

  test('with nothing switched off everything is available', () => {
    expect(isCategoryEnabled({ disabledCategories: [] }, 'mail')).toBe(true);
  });

  test('a category the user switched off is refused', () => {
    expect(isCategoryEnabled({ disabledCategories: ['calendar'] }, 'calendar')).toBe(false);
  });

  test('switching one category off leaves the others alone', () => {
    expect(isCategoryEnabled({ disabledCategories: ['calendar'] }, 'mail')).toBe(true);
  });

  test('a category the CLI added later is available without anyone editing settings', () => {
    // The stored list names what is off, so an unknown name is simply on.
    expect(isCategoryEnabled({ disabledCategories: ['calendar'] }, 'bookings')).toBe(true);
  });

  test('the self-check category cannot be switched off', () => {
    // Without it the agent cannot tell the user why anything failed.
    expect(isCategoryEnabled({ disabledCategories: ['meta'] }, 'meta')).toBe(true);
  });
});

describe('switching a category on and off', () => {
  test('switching one off records it', () => {
    expect(toggleCategory(undefined, 'calendar', false)).toEqual({ disabledCategories: ['calendar'] });
  });

  test('switching it back on removes it', () => {
    expect(toggleCategory({ disabledCategories: ['calendar', 'mail'] }, 'calendar', true)).toEqual({ disabledCategories: ['mail'] });
  });

  test('the list is sorted, so saving the same set twice does not churn the file', () => {
    const off = toggleCategory(toggleCategory(undefined, 'mail', false), 'calendar', false);

    expect(off.disabledCategories).toEqual(['calendar', 'mail']);
  });

  test('switching the same category off twice records it once', () => {
    expect(toggleCategory({ disabledCategories: ['calendar'] }, 'calendar', false)).toEqual({ disabledCategories: ['calendar'] });
  });

  test('switching one back on that was never off changes nothing', () => {
    expect(toggleCategory({ disabledCategories: ['mail'] }, 'calendar', true)).toEqual({ disabledCategories: ['mail'] });
  });

  test('the self-check category cannot be switched off', () => {
    expect(toggleCategory({ disabledCategories: [] }, 'meta', false)).toEqual({ disabledCategories: [] });
  });
});
