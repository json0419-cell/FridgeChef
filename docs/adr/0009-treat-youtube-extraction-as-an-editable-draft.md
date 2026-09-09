---
status: accepted
---

# Treat YouTube extraction as an editable draft

Gemini output derived from a user-submitted public YouTube cooking-video URL is always a Recipe Draft. It never saves automatically and never enters Local Retrieval until the user reviews the content, completes every required recipe field, and explicitly saves it as a Personal Recipe. The saved recipe retains the normalized source URL, stable video ID when available, and import time so it can be deduplicated and traced without claiming that the generated text is an authoritative transcript.

## Consequences

The review form requires a title, main ingredients with usable amounts, seasonings with usable amounts, serving guidance, complete steps, estimated time, and difficulty before saving. The user may edit generated content, but a YouTube-derived recipe retains its source type and source reference. Dietary Restrictions are still applied as hard filters when saved Personal Recipes later participate in Recommendations.

Only public `youtube.com` and `youtu.be` URLs supported by Gemini are accepted. Private, restricted, deleted, inaccessible, or unreliable videos produce an actionable error and a path to manual recipe entry. The app does not download videos, use third-party circumvention services, bypass access controls, or fill missing recipe facts with silent guesses.

YouTube extraction is optional and failure is isolated to that operation. An extraction error does not disable the fridge, existing recipe sources, or Recommendations. Likewise, an Unverified DatasetPack installation or activation failure disables only that source and exposes redacted Diagnostic Information.
