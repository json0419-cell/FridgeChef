export function assertValidTestEmbedding(vector: Float32Array, expectedDimension: number): void {
  if (vector.length !== expectedDimension) {
    throw new Error('Model test embedding has an unexpected dimension.');
  }

  let squaredNorm = 0;
  for (const value of vector) {
    if (!Number.isFinite(value)) {
      throw new Error('Model test embedding contains a non-finite value.');
    }
    squaredNorm += value * value;
  }

  const norm = Math.sqrt(squaredNorm);
  if (norm < 0.98 || norm > 1.02) {
    throw new Error('Model test embedding is not normalized.');
  }
}
