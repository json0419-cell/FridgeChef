import { useMemo, type PropsWithChildren } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { type AppColorTokens, useAppTheme } from '../theme/theme';

export function Screen({ children }: PropsWithChildren) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={[colors.canvas, colors.canvasSubtle, colors.canvas]} style={styles.backgroundFill} />
      <View pointerEvents="none" style={styles.topWash} />
      <View pointerEvents="none" style={styles.leftBand} />
      <View pointerEvents="none" style={[styles.orb, styles.orbTop]} />
      <View pointerEvents="none" style={[styles.orb, styles.orbBottom]} />
      {children}
    </SafeAreaView>
  );
}

function createStyles(colors: AppColorTokens) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  backgroundFill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  topWash: {
    position: 'absolute',
    top: -70,
    left: -24,
    right: -24,
    height: 220,
    borderBottomLeftRadius: 90,
    borderBottomRightRadius: 90,
    backgroundColor: colors.surfaceRaised,
  },
  leftBand: {
    position: 'absolute',
    top: 130,
    left: -120,
    width: 210,
    height: '76%',
    borderRadius: 120,
    backgroundColor: colors.primaryMuted,
    transform: [{ rotate: '-8deg' }],
  },
  orb: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    opacity: 0.24,
  },
  orbTop: {
    top: -104,
    right: -96,
    backgroundColor: colors.accentMuted,
  },
  orbBottom: {
    left: -116,
    bottom: -116,
    backgroundColor: colors.infoMuted,
  },
  });
}
