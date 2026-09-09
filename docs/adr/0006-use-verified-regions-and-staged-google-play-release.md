---
status: accepted
---

# Use verified regions and a staged Google Play release

FridgeChef 1.0 is distributed only in regions where the release team has verified Google Play availability, Gemini API access, and the complete model and DatasetPack download path. Mainland China is not a target market for 1.0 because the product has no alternative AI provider or download infrastructure for that region. Official model and DatasetPack artifacts are described by signed manifests and may be served by multiple mirrors, with Hugging Face as the primary source and a project-controlled GitHub Release or static host as a fallback.

The Android release progresses through Google Play internal testing, closed testing, and staged production rollout. Production begins at 10 percent, advances to 50 percent, and reaches 100 percent only after the preceding stage meets the release gates. The source repository may remain private; public support is provided through a separate public repository so users can read known issues and submit reports without exposing the product source code.

Google Play App Signing manages the app signing key. The upload key and its recovery material are kept in access-controlled offline backups and are never committed to Git. No APK containing production signing credentials is produced from an untrusted or undocumented environment.

## Consequences

The supported-country list is release evidence rather than a permanent global claim. Before each production release, the team must test storefront installation, Gemini authentication and request behavior, primary and fallback artifact downloads, signature and hash verification, resumable downloads, and the public support link from at least the representative environments used for the supported regions.

Each rollout stage requires explicit review of crash and ANR health, setup completion, model and DatasetPack download failures, signature failures, Gemini integration failures, and blocking user reports. Because the app intentionally collects no telemetry, automatic health evidence is limited to Google Play vitals; setup and feature failures must also be evaluated through closed-test results and user-initiated reports. A failed gate pauses promotion and may trigger a rollback or replacement release.

Mirror selection must not weaken trust. Every mirror serves bytes validated against the same signed manifest and SHA-256 values, and a mirror failure must be visible and recoverable. The public support repository location, supported-country list, privacy policy, release notes, signing custody, and rollout approvers must be finalized before the first closed test.
