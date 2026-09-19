# Phase 2 Android release validation

Automated coverage for these behaviors lives in `tests/credential-capture-protection.jest.tsx`,
`tests/database-migrations.test.ts`, `tests/installed-source-recovery.jest.tsx`,
`tests/restored-install-coherence.test.ts`, `tests/restored-install-coherence.jest.tsx`, and
`tests/release-security-policy.test.ts`. The checks below cover what only a real Android device and a
real release build can prove: the native `FLAG_SECURE` window flag, the Android backup transport, and
the recovery screens as they actually render and copy on device.

Run every section on a **release build** on physical hardware. Record the results in
[Results](#results) and file each failure as its own issue linked to #27 — this document's checks
change no product behavior.

## Builds

Five builds are needed. Build A is the shipping configuration; builds B–D are the same release
configuration with one release-validation fixture selected, because an app-private database and
app-private registries cannot be edited from `adb` on a non-debuggable build. Build E is the shipping
configuration built from an older commit and carries no fixture: section 3 needs a database written
before the schema-3 migration existed, and no fixture can manufacture one.

| Build | Fixture variable | Sections |
| --- | --- | --- |
| A | _unset_ | [1](#1-credential-capture-protection), [3](#3-migration-upgrade), [4](#4-backuprestore-round-trip) |
| B | `failDatabaseUpgrade` | [2](#2-migration-recovery) |
| C | `corruptDatasetRegistry` | [5](#5-installed-source-recovery) |
| D | `corruptModelRegistry` | [5](#5-installed-source-recovery) |
| E | _unset_, built from `70f3503` | [3](#3-migration-upgrade) |

```powershell
# Build A — shipping configuration. Confirm the variable is not set first.
Remove-Item Env:EXPO_PUBLIC_VALIDATION_FIXTURES -ErrorAction SilentlyContinue
npx expo run:android --variant release

# Builds B-D — one fixture per build.
$env:EXPO_PUBLIC_VALIDATION_FIXTURES = 'failDatabaseUpgrade'   # or corruptDatasetRegistry / corruptModelRegistry
npx expo run:android --variant release
```

`EXPO_PUBLIC_*` variables are inlined into the JavaScript bundle at build time, so the fixture is a
build-time constant: build A contains no selected fixture and every fixture function is a no-op.

`tests/validation-fixtures.test.ts` fails if the variable is ever set by a committed file — app
config, EAS profiles, `package.json`, the Gradle properties, a CI workflow, or any `.env` file Expo
loads — or if a second module reads it. That guard cannot see an **exported shell variable on a
build machine** or an EAS dashboard environment variable, and an EAS build never runs `npm test`.
So: export the variable only in the shell session that makes a fixture build, confirm build A with
[section 0](#0-confirm-build-a-is-fixture-free), and never submit a fixture build to a store.

Install a fixture build over build A, or `adb install -r` it, so it inherits the data seeded below.
Between sections, reset with `adb shell pm clear com.chishenme.fridgechef` unless a step says
otherwise.

## 0. Confirm build A is fixture-free

Do this first, on a clean install of build A, because every other section trusts it.

1. Launch. The app reaches the tab bar — no migration recovery screen.
2. Open Dataset Library and Recipe Recommendations. Neither shows an installed-source recovery card.
3. After the seed data below is in place, force-stop and relaunch. Still no recovery screen and no
   recovery card.

If any recovery surface appears on build A, the build carries a fixture: clear the variable from the
shell, rebuild, and start again.

### Seed data

Before sections 2 and 4, set up from a clean install on build A so there is state worth losing:

1. Add at least three Confirmed Ingredients, one with a non-ASCII name.
2. Save one Personal Recipe and mark one recipe cooked, so `user_recipes` and `cooked_history` hold
   rows.
3. Enter a real Gemini API key and let it pass the live test.
4. Install the BGE-M3 model and at least one Official DatasetPack, and enable the pack.
5. Change a non-sensitive setting (app language) away from its default.
6. Generate one Recommendation batch so a cache exists.

Record the ingredient count, the Personal Recipe title, and the chosen language — sections 2 and 4
compare against them.

Section 3 does not use this seed data. It starts from its own clean install on build E, because the
upgrade it checks can only be observed on a database written before schema 3.

## 1. Credential capture protection

Build A. Attempt a screenshot with the hardware keys **and** with the quick-settings screen recorder;
both must be refused with the system "Can't take screenshot" / "screen capture blocked" message.

1. **Protected — entry.** Settings → the Gemini API key field, focused. Screenshot is refused.
2. **Protected — revealed.** Tap the reveal action so the key is visible. Screenshot is still
   refused. This is the case the AC calls out explicitly.
3. **Protected — recent-task preview.** While on the key screen (revealed), press Recents. The app's
   card shows a blank/placeholder preview, not the key. Return to the app, press Recents again, and
   confirm the preview is still blank — the flag is re-asserted after Android recreates the activity.
4. **Released on blur.** Navigate back out of the key screen. A screenshot now succeeds.
5. **Not protected elsewhere.** A screenshot succeeds on each of: the rest of Settings, Fridge,
   Recipe Recommendations (populated), Dataset Library, the My tab, and the Diagnostic Information on
   any recovery card. Capture protection must not leak beyond the key surface.

A screenshot that succeeds in 1–3, or is refused in 4–5, is a failure.

## 2. Migration recovery

Build B, installed over the seeded build A data. Launch the app.

1. The app opens on the recovery screen, not the tab bar. It reads "long-press to copy the diagnostic
   information below and open a GitHub Issue" and offers Retry.
2. The Diagnostic Information block shows exactly four lines: code, time, from-version,
   target-version. The code is `DATABASE_SCHEMA_TOO_NEW`. It contains **no** key, ingredient, recipe,
   file path, or stack trace.
3. Long-press the Diagnostic Information text. Confirm the selection handles appear and the Android
   text-selection toolbar offers **Copy**. Paste into a notes app and check the four lines arrived
   intact. If long-press does not produce a Copy action, that is a defect — see
   [Known question](#known-question-copying-diagnostic-information).
4. Tap **Retry**. The app reaches the tab bar.
5. Confirm prior data survived: the seeded ingredient count, the Personal Recipe, the cooked-history
   entry, and the chosen language are all unchanged.
6. Force-stop and relaunch. The app starts normally, without the recovery screen.

The fixture refuses only the first upgrade attempt of each app process and then restores the real
schema version, so step 4 is expected to succeed; a Retry that fails is a failure of this check.
Force-stopping at step 1 instead of retrying is safe: the fixture encodes the real version in the one
it writes, so the next launch restores the version the database actually has.

What this proves and what it does not: the refusal happens *before* any migration runs, so it
exercises the recovery screen, the redacted diagnostics, and the "your local data was not deleted"
guarantee — but not mid-migration transaction rollback, which `tests/database-migrations.test.ts`
covers. A fixture that failed partway through a migration would leave a release build unable to start
if the tester stopped there, so it is deliberately not offered here.

## 3. Migration upgrade

This is the only check that exercises the schema 2 → 3 upgrade on real data, and the only one that
closes a one-way door: the migration rewrites rows the app itself wrote, so once a device has run it,
a pre-migration build can no longer read those rows correctly. Run it before any build goes out.

Build E is the shipping configuration built from `70f3503`, the last commit before the migration
landed, so its database stops at schema 2. It carries no fixture.

```powershell
git switch --detach 70f3503
Remove-Item Env:EXPO_PUBLIC_VALIDATION_FIXTURES -ErrorAction SilentlyContinue
npx expo run:android --variant release
git switch main
```

### Seed on build E

From a clean install, with the app language left at **中文**:

1. Leave the first-run Personal Recipe Library at its default name, `我的菜谱库`. Do not rename it.
2. Save one Personal Recipe with no title, so it stores the default `未命名菜谱`.
3. Mark that recipe cooked, so `cooked_history` holds a row with the same default title.
4. Create one library named `冰箱剩菜` and one recipe titled `番茄炒蛋` — text the user typed, which the
   migration must not touch.
5. Add one Custom Ingredient and accept the default unit `份` on the confirm screen.

Under schema 2 these defaults are stored as the literal Chinese wording. That is the state the
migration has to find.

### Upgrade

Install build A over it — `adb install -r <path-to-release.apk>`. Do not uninstall and do not
`pm clear`: carrying the schema-2 database forward is the entire point.

1. The app reaches the tab bar. No migration recovery screen.
2. Still in 中文, the default library reads `我的菜谱库` and the default recipe reads `未命名菜谱`, in
   Personal Recipes, in cooked history, and in the Recommendations source line. **Nothing visibly
   changed — that is the pass condition**, not evidence that the migration did not run.
3. `冰箱剩菜` and `番茄炒蛋` are unchanged.
4. Switch the app language to **English**. The two defaults now read `My Recipe Library` and
   `Untitled recipe`; the two typed names stay in Chinese. This is the step that proves the rows were
   rewritten rather than left frozen — if the defaults are still Chinese here, the migration did not
   run or did not match.
5. The Custom Ingredient's unit still reads `份` in English. Units are user input — the user saw and
   confirmed `份` on the confirm screen — so the migration deliberately leaves them alone. A unit that
   follows the language is a failure, not an improvement.
6. Switch back to 中文 and confirm step 2 still holds.
7. Force-stop and relaunch. Steps 2–5 are unchanged.

### Downgrade — record, do not file

The marker the migration writes is the empty string (`src/db/seeded-defaults.ts`), which schema 2 code
has no reading for. Install build E back over the upgraded database once, with
`adb install -r -d <path-to-build-E.apk>`, and record what the user would see — expected to be blank
names where the defaults were. This is the known cost of the one-way door, so **do not file it as a
defect**; record it so support recognizes it. Recover with
`adb shell pm clear com.chishenme.fridgechef`.

## 4. Backup/restore round trip

Build A, with the seeded data. Android's backup transport must be available and the device signed in.

```bash
adb shell bmgr enabled
adb shell bmgr list transports          # pick the Google transport with the * marker
adb shell bmgr transport com.google.android.gms/.backup.BackupTransportService
adb shell bmgr backupnow com.chishenme.fridgechef
adb uninstall com.chishenme.fridgechef
adb install -r <path-to-release.apk>
adb shell bmgr restore <token> com.chishenme.fridgechef   # token from: adb shell dumpsys backup | findstr /i token
adb shell am start -n com.chishenme.fridgechef/.MainActivity
```

Do not launch the app between install and restore — a first launch can settle state that the restore
then has to overwrite.

**Returns (must be present after restore):**

- Every Confirmed Ingredient, including the non-ASCII name, at the recorded count.
- The Personal Recipe and the cooked-history entry.
- The chosen app language and other non-sensitive settings.
- A Personal Recipe Library left at its default name still reads as a default afterwards, and still
  follows the app language when it is switched — the marker has to survive the backup round trip, not
  come back as a blank name.

**Does not return (must be absent after restore):**

- The Gemini API key. Check this two independent ways, because a restored-but-unread key would pass
  a single check: Settings shows no key configured **and** the reveal action shows nothing, and
  Recipe Recommendations reports the key as an outstanding readiness item. This is the `SecureStore`
  shared-preferences exclusion. (Inspecting the `SecureStore` preferences file directly needs a
  debuggable build; where one is available, `adb shell run-as com.chishenme.fridgechef ls
  shared_prefs/` is the stronger check.)
- The BGE-M3 model files and the Official DatasetPack files.
- Temporary download artifacts and caches, including the cached Recommendation batch.

**Coherent state after restore:**

- Dataset Library shows the restored pack as **not installed**, and it is reachable — an Unverified
  pack restored without its files must still be listed, not silently dropped.
- The model shows as not installed.
- The app is **not Recommendation Ready**: the readiness checklist shows the key, the model, and a
  recipe source as outstanding, and generating a new batch is unavailable.
- Reinstalling the pack carries the restored record's enabled state over rather than resetting it.
- No screen shows a recovery card: a restored-but-absent install is a normal state, not corruption.

Repeat with a device-to-device transfer where two devices are available; the `device-transfer`
extraction rules are configured separately from `cloud-backup`, so both need a pass. If no second
device is available, record device transfer as **not run** rather than as a pass.

## 5. Installed-source recovery

Build C, then build D, each installed over seeded build A data. The fixture stores a corrupt registry
envelope, so the corruption persists across relaunches exactly as real corruption would; leave the
state with `adb shell pm clear com.chishenme.fridgechef`.

Build C — corrupt **dataset** registry:

1. Dataset Library shows the recovery card: an alert-role heading, the guidance that installed and
   enabled records were not deleted or overwritten and that install/enable/disable/remove are paused,
   a Retry button, and Diagnostic Information.
2. Recipe Recommendations shows the recovery card too.
3. The Diagnostic Information shows category `datasetRegistry`, code `REGISTRY_CORRUPT_JSON`, the
   time, the stored version, and the target version — and nothing else. No key, ingredients, recipes,
   file paths, or stack traces.
4. Long-press the Diagnostic Information and copy it, as in section 2 step 3. Paste and verify.
5. Tap Retry. The card remains (the stored registry is still corrupt) and the app does not crash.
6. Confirm other features still work: Fridge, Personal Recipes, and settings are usable. Only
   install/enable/disable/remove are paused.

Build D — corrupt **model** registry: repeat steps 1–6 against Recipe Recommendations, with category
`modelRegistry`. Two differences to check explicitly:

- Dataset Library must **stay clean** — no recovery card, and installing, enabling, disabling, and
  removing packs all still work. Only the model registry is unreadable, so only the screens that
  depend on it degrade.
- Personal Recipe indexing still behaves as it does with a readable registry.

### Known question: copying Diagnostic Information

Both recovery surfaces tell the user to long-press to copy, but render the text with
`<Text selectable>` (`src/application/App.tsx`, `src/shared/components/InstalledSourceRecoveryCard.tsx`)
rather than an explicit copy action. Section 2 step 3 and section 5 step 4 exist to settle whether
long-press selection actually exposes **Copy** on a release build. If it does not — on any device in
the matrix — file a defect for an explicit copy action instead of adjusting the check.

## Results

Record one table per device. A build identifier is the `versionCode` plus the commit SHA the build
was made from.

| Field | Value |
| --- | --- |
| Device model | |
| Android version / API level | |
| App version / versionCode | |
| Commit SHA | |
| Date | |

| Section | Result | Notes / issue link |
| --- | --- | --- |
| 1. Credential capture protection | pass / fail / not run | |
| 2. Migration recovery | pass / fail / not run | |
| 3. Migration upgrade (schema 2 → 3) | pass / fail / not run | |
| 3. Downgrade behavior recorded | yes / no | |
| 4. Backup/restore (cloud backup) | pass / fail / not run | |
| 4. Backup/restore (device transfer) | pass / fail / not run | |
| 5. Dataset registry recovery | pass / fail / not run | |
| 5. Model registry recovery | pass / fail / not run | |
| Diagnostic copy on device | pass / fail / not run | |
