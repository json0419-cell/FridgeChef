# Phase 1 Android accessibility checks

Automated coverage lives in `tests/navigation-render.jest.tsx`, `tests/fridge-accessibility.jest.tsx`, `tests/ui-foundation-render.jest.tsx`, and `tests/ui-foundation-contract.test.ts` (theme contrast). The checks below cover behavior that only a real Android device can confirm. Run them on a physical device or emulator with a development build (`npm run android`), without a real Gemini credential unless a step says otherwise.

## Device matrix

Run every section in each combination:

| Language | Appearance | Font size |
| --- | --- | --- |
| English | Light | Default |
| English | Dark | 200% |
| 中文 | Light | 200% |
| 中文 | Dark | Default |

- Font size: Settings → Display → Font size → largest, then Display size → default. On Android 14+ confirm the scale reads 200%.
- Appearance: Settings → Display → Dark theme.
- Language: switch in the app's Settings screen.
- TalkBack: Settings → Accessibility → TalkBack → On. Swipe right/left to move focus, double-tap to activate.

## 1. Top-level navigation

1. Launch the app. Swipe through the bottom tab bar.
   - Expect four tabs announced as `Home`, `Fridge`, `Recipe Recommendations`, `My` (or `首页`, `冰箱`, `菜谱推荐`, `我的`), each with “tab”/“selected” state.
   - At 200%, each label stays on one line (shrinking to fit rather than breaking a word) and does not overlap icons, each other, or the gesture bar.
   - Fridge and Recommendations titles wrap instead of truncating, and the Fridge header Settings button is at least 48 × 48 dp.
   - The active tab is distinguishable without color: bold and underlined label.
2. Activate each tab. Expect the screen title to be announced as a heading.

## 2. Home to Recommendations journey

1. On Home with an empty fridge, focus order is: Settings → product name (heading) → subtitle → `Get recipe recommendations` → Gemini hint → fridge action.
2. While Home loads, the primary action is announced as busy and unavailable.
3. Activate `Get recipe recommendations`.
   - Expect the dialog title to be announced first, focus stays inside the dialog, and the backdrop is never a focus stop.
   - At 200%, the two dialog actions stack vertically, full text is visible, and the dialog scrolls if it is taller than the screen.
4. Choose `Add to fridge`. Expect Fridge to open and swiping forward from the top to reach its header before any ingredient row. The app does not move TalkBack focus programmatically; record where TalkBack places initial focus.
5. Repeat with no Gemini key: expect `A few steps remain`, `Finish setup` opens Settings.

## 3. Fridge

1. Add an ingredient with a long name (e.g. “Organic heirloom cherry tomatoes from the market”).
   - The name wraps instead of truncating at 200%.
   - `Edit <name>` and `Delete <name>` are announced separately; each target is at least 48 dp and the targets do not overlap.
2. `Add manually` and `Scan photo` wrap onto separate rows at 200% without clipping.
3. Pull to refresh. The loading card is announced as busy.
4. Delete an ingredient; the native confirmation dialog is announced and cancellable.

## 4. Recommendations

Seed a cached batch (generate once with a test key, then remove the key) so cached, populated, error and disabled states are reachable without a live credential.

1. Readiness checklist
   - Completed items are read as “<item>. Ready” and are not buttons.
   - Incomplete items are buttons read as “<item>. Set up”; status is shown with text and icon, not color alone.
2. Request tags
   - Section headers announce “collapsed/expanded” and, when tags are selected, “<section>, N selected”.
   - Selected tags show a ✓ and announce “selected”.
3. Cached state: the cached notice is visible and read, and every Gemini action is labeled with Gemini.
4. Loading state: after `Generate new recommendations with Gemini`, the progress card is announced as busy and the fixed bottom action is announced busy and unavailable.
5. Error state (airplane mode or invalid key): the failure message is announced without moving focus.
6. Populated recipe card at 200%:
   - Title is a heading; `Difficulty: …` and `Time: …` pills wrap.
   - `Available` and `Need to buy` panels stack when they no longer fit side by side.
   - `Cook this today: <recipe>` and `Ask Gemini to replace this recommendation: <recipe>` are distinct targets.
   - The last card can scroll fully above the fixed bottom action.
7. English UI shows no Chinese text or full-width punctuation; Chinese UI shows no untranslated keys.

## 5. My

1. Title is a heading; each menu row is announced with its title and description hint.
2. At 200%, descriptions wrap and chevrons stay inside the row.

## Recording results

Record each run in the pull request as: device model, Android version, language, appearance, font scale, and pass/fail per numbered step with a screenshot for any failure.
