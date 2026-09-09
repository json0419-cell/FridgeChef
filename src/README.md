# Source structure

The application source is organized by responsibility:

```text
src/
  application/  application composition and navigation
  features/     user-facing business capabilities
  shared/       reusable UI and design tokens
  ai/           Gemini transport and response parsing
  datasets/     official DatasetPack lifecycle
  db/           SQLite initialization and repositories
  downloads/    reusable download security primitives
  i18n/         translations and language state
  privacy/      AI disclosure and consent state
  rag/          local embedding and retrieval pipeline
  storage/      non-database settings and caches
  data/         bundled seed data
  types.ts      shared domain and navigation types
```

## Dependency direction

1. `application` composes feature public APIs and global providers.
2. A feature exposes its public UI/hooks through its `index.ts`.
3. Feature screens may depend on `shared` and infrastructure/domain modules.
4. `shared` must not import from a feature.
5. Infrastructure/domain modules must not import from `features`.
6. Cross-feature imports should use the target feature's `index.ts`, not its internal folders.

## Feature layout

```text
features/<feature>/
  index.ts       public exports
  screens/       navigation-level React components
  hooks/         feature-specific React hooks
  services/      feature-specific pure logic or orchestration
```

Keep code in a feature when it primarily supports one user capability. Move it to `shared` only after it is genuinely reused across multiple features. Network, persistence, download integrity, and RAG code remain outside UI features because they form reusable application infrastructure.
