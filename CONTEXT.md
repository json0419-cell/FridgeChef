# FridgeChef Domain Context

This context defines the language used by FridgeChef to help a user decide what to eat based on the ingredients they have. It distinguishes retrieval, user-facing recommendations, ingredient identity, and recipe sources.

## Product

**FridgeChef**:
The official product name in English storefronts and English UI, and the stable identifier used by packages, bundles, and code.
_Avoid_: ChiShenMe, English version of 是啊！吃什么

**是啊！吃什么**:
The official localized product name in Chinese storefronts and Chinese UI.
_Avoid_: 吃什么, Chinese FridgeChef

**Diagnostic Information**:
A device and component status summary that the user explicitly copies or submits. It excludes API keys, photos, ingredients, dietary restrictions, personal recipes, and AI request or response bodies.
_Avoid_: Crash report, full log

## Recommendations

**Local Retrieval**:
The on-device process that uses the installed BGE-M3 model to retrieve Candidate Recipes from enabled recipe sources using Confirmed Ingredients, serving count, available time, difficulty, Taste Preferences, Dietary Restrictions, and recent cooking history.
_Avoid_: Local Recommendation, final recommendation

**Recommendation**:
A directly usable result that Gemini produces from Candidate Recipes returned by Local Retrieval. Generating a new batch requires a valid Gemini API key and an installed BGE-M3 model.
_Avoid_: Local Retrieval, Candidate Recipe

**Adjust Recommendation**:
Run Local Retrieval again and ask Gemini for a new Recommendation batch after the user changes time, taste, or other criteria.
_Avoid_: AI optimization, local filtering

**Recommendation Ready**:
The state in which AI data consent is granted, the Gemini API key passed a live test, BGE-M3 passed integrity validation and a test embedding, and at least one recipe source is available.
_Avoid_: Setup complete, model downloaded

**Candidate Recipe**:
A recipe returned by Local Retrieval that Gemini has not yet converted into a Recommendation.
_Avoid_: Recommendation, AI recommendation

**Ready to Cook**:
A Recommendation for which every main ingredient is available.
_Avoid_: Complete match

**Almost Ready to Cook**:
A Recommendation that is missing one or two main ingredients and becomes actionable after those ingredients are obtained.
_Avoid_: Partial match, approximate recommendation

**Dietary Restriction**:
A user-declared ingredient or food category that Recommendations must exclude and that automatic fallback must never relax.
_Avoid_: Taste Preference, recommendation tag

**Taste Preference**:
A cuisine, flavor, or meal preference that affects ranking but may be relaxed when no result is available.
_Avoid_: Dietary Restriction, allergen

## Ingredients

**Confirmed Ingredient**:
An ingredient that the user explicitly saved after manual entry or after correcting a Photo Recognition Result.
_Avoid_: Recognized Ingredient, scan result

**Photo Recognition Result**:
An editable ingredient draft returned by Gemini from a photo the user explicitly submitted.
_Avoid_: Confirmed Ingredient, fridge ingredient

**Canonical Ingredient**:
An ingredient identified by a language-independent canonical ingredient ID and associated with Chinese, English, and common alias names.
_Avoid_: Ingredient name string, translated ingredient

**Custom Ingredient**:
An ingredient that cannot yet map to a Canonical Ingredient and therefore retains the user's original text.
_Avoid_: Unknown Canonical Ingredient

## Personal Recipes

**Recipe Draft**:
An editable recipe proposal created by the user or extracted by Gemini that has not yet been reviewed and explicitly saved. A Recipe Draft never participates in Local Retrieval.
_Avoid_: Personal Recipe, imported recipe

**Personal Recipe**:
A recipe that the user explicitly saved after reviewing its required fields, whether it began as manual entry or a Recipe Draft. It participates in Local Retrieval only through an Enabled Personal Recipe Library.
_Avoid_: Recipe Draft, Official DatasetPack recipe

**Enabled Personal Recipe Library**:
A Personal Recipe Library explicitly selected by the user to participate in Local Retrieval. Multiple personal libraries may be enabled at once; disabled libraries do not participate.
_Avoid_: Personal Recipe Library, enabled DatasetPack

## Recipe Libraries

**Base Recipe Library**:
The 300–500 quality-reviewed and rights-cleared recipes bundled with the app so that a recipe source is available without a separate download.
_Avoid_: Sample recipes, default DatasetPack

**Official DatasetPack**:
An extension recipe library whose manifest signature verifies against the project's bundled public key and that the user explicitly downloads and enables.
_Avoid_: Base Recipe Library, bundled recipes

**Enabled Official DatasetPack**:
An Official DatasetPack explicitly selected by the user to participate in Local Retrieval. Multiple packs may be enabled at once; downloaded but disabled packs do not participate.
_Avoid_: Started dataset, downloaded dataset

**Unverified DatasetPack**:
A data-only recipe pack installed from an arbitrary URL whose publisher identity is not trusted by the app, even when its declared files pass transport, path, size, and hash validation.
_Avoid_: Official DatasetPack, unsafe executable

**Personal Recipe Library**:
A user-created and user-managed recipe collection stored only on the user's device.
_Avoid_: Official recipe library, custom DatasetPack
