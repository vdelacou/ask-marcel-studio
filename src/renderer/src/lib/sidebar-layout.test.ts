import { describe, expect, test } from 'bun:test';
import { DEFAULT_SIDEBAR, clampSidebarWidth, parseSidebarLayout, resolveDrag, serialiseSidebarLayout } from './sidebar-layout.ts';

describe('sizing the sidebar', () => {
  test('a comfortable width is kept as it is', () => {
    expect(clampSidebarWidth(260)).toBe(260);
  });

  test('a width dragged past the maximum stops at the maximum', () => {
    expect(clampSidebarWidth(900)).toBe(400);
  });

  test('a width dragged under the minimum stops at the minimum, so a title stays readable', () => {
    expect(clampSidebarWidth(20)).toBe(180);
  });
});

describe('dragging the sidebar edge', () => {
  test('dragging right widens it by exactly how far the pointer moved', () => {
    expect(resolveDrag(240, 240, 300)).toEqual({ width: 300, collapsed: false });
  });

  test('dragging left narrows it, down to the minimum', () => {
    expect(resolveDrag(240, 240, 200)).toEqual({ width: 200, collapsed: false });
  });

  test('dragging hard to the left closes the sidebar instead of leaving a useless sliver', () => {
    expect(resolveDrag(240, 240, 60).collapsed).toBe(true);
  });

  test('a sidebar dragged shut keeps the width it had, so reopening it looks the same', () => {
    expect(resolveDrag(320, 320, 40).width).toBe(320);
  });
});

describe('remembering the sidebar between launches', () => {
  test('a layout written by a previous launch comes back as it was', () => {
    expect(parseSidebarLayout(serialiseSidebarLayout({ width: 300, collapsed: true }))).toEqual({ width: 300, collapsed: true });
  });

  test('nothing stored yet means the default', () => {
    expect(parseSidebarLayout(null)).toEqual(DEFAULT_SIDEBAR);
  });

  test('a stored value that is not layout at all falls back to the default instead of throwing', () => {
    expect(parseSidebarLayout('{oops')).toEqual(DEFAULT_SIDEBAR);
  });

  test('a stored width outside the allowed range is brought back inside it', () => {
    expect(parseSidebarLayout(JSON.stringify({ width: 5000, collapsed: false })).width).toBe(400);
  });

  test('a stored layout missing its fields reads as the default', () => {
    expect(parseSidebarLayout(JSON.stringify({ width: 'wide' }))).toEqual(DEFAULT_SIDEBAR);
  });
});
