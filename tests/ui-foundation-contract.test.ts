import assert from 'node:assert/strict';
import test from 'node:test';
import {
  darkAppColors,
  lightAppColors,
  resolveAppTheme,
  type AppColorTokens,
} from '../src/shared/theme/app-theme.ts';
import {
  getActionAccessibilityState,
  getSelectableAccessibilityState,
} from '../src/shared/components/control-state.ts';

test('system appearance resolves the matching app-shell theme and status bar', () => {
  assert.deepEqual(resolveAppTheme('dark'), {
    colorScheme: 'dark',
    colors: darkAppColors,
    isDark: true,
    statusBarStyle: 'light',
  });
  assert.deepEqual(resolveAppTheme('light'), {
    colorScheme: 'light',
    colors: lightAppColors,
    isDark: false,
    statusBarStyle: 'dark',
  });
  assert.equal(resolveAppTheme(null).colorScheme, 'light');
});

test('primary app-shell content and actions remain readable in both appearances', () => {
  for (const palette of [lightAppColors, darkAppColors]) {
    assertReadable(palette, 'textPrimary', 'canvas');
    assertReadable(palette, 'textSecondary', 'canvas');
    assertReadable(palette, 'textPrimary', 'surface');
    assertReadable(palette, 'onPrimary', 'primary');
    assertReadable(palette, 'textInverse', 'danger');
  }
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

function assertReadable(
  palette: AppColorTokens,
  foreground: keyof AppColorTokens,
  background: keyof AppColorTokens,
) {
  const ratio = contrastRatio(palette[foreground], palette[background]);
  assert.ok(
    ratio >= 4.5,
    `${String(foreground)} on ${String(background)} must meet 4.5:1 contrast; received ${ratio.toFixed(2)}:1`,
  );
}

function contrastRatio(foreground: string, background: string) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: string) {
  const channels = color
    .replace('#', '')
    .match(/.{2}/g)
    ?.map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));

  assert.ok(channels && channels.length === 3, `Expected a six-digit hex color, received ${color}`);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
