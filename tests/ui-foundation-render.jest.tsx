import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { Button, FormField, IngredientChip } from '../src/shared/components/Foundation';

describe('rendered UI foundation behavior', () => {
  it('exposes busy state and a 48 dp action target', async () => {
    const { getByRole } = await render(<Button loading onPress={() => undefined} title="Save" />);
    const action = getByRole('button', { name: 'Save' });
    const style = StyleSheet.flatten(action.props.style);

    expect(action.props.accessibilityState).toEqual({ busy: true, disabled: true });
    expect(style.minHeight).toBe(48);
    expect(style.minWidth).toBe(48);
  });

  it('exposes selection and a visible non-color indicator', async () => {
    const { getByRole, getByText } = await render(
      <IngredientChip label="Easy" onPress={() => undefined} selected />,
    );

    expect(getByRole('button', { name: 'Easy' }).props.accessibilityState).toEqual({
      disabled: false,
      selected: true,
    });
    expect(getByText('✓')).toBeTruthy();
  });

  it('associates a field label and invalid state with its input', async () => {
    const { getByLabelText } = await render(
      <FormField error="Required" inputProps={{ placeholder: '2' }} label="Servings" />,
    );
    const input = getByLabelText('Servings');

    expect(input.props.accessibilityHint).toBe('Required');
    expect(input.props['aria-invalid']).toBe(true);
  });
});
