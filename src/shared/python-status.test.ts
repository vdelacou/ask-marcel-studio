import { describe, expect, test } from 'bun:test';
import { statusFromMarker } from './python-status.ts';

const BUILD = '3.13.14+20260718';

describe('reading the embedded python provision state from its marker', () => {
  test('a marker matching the current build means the venv is ready', () => {
    expect(statusFromMarker(BUILD, BUILD)).toEqual({ state: 'ready', version: BUILD });
  });

  test('a missing marker means nothing is provisioned yet', () => {
    expect(statusFromMarker(undefined, BUILD)).toEqual({ state: 'not-provisioned' });
  });

  test('a marker from an older build means the venv must be rebuilt', () => {
    expect(statusFromMarker('3.12.0+20250101', BUILD)).toEqual({ state: 'not-provisioned' });
  });
});
