import AsyncStorage from '@react-native-async-storage/async-storage';
import type { InitialState, NavigationState } from '@react-navigation/native';

export const NAVIGATION_STATE_STORAGE_KEY = 'fridgechef.navigation-state.v1';

const NAVIGATION_STATE_VERSION = 1;
const TRANSIENT_ROUTE_PARAMS = new Set(['focusRecommendationId', 'generationRequestId']);

type PersistedRoute = {
  name: string;
  params?: Record<string, unknown>;
  state?: PersistedNavigationState;
  [key: string]: unknown;
};

type PersistedNavigationState = {
  routes: PersistedRoute[];
  [key: string]: unknown;
};

type StoredNavigationState = {
  version: typeof NAVIGATION_STATE_VERSION;
  state: PersistedNavigationState;
};

export async function loadNavigationState(): Promise<InitialState | undefined> {
  try {
    const raw = await AsyncStorage.getItem(NAVIGATION_STATE_STORAGE_KEY);
    if (!raw) {
      return undefined;
    }

    const stored = JSON.parse(raw) as Partial<StoredNavigationState>;
    if (stored.version !== NAVIGATION_STATE_VERSION || !isNavigationState(stored.state)) {
      return undefined;
    }

    return sanitizeNavigationState(stored.state) as InitialState;
  } catch {
    return undefined;
  }
}

export async function saveNavigationState(state: NavigationState): Promise<void> {
  const stored: StoredNavigationState = {
    version: NAVIGATION_STATE_VERSION,
    state: sanitizeNavigationState(state as unknown as PersistedNavigationState),
  };

  try {
    await AsyncStorage.setItem(NAVIGATION_STATE_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Navigation remains usable when local preference storage is unavailable.
  }
}

function sanitizeNavigationState(state: PersistedNavigationState): PersistedNavigationState {
  return {
    ...state,
    routes: state.routes.map((route) => {
      const params = sanitizeRouteParams(route.params);
      return {
        ...route,
        ...(params ? { params } : { params: undefined }),
        ...(route.state ? { state: sanitizeNavigationState(route.state) } : {}),
      };
    }),
  };
}

function sanitizeRouteParams(params: Record<string, unknown> | undefined) {
  if (!params) {
    return undefined;
  }

  const sanitized = Object.fromEntries(
    Object.entries(params).filter(([key]) => !TRANSIENT_ROUTE_PARAMS.has(key)),
  );
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function isNavigationState(value: unknown): value is PersistedNavigationState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const routes = (value as { routes?: unknown }).routes;
  return Array.isArray(routes) && routes.length > 0 && routes.every(isNavigationRoute);
}

function isNavigationRoute(value: unknown): value is PersistedRoute {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const route = value as { name?: unknown; state?: unknown };
  return (
    typeof route.name === 'string' &&
    (route.state === undefined || isNavigationState(route.state))
  );
}
