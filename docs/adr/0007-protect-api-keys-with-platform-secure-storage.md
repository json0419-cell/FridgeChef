---
status: accepted
---

# Protect API keys with platform secure storage

Gemini API keys are credentials and must be stored through a platform-secure storage implementation backed by Android Keystore where the platform supports it. They must never be stored in plain AsyncStorage, a SQLite column, application logs, Diagnostic Information, exported user data, Android backup, screenshots produced by the app, or source-controlled configuration.

Ordinary local product data, including ingredients, preferences, history, and personal recipes, relies on the Android application sandbox and is not placed in a custom encrypted database for version 1.0. This boundary prioritizes protection of reusable credentials while avoiding the migration, recovery, performance, and corruption risks of application-managed whole-database encryption.

## Consequences

The API key entry UI masks the key by default and supports explicit paste, reveal, replace, test, and delete actions. Credential entry and reveal screens prevent system screenshots and redact their content from the recent-task preview; this protection does not apply to ordinary recipe, recommendation, or diagnostic screens. Key values must be redacted from errors and network diagnostics. Migration from any existing insecure key location must move the value into secure storage and remove the original only after the secure write succeeds; failed migration keeps Recommendation locked and explains how the user can enter the key again.

Removing the API key immediately makes the app not Recommendation Ready but does not delete ingredients, recipes, history, downloaded artifacts, or already cached Recommendations. Clearing all user data includes deleting the secure credential. Future iOS support must use the equivalent platform keychain boundary rather than reproducing an Android-specific storage API.
