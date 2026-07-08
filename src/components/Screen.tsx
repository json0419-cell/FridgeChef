import type { PropsWithChildren } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients } from '../styles/theme';

export function Screen({ children }: PropsWithChildren) {
  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={gradients.app} style={styles.backgroundFill} />
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
  orb: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    opacity: 0.32,
  },
  orbTop: {
    top: -80,
    right: -80,
    backgroundColor: colors.gold,
  },
  orbBottom: {
    left: -90,
    bottom: -100,
    backgroundColor: colors.sky,
  },
});
