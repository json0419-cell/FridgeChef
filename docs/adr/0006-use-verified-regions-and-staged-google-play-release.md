---
status: accepted
---

# Use verified regions and a staged Google Play release

FridgeChef 1.0 is distributed only in regions where the release team has verified Google Play availability, Gemini API access, and the complete model and DatasetPack download path. Mainland China is not a target market for 1.0 because the product has no alternative AI provider or download infrastructure for that region. Official model and DatasetPack artifacts are described by signed manifests and may be served by multiple mirrors, with Hugging Face as the primary source and a project-controlled GitHub Release or static host as a fallback.

The Android release progresses through Google Play internal testing, closed testing, and staged production rollout. Production begins at 10 percent, advances to 50 percent, and reaches 100 percent only after the preceding stage meets the release gates. Each production stage is observed for at least seven days. The source repository may remain private; public support is provided through a separate public repository so users can read known issues and submit reports without exposing the product source code. That repository contains the privacy policy, FAQ, known issues, Issue templates, and release notes, and its privacy policy is published through GitHub Pages for stable links from Google Play and the app.

Version 1.0 is free, has no advertising, and has no in-app purchases. Users still pay any costs charged by their own Gemini API account and their network provider. Only the latest Google Play production version receives fixes. Older versions may continue to run, but the project does not maintain multiple release branches; database migrations must support upgrading from every previously published schema to the current schema.

Google Play App Signing manages the app signing key. The upload key and its recovery material are kept in access-controlled offline backups and are never committed to Git. No APK containing production signing credentials is produced from an untrusted or undocumented environment.

## Consequences

The supported-country list is release evidence rather than a permanent global claim. Before each production release, the team must test storefront installation, Gemini authentication and request behavior, primary and fallback artifact downloads, signature and hash verification, resumable downloads, and the public support link from at least the representative environments used for the supported regions.

Closed testing may advance only after all core acceptance tests pass, no P0 or P1 defect remains open, and the complete user journey has been exercised on target physical devices. Each rollout stage requires explicit review of crash and ANR health, setup completion, model and DatasetPack download failures, signature failures, Gemini integration failures, and blocking user reports. Because the app intentionally collects no telemetry, automatic health evidence is limited to Google Play vitals; setup and feature failures must also be evaluated through closed-test results and user-initiated reports. A failed gate pauses promotion and may trigger a rollback or replacement release.

A release-blocking defect includes a crash or ANR in a core journey, user-data corruption, API-key exposure risk, a Dietary Restriction violation, widespread inability to install or load required models or DatasetPacks, or an unusable Recommendation journey. Cosmetic defects do not block rollout unless they prevent comprehension, accessibility, or operation. Release success requires representative closed-test users to complete setup, confirm fridge ingredients, and choose a dinner without developer assistance; production must also remain within the approved Google Play vitals thresholds and have no unresolved release-blocking report.

Mirror selection must not weaken trust. Every mirror serves bytes validated against the same signed manifest and SHA-256 values, and a mirror failure must be visible and recoverable. The public support repository location, supported-country list, privacy policy, release notes, signing custody, and rollout approvers must be finalized before the first closed test.
