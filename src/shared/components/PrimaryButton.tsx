import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Button } from './Foundation';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  style?: StyleProp<ViewStyle>;
  icon?: ReactNode;
  accessibilityLabel?: string;
}

export function PrimaryButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  style,
  icon,
  accessibilityLabel,
}: PrimaryButtonProps) {
  return (
    <Button
      accessibilityLabel={accessibilityLabel ?? title}
      disabled={disabled}
      leadingIcon={icon}
      loading={loading}
      onPress={onPress}
      style={style}
      title={title}
      variant={variant === 'danger' ? 'destructive' : variant}
    />
  );
}
