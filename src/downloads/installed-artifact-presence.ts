import { Directory, File } from 'expo-file-system';
import type { InstalledArtifactLocation } from '../storage/installed-source-presence';

/**
 * An installed artifact is present only when both its directory and the manifest written at the end
 * of a successful install are on disk. Requiring the manifest keeps a restored or half-deleted
 * directory from passing as an install.
 */
export function isInstalledArtifactPresent({ localRootUri, manifestUri }: InstalledArtifactLocation): boolean {
  return new Directory(localRootUri).exists && new File(manifestUri).exists;
}
