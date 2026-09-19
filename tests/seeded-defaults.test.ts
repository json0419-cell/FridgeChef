import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEGACY_SEEDED_DEFAULT_TEXT,
  SEEDED_DEFAULT_MARKER,
  holdsSeededDefault,
  resolveSeededDefault,
} from '../src/db/seeded-defaults.ts';

// The wording each language shows for a Personal Recipe Library the app named itself.
const defaultLibraryName = { zh: '我的菜谱库', en: 'My Recipe Library' };

test('a library the app named reads in the language it is being read in', () => {
  const stored = SEEDED_DEFAULT_MARKER;

  assert.equal(resolveSeededDefault(stored, defaultLibraryName.zh), '我的菜谱库');
  assert.equal(resolveSeededDefault(stored, defaultLibraryName.en), 'My Recipe Library');
});

test('a library the user named keeps that name in every language', () => {
  const stored = 'Weeknight dinners';

  assert.equal(resolveSeededDefault(stored, defaultLibraryName.zh), 'Weeknight dinners');
  assert.equal(resolveSeededDefault(stored, defaultLibraryName.en), 'Weeknight dinners');
});

// A user is free to type the words the app used to store, and that choice is theirs to keep.
test('text that happens to match the old default wording is still the user’s own', () => {
  const stored = LEGACY_SEEDED_DEFAULT_TEXT.userRecipeLibraryName;

  assert.equal(holdsSeededDefault(stored), false);
  assert.equal(resolveSeededDefault(stored, defaultLibraryName.en), '我的菜谱库');
});

test('blank and missing values are read as the app’s default, never as an empty label', () => {
  for (const stored of [SEEDED_DEFAULT_MARKER, '   ', null, undefined]) {
    assert.equal(holdsSeededDefault(stored), true);
    assert.equal(resolveSeededDefault(stored, defaultLibraryName.en), 'My Recipe Library');
  }
});
