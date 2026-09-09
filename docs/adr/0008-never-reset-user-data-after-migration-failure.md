---
status: accepted
---

# Never reset user data after a migration failure

Database and persistent-state migrations must be transactional or otherwise staged so a failure leaves the last known readable user data intact. The app never treats deletion and recreation of user storage as an automatic recovery path. This decision protects ingredients, history, preferences, personal recipes, and installed-source state at the cost of additional migration fixtures, compatibility code, and explicit recovery UI.

## Consequences

Every public schema version needs an upgrade path to the current version and a test fixture that represents valid data from that version. A failed migration stops dependent writes, preserves the original data, and presents retry guidance plus redacted Diagnostic Information. Unaffected features may remain available only when they cannot mutate or reinterpret the failed store.

Recovery must be explicit. A user may export or preserve recoverable data when a supported mechanism exists, retry after an app update, or deliberately choose a destructive reset after a clear confirmation. The app must not continue with a partially migrated schema, silently discard invalid records, or report migration success before the new store is durable.
