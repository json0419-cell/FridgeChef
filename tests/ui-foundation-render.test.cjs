const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const test = require('node:test');
const React = require('react');
const TestRenderer = require('react-test-renderer');
const ts = require('typescript');

global.IS_REACT_ACT_ENVIRONMENT = true;

let colorScheme = 'light';

function hostComponent(name, resolveStyle = false) {
  return function HostComponent({ children, style, ...props }) {
    const resolvedStyle = resolveStyle && typeof style === 'function' ? style({ pressed: false }) : style;
    return React.createElement(name, { ...props, style: resolvedStyle }, children);
  };
}

const reactNativeMock = {
  ActivityIndicator: hostComponent('ActivityIndicator'),
  Pressable: hostComponent('Pressable', true),
  ScrollView: hostComponent('ScrollView'),
  StyleSheet: {
    create: (styles) => styles,
    flatten: (style) => Object.assign({}, ...flattenStyle(style)),
  },
  Text: hostComponent('Text'),
  TextInput: hostComponent('TextInput'),
  View: hostComponent('View'),
  useColorScheme: () => colorScheme,
};

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'react-native') {
    return reactNativeMock;
  }

  if (request === 'react-native-safe-area-context') {
    return { SafeAreaView: hostComponent('SafeAreaView') };
  }

  return originalLoad.call(this, request, parent, isMain);
};

for (const extension of ['.ts', '.tsx']) {
  Module._extensions[extension] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: filename,
    }).outputText;
    module._compile(output, filename);
  };
}

const { Button, FormField, IngredientChip } = require('../src/shared/components/Foundation.tsx');

test('rendered actions expose busy state and a 48 dp target', () => {
  let renderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(React.createElement(Button, { loading: true, onPress() {}, title: 'Save' }));
  });

  const action = renderer.root.findByType('Pressable');
  const style = reactNativeMock.StyleSheet.flatten(action.props.style);

  assert.deepEqual(action.props.accessibilityState, { busy: true, disabled: true });
  assert.equal(action.props.disabled, true);
  assert.equal(style.minHeight, 48);
  assert.equal(style.minWidth, 48);
});

test('rendered selectable controls expose selection without relying on color alone', () => {
  let renderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(React.createElement(IngredientChip, { label: 'Easy', onPress() {}, selected: true }));
  });

  const choice = renderer.root.findByType('Pressable');
  assert.deepEqual(choice.props.accessibilityState, { disabled: false, selected: true });
  assert.equal(renderer.root.findAllByType('Text').some((node) => node.children.includes('✓')), true);
});

test('rendered form fields associate labels and invalid state with their inputs', () => {
  let renderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(
      React.createElement(FormField, {
        error: 'Required',
        inputProps: { placeholder: '2' },
        label: 'Servings',
      }),
    );
  });

  const input = renderer.root.findByType('TextInput');
  assert.equal(input.props.accessibilityLabel, 'Servings');
  assert.equal(input.props.accessibilityHint, 'Required');
  assert.equal(input.props['aria-invalid'], true);
});

test('rendered shared controls respond to system appearance', () => {
  colorScheme = 'light';
  let lightRenderer;
  TestRenderer.act(() => {
    lightRenderer = TestRenderer.create(React.createElement(Button, { onPress() {}, title: 'Continue' }));
  });
  const lightStyle = reactNativeMock.StyleSheet.flatten(lightRenderer.root.findByType('Pressable').props.style);

  colorScheme = 'dark';
  let darkRenderer;
  TestRenderer.act(() => {
    darkRenderer = TestRenderer.create(React.createElement(Button, { onPress() {}, title: 'Continue' }));
  });
  const darkStyle = reactNativeMock.StyleSheet.flatten(darkRenderer.root.findByType('Pressable').props.style);

  assert.notEqual(lightStyle.backgroundColor, darkStyle.backgroundColor);
});

function flattenStyle(style) {
  if (!Array.isArray(style)) {
    return style ? [style] : [];
  }

  return style.flatMap(flattenStyle);
}
