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
