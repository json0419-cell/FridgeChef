// Single-pack removal from Dataset Library, covering the finding triaged onto issue #24: the
// registry must never claim an installed pack whose files are gone, at any injected failure point.

import type { InstalledDataset } from '../src/types';

interface FakeDirectory {
  uri: string;
  exists: boolean;
  deleted: boolean;
}

const mockState = {
  root: 'file:///documents/datasets',
  directories: new Map<string, FakeDirectory>(),
  registry: [] as string[],
  failRegistryRead: false,
  failRegistryWrite: false,
  failDelete: false,
};

jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///documents' },
  File: class {},
  Directory: class {
    uri: string;

    constructor(...parts: Array<string | { uri: string }>) {
      const joined = parts
        .map((part) => (typeof part === 'string' ? part : part.uri))
        .join('/')
        .replace(/\/+$/, '');
      this.uri = joined.startsWith('file:///') ? joined : `file:///${joined.replace(/^\/+/, '')}`;
    }

    get exists() {
      return mockState.directories.get(this.uri)?.exists ?? false;
    }

    delete() {
      if (mockState.failDelete) {
        throw new Error('Injected delete failure');
      }
      const directory = mockState.directories.get(this.uri);
      if (directory) {
        directory.exists = false;
        directory.deleted = true;
      }
    }
  },
}));
jest.mock('../src/datasets/datasetRegistry', () => ({
  listInstalledDatasets: async () => mockReadRegistry(),
  saveInstalledDataset: async () => undefined,
  createInstalledDatasetFromManifest: () => undefined,
  removeInstalledDataset: async (datasetId: string) => {
    const records = mockReadRegistry();
    if (mockState.failRegistryWrite) {
      throw new Error('Injected registry write failure');
    }
    mockState.registry = records.filter((id) => id !== datasetId);
  },
}));

function mockReadRegistry() {
  if (mockState.failRegistryRead) {
    throw new Error('datasetRegistry: REGISTRY_READ_FAILED');
  }
  return [...mockState.registry];
}

const { uninstallDataset } = require('../src/datasets/datasetPack') as {
  uninstallDataset: (dataset: InstalledDataset) => Promise<void>;
};

const packUri = 'file:///documents/datasets/official-lite_1.0.0';
const otherPackUri = 'file:///documents/datasets/official-full_2.11.3';

describe('uninstalling one downloaded pack', () => {
  beforeEach(() => {
    mockState.directories = new Map([
      [packUri, { uri: packUri, exists: true, deleted: false }],
      [otherPackUri, { uri: otherPackUri, exists: true, deleted: false }],
    ]);
    mockState.registry = ['official-lite', 'official-full'];
    mockState.failRegistryRead = false;
    mockState.failRegistryWrite = false;
    mockState.failDelete = false;
  });

  it('removes the record and the files, leaving the other pack untouched', async () => {
    await uninstallDataset(dataset());

    expect(mockState.registry).toEqual(['official-full']);
    expect(mockState.directories.get(packUri)?.deleted).toBe(true);
    expect(mockState.directories.get(otherPackUri)?.deleted).toBe(false);
  });

  it.each([
    ['the registry cannot be read', 'failRegistryRead', /REGISTRY_READ_FAILED/],
    ['the registry write fails', 'failRegistryWrite', /Injected registry write failure/],
  ] as const)('deletes no file when %s', async (_label, failure, expected) => {
    mockState[failure] = true;

    await expect(uninstallDataset(dataset())).rejects.toThrow(expected);

    expect(mockState.registry).toEqual(['official-lite', 'official-full']);
    expect(mockState.directories.get(packUri)?.exists).toBe(true);
  });

  it('drops the record first, so a failed deletion only orphans files', async () => {
    mockState.failDelete = true;

    await expect(uninstallDataset(dataset())).rejects.toThrow(/Injected delete failure/);

    // The registry no longer claims a pack, which is the state the criterion protects. The files
    // are merely orphaned, and the other pack's record is still intact.
    expect(mockState.registry).toEqual(['official-full']);
    expect(mockState.directories.get(packUri)?.exists).toBe(true);
  });

  it('refuses a pack directory outside the datasets root without touching the registry', async () => {
    const outside = 'file:///documents/models/bge-m3_1.0.0';
    mockState.directories.set(outside, { uri: outside, exists: true, deleted: false });

    await expect(uninstallDataset({ ...dataset(), localRootUri: outside })).rejects.toThrow(/datasets/);

    expect(mockState.registry).toEqual(['official-lite', 'official-full']);
    expect(mockState.directories.get(outside)?.exists).toBe(true);
  });
});

function dataset(): InstalledDataset {
  return {
    id: 'official-lite',
    name: 'Official Lite',
    version: '1.0.0',
    description: '',
    level: 'lite',
    recipeCount: 300,
    chunkCount: 300,
    localRootUri: packUri,
    manifestUri: `${packUri}/dataset-pack.json`,
    installedAt: '2026-09-10T00:00:00.000Z',
    active: false,
    status: 'installed',
    sizeBytes: 1024,
    embeddingModel: 'bge-m3',
    embeddingDimension: 1024,
  };
}
