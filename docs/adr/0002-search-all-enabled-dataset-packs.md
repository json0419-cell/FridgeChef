---
status: accepted
---

# Search every enabled Official DatasetPack

Local Retrieval searches every Official DatasetPack the user explicitly enabled. Disabled packs do not participate. When at least one official pack is enabled, the Base Recipe Library does not contribute candidates; the base library is used normally only when no official pack is enabled. Candidates from every active source enter one ranking pool and are deduplicated by stable recipe ID or content fingerprint rather than by title.

## Consequences

Retrieval, cache signatures, and result invalidation must include the ID and version of every enabled pack and cannot assume a single active dataset. Personal Recipes from every Enabled Personal Recipe Library share the ranking pool with official candidates and receive a small source boost; disabled personal libraries do not participate. The UI displays recipe provenance, but provenance does not guarantee selection. If enabled packs are corrupt, unreadable, or all time out, the app explains the failure and falls back to the Base Recipe Library for that request without changing the user's enabled state.

Creating, editing, deleting, enabling, or disabling a Personal Recipe or its library must update the retrieval index and invalidate affected caches atomically from the user's perspective. Changing UI language must not revive stale entries. A disabled or deleted Personal Recipe must never appear in a newly generated Recommendation batch.
