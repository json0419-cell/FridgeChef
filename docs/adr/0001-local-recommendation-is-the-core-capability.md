---
status: superseded by ADR-0003
---

# Local recommendations are the core capability

The public release was initially planned to provide directly usable local recommendations without a Gemini API key, network access, or a local BGE-M3 model. Photo recognition and AI refinement would have remained explicit optional actions so that third-party availability, privacy concerns, and token usage could not block the core experience.

This decision was replaced by ADR-0003 after the product scope changed to require both Gemini and BGE-M3 for every newly generated recommendation batch.
