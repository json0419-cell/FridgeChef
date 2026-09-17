---
status: accepted
---

# Back up user data only, and reconcile installed sources on read

Android backup and device transfer carry the main database and non-sensitive settings and nothing else. Secure credentials, BGE-M3 model files, DatasetPacks, staged downloads, and caches are never backed up: credentials because a copy outside platform secure storage defeats ADR 0007, and the artifacts because they are large, re-downloadable, and signature-verified at install. Ordinary storage is restored as a unit, so the installed-source registries come back naming files that did not, and every read of an installed-source registry therefore reconciles its records against the files on disk rather than trusting the record alone.

## Consequences

The packaged backup rules are an allowlist over the `database` and `sharedpref` domains, with platform secure storage excluded. Naming no other domain is what keeps models, packs, staging directories, and caches out, so adding a domain to those rules is a deliberate decision that the packaged-config test forces someone to make on purpose.

A restored record whose directory or manifest is absent is reported as not installed. It is not corruption, so the stored bytes are never rewritten and the read never reports the registry unreadable: the recovery path of ADR 0008 stays reserved for damaged bytes. The record survives untouched, which lets a reinstall carry the user's enabled state over, so installs read the stored records while everything that intends to use a source reads the reconciled ones. Confirmed Ingredients, cooking history, Personal Recipes, and preferences are unaffected in either case.

Reads therefore report what is absent as well as what is present, because filtering alone can strand a record. An Official DatasetPack reappears in the catalogue as downloadable, but an Unverified DatasetPack has no catalogue entry to fall back on, so the library lists it as not installed with the reason and the removal that clears the record. Nothing may leave a record the user can neither use nor reach.

A restored install is consequently not Recommendation Ready. Verification that a Gemini API key passed a live test lives beside the key in secure storage and is bound to that key, so it cannot be restored without it, and the setup checklist names each outstanding step so the user can re-enter and live-test their key and reinstall the artifacts they need.
