import { FileMode, type File } from 'expo-file-system';
import { calculateStreamingSha256 } from './streaming-sha256';

export async function calculateFileSha256(file: File, fileSize: number): Promise<string> {
  const handle = file.open(FileMode.ReadOnly);

  try {
    return await calculateStreamingSha256(fileSize, (length) => handle.readBytes(length));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}（${file.name}）`);
  } finally {
    handle.close();
  }
}
