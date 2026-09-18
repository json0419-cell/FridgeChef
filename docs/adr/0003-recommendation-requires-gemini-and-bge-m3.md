---
status: accepted
---

# Recommendations require a Gemini API key and BGE-M3

Recommendation users must provide their own Gemini API key and download the approximately 2.29 GB BGE-M3 model. Every new Recommendation batch first uses BGE-M3 for Local Retrieval across the applicable Base Recipe Library, Official DatasetPacks, and Personal Recipe Libraries, then asks Gemini to organize the candidates using the user's ingredients, time, serving count, and preferences. Gemini also produces English Recommendations from Chinese-only dataset candidates. This decision prioritizes consistent multilingual semantic retrieval and a uniform result shape while accepting BYOK setup, network access, model storage, and token usage as entry costs.

## Consequences

Before entering Recommendation, the app must validate the API key, AI data consent, model installation, and runtime support through a resumable setup flow. Exact input matches reuse local cache entries whose identity includes ingredients, criteria, language, and every enabled recipe library ID and version. If Gemini fails, the app first shows a recent cache entry that still satisfies the current criteria and otherwise may show clearly labeled local candidates. If BGE-M3 fails at runtime, the app falls back to the Base Recipe Library and explains that high-accuracy retrieval is unavailable. English recipe translations are cached by stable recipe ID, dataset version, and language.

Initial setup proceeds through AI disclosure, a live Gemini API key test, storage and network checks, BGE-M3 download and a test embedding, and recipe source activation. Complete Recommendation batches with exact input signatures remain cached for seven days. English recipe translations remain valid until the corresponding dataset version changes. Users can clear Recommendation caches.

Opening a screen or refreshing in the background must never call Gemini. Only explicit user actions such as Generate Recommendations, Load More, or Apply New Criteria may create requests. The client automatically retries once only when it knows the request did not reach the service. Timeouts, quota errors, authentication errors, and response format failures require an explicit user retry. The first public release uses the tested `gemini-3.1-flash-lite` model. Changing the model ID requires an app release and renewed acceptance testing.
