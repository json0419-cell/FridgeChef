---
status: accepted
---

# Require signatures for official packs and models

The app verifies the publisher identity of the official dataset index, Official DatasetPack manifests, and embedding model manifests with a bundled public key. File SHA-256 validation remains mandatory because signatures establish publisher identity while hashes verify downloaded file integrity. The public app accepts only signed official model manifests and never loads an ONNX model from an arbitrary user URL.

## Consequences

Recipe packs installed from arbitrary URLs remain supported but are labeled as Unverified DatasetPacks and can contain data only, never scripts, native libraries, or dynamic code. Before installation, the app shows the source domain, declared total size, and unverified status. Existing path, URL, size, count, staging, and hash validation still applies. Key rotation and signature versioning must be designed before the first signed production manifest is published.
