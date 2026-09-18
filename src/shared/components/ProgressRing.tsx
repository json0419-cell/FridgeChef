import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { typography, useAppTheme } from '../theme/theme';

interface ProgressRingProps {
  /** Completion from 0 to 100. `null` renders a spinner for work that has not reported progress yet. */
  percent: number | null;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ProgressRing({
  percent,
  size = 22,
  strokeWidth = 3,
  showLabel = false,
  accessibilityLabel,
  style,
  testID,
}: ProgressRingProps) {
  const { colors } = useAppTheme();

  if (percent === null) {
    return (
      <View accessible={Boolean(accessibilityLabel)} accessibilityLabel={accessibilityLabel} style={[{ width: size, height: size }, styles.center, style]} testID={testID}>
        <ActivityIndicator color={colors.primary} size="small" />
      </View>
    );
  }

  const clamped = Math.min(100, Math.max(0, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <View
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
      style={[{ width: size, height: size }, styles.center, style]}
      testID={testID}
    >
      <Svg height={size} width={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke={colors.border}
          strokeWidth={strokeWidth}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          // Start the arc at twelve o'clock instead of three o'clock.
          originX={size / 2}
          originY={size / 2}
          r={radius}
          rotation={-90}
          stroke={colors.primary}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
        />
      </Svg>
      {showLabel ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={[StyleSheet.absoluteFill, styles.center]}>
            <Text style={[styles.label, { color: colors.textPrimary, fontSize: Math.max(10, Math.round(size / 3.6)) }]}>
              {Math.round(clamped)}%
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: typography.strong,
    fontWeight: '800',
  },
});
