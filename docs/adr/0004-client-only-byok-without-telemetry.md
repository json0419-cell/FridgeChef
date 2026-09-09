---
status: accepted
---

# Keep the app client-only with BYOK and no telemetry

FridgeChef operates without a developer backend. Users provide their own Gemini API key, and the app sends AI requests directly to Google only after explicit consent. The app does not collect analytics, crash reports, or other automatic telemetry. This boundary avoids server operations and developer-paid AI usage while accepting a higher setup burden and relying on user-initiated reports through GitHub Issues or the app store.

The app provides user-initiated Diagnostic Information and a GitHub Issue entry point. Diagnostic Information excludes API keys, photos, ingredients, dietary restrictions, personal recipes, and AI request or response bodies. Withdrawing AI data consent immediately blocks future Gemini requests. Existing local Recommendations and translation caches remain available until the user explicitly selects Clear AI-Generated Content.
