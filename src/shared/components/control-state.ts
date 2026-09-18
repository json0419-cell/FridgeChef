export interface ActionControlState {
  disabled?: boolean;
  loading?: boolean;
}

export interface SelectableControlState {
  disabled?: boolean;
  selected?: boolean;
}

export function getActionAccessibilityState({ disabled = false, loading = false }: ActionControlState) {
  return {
    disabled: disabled || loading,
    busy: loading,
  };
}

export function getSelectableAccessibilityState({
  disabled = false,
  selected = false,
}: SelectableControlState) {
  return {
    disabled,
    selected,
  };
}
