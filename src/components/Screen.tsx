import type { PropsWithChildren } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients } from '../styles/theme';

export function Screen({ children }: PropsWithChildren) {
  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={gradients.app} style={styles.backgroundFill} />
      <View pointerEvents="none" style={styles.topWash} />
      <View pointerEvents="none" style={styles.leftBand} />
      <View pointerEvents="none" style={[styles.orb, styles.orbTop]} />
      <View pointerEvents="none" style={[styles.orb, styles.orbBottom]} />
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    backgroundColor: 'rgba(255, 253, 248, 0.42)',
  },
  leftBand: {
    position: 'absolute',
    top: 130,
    left: -120,
    width: 210,
    height: '76%',
    borderRadius: 120,
    backgroundColor: 'rgba(232, 75, 47, 0.06)',
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
    backgroundColor: colors.gold,
  },
  orbBottom: {
    left: -116,
    bottom: -116,
    backgroundColor: colors.sky,
  },
});
