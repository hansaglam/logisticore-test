export type AppOrientationMode = 'PORTRAIT_APP' | 'LANDSCAPE_MAP';

/** Ownership is navigation metadata, never account or gameplay state. */
export interface OrientationRoute {
  mainTab: string;
  owner?: 'map' | 'standalone';
  nestedState?: string;
}

export function resolveOrientationForMainTab(tab: string): AppOrientationMode {
  return tab === 'map' ? 'LANDSCAPE_MAP' : 'PORTRAIT_APP';
}

export function resolveOrientationForRoute(route: OrientationRoute): AppOrientationMode {
  if (route.owner === 'standalone') return 'PORTRAIT_APP';
  // Map-owned inspectors, panels and nested states inherit the real Harita tab.
  return resolveOrientationForMainTab(route.mainTab);
}

export function isLandscapeMapExperience(route: OrientationRoute): boolean {
  return resolveOrientationForRoute(route) === 'LANDSCAPE_MAP';
}

/** One in-flight native call; coalesce pending requests to the newest authority. */
export function createOrientationController(
  lock: (mode: AppOrientationMode) => Promise<void>,
  onError: (error: unknown) => void = () => {},
) {
  let desired: AppOrientationMode = 'PORTRAIT_APP';
  let applied: AppOrientationMode | undefined;
  let revision = 0;
  let tail = Promise.resolve();
  return {
    request(mode: AppOrientationMode, reassert = false): Promise<void> {
      if (desired !== mode || reassert) {
        desired = mode;
        revision += 1;
        if (reassert) applied = undefined;
      }
      tail = tail.then(async () => {
        if (applied === desired) return;
        const target = desired;
        const token = revision;
        try {
          await lock(target);
          applied = token === revision ? target : undefined;
        } catch (error) {
          applied = undefined;
          onError(error); // Retry on next request/foreground, not a busy loop.
        }
      });
      return tail;
    },
  };
}
