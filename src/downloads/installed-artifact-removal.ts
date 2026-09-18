// Removing installed Official DatasetPacks and embedding model packs means changing two stores that
// fail independently: the installed-source registry and the files on disk.
//
// The registry record goes first, always. If that write fails nothing is deleted at all, and if the
// file deletion then fails the files are merely orphaned — they cost space until the user retries,
// and the retry deletes them. The opposite order cannot recover: a record naming files that are
// gone leaves a pack the app believes it has installed and the user cannot use or reinstall over.
// Orphaned files are never swept as partial downloads, because they keep their installed name.

export async function removeInstalledArtifact({
  removeRecord,
  deleteArtifactFiles,
}: {
  removeRecord: () => Promise<void>;
  deleteArtifactFiles: () => void;
}): Promise<void> {
  await removeRecord();
  deleteArtifactFiles();
}
