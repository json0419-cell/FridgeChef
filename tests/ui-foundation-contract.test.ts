import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAppTheme } from '../src/shared/theme/app-theme.ts';
import {
  getActionAccessibilityState,
  getSelectableAccessibilityState,
} from '../src/shared/components/control-state.ts';

test('system appearance resolves the matching app-shell theme and status bar', () => {
  const darkTheme = resolveAppTheme('dark');
  const lightTheme = resolveAppTheme('light');

  assert.equal(darkTheme.colorScheme, 'dark');
  assert.equal(darkTheme.isDark, true);
  assert.equal(darkTheme.statusBarStyle, 'light');
  assert.equal(lightTheme.colorScheme, 'light');
  assert.equal(lightTheme.isDark, false);
  assert.equal(lightTheme.statusBarStyle, 'dark');
  assert.equal(resolveAppTheme(null).colorScheme, 'light');
});

test('screen readers hear loading actions as busy and unavailable', () => {
  assert.deepEqual(getActionAccessibilityState({ loading: true }), {
    disabled: true,
    busy: true,
  });
  assert.deepEqual(getActionAccessibilityState({ disabled: true }), {
    disabled: true,
    busy: false,
  });
  assert.deepEqual(getActionAccessibilityState({}), {
    disabled: false,
    busy: false,
  });
});

test('screen readers hear selectable controls without losing disabled state', () => {
  assert.deepEqual(getSelectableAccessibilityState({ selected: true }), {
    disabled: false,
    selected: true,
  });
  assert.deepEqual(getSelectableAccessibilityState({ disabled: true, selected: false }), {
    disabled: true,
    selected: false,
  });
});

function relativeLuminance(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [value >> 16, (value >> 8) & 255, value & 255].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string) {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test('text stays readable at WCAG AA contrast in light and dark appearances', () => {
  const readablePairs = [
    ['textPrimary', 'canvas'],
    ['textSecondary', 'canvas'],
    ['textTertiary', 'canvas'],
    ['textSecondary', 'surface'],
    ['textTertiary', 'surface'],
    ['textSecondary', 'surfaceMuted'],
    ['textTertiary', 'surfaceDisabled'],
    ['primary', 'surface'],
    ['primary', 'primaryMuted'],
    ['onPrimary', 'primary'],
    ['textInverse', 'danger'],
    ['textInverse', 'success'],
    ['warning', 'accentMuted'],
    ['info', 'infoMuted'],
    ['danger', 'surface'],
    ['danger', 'dangerMuted'],
  ] as const;

  for (const appearance of ['light', 'dark'] as const) {
    const { colors } = resolveAppTheme(appearance);
    for (const [foreground, background] of readablePairs) {
      const ratio = contrastRatio(colors[foreground], colors[background]);
      assert.ok(ratio >= 4.5, `${appearance} ${foreground} on ${background} is ${ratio.toFixed(2)}:1`);
    }
  }
});
