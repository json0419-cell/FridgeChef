import assert from 'node:assert/strict';
import test from 'node:test';
import {
  backupDirectoryName,
  isPartialDownloadName,
  removePartialDownloads,
  resumableStagingDirectoryName,
  stagingDirectoryName,
  type RemovableEntry,
} from '../src/downloads/temporary-download-artifacts.ts';

const keptNames = [
  'official-lite_1.0.0',
  'official-full_2.11.3',
  'bge-m3_1.0.0',
  'dataset-pack.json',
  'model-pack.json',
  'vectors.f32',
  'chunks.download.jsonl',
  'downloads',
];

test('both staging names a download creates are recognized as partial downloads', () => {
  for (const base of ['official-lite_1.0.0', 'bge-m3_1.0.0']) {
    for (const name of [stagingDirectoryName(base), resumableStagingDirectoryName(base)]) {
      assert.equal(isPartialDownloadName(name), true, `${name} must be a partial download`);
    }
  }
});

test('a backup directory holds an installed pack and is never a partial download', () => {
  // The commit path parks the previous install here and moves it back on rollback, so sweeping one
  // would destroy an installed pack mid-install.
  for (const base of ['official-lite_1.0.0', 'bge-m3_1.0.0']) {
    assert.equal(isPartialDownloadName(backupDirectoryName(base)), false);
  }
});

test('installed pack and model entries are never recognized as partial downloads', () => {
  for (const name of keptNames) {
    assert.equal(isPartialDownloadName(name), false, `${name} must be kept`);
  }
});

test('partial downloads are removed and every other entry is left in place', () => {
  const partialNames = [
    stagingDirectoryName('official-lite_1.0.0'),
    resumableStagingDirectoryName('bge-m3_1.0.0'),
  ];
  const preservedNames = [...keptNames, backupDirectoryName('official-full_2.11.3')];
  const entries = [...preservedNames, ...partialNames].map((name) => createEntry(name));

  removePartialDownloads(entries);

  assert.deepEqual(
    entries.filter((entry) => entry.deleted).map((entry) => entry.name),
    partialNames,
  );
  assert.deepEqual(
    entries.filter((entry) => !entry.deleted).map((entry) => entry.name),
    preservedNames,
  );
});

test('a failed removal still sweeps the rest and reports no file path', () => {
  const failing = createEntry(
    stagingDirectoryName('official-lite_1.0.0'),
    '/data/user/0/app/datasets/secret',
  );
  const entries = [
    failing,
    createEntry(resumableStagingDirectoryName('bge-m3_1.0.0')),
    createEntry('official-lite_1.0.0'),
  ];

  assert.throws(
    () => removePartialDownloads(entries),
    (error) => {
      assert.equal(error instanceof Error, true);
      const message = (error as Error).message;
      assert.equal(message.includes('/data/user/0'), false);
      assert.equal(message.includes(failing.name), false);
      return true;
    },
  );

  assert.equal(entries[1].deleted, true);
  assert.equal(entries[2].deleted, false);
});

interface TestEntry extends RemovableEntry {
  deleted: boolean;
}

function createEntry(name: string, failureDetail?: string): TestEntry {
  return {
    name,
    deleted: false,
    delete() {
      if (failureDetail) {
        throw new Error(`Injected delete failure at ${failureDetail}`);
      }
      this.deleted = true;
    },
  };
}
