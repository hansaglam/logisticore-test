import { useLayoutEffect } from 'react';
import { AppState } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { createOrientationController, type AppOrientationMode } from '../domain/screenOrientationAuthority';

// Retain the queue across Fast Refresh: old native promises must finish before new locks.
const runtime = globalThis as typeof globalThis & {
  __logisticoreOrientation?: ReturnType<typeof createOrientationController>;
};
const controller = runtime.__logisticoreOrientation ??= createOrientationController(
  (mode) => ScreenOrientation.lockAsync(mode === 'LANDSCAPE_MAP'
    ? ScreenOrientation.OrientationLock.LANDSCAPE
    : ScreenOrientation.OrientationLock.PORTRAIT_UP),
  (error) => console.warn('[screen-orientation] Failed to apply route orientation', error),
);

/** Mounted once at the navigation root, including loading/recovery screens. */
export function useScreenOrientationController(mode: AppOrientationMode) {
  useLayoutEffect(() => {
    // Reassert on root remount/Fast Refresh as well as real mode transitions.
    void controller.request(mode, true);
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && previous !== 'active') void controller.request(mode, true);
      previous = next;
    });
    return () => { subscription.remove(); };
  }, [mode]);
}
