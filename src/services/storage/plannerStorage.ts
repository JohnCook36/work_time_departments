const LEGACY_PLANNER_STORAGE_KEY = 'hotel-shift-planner';
const PLANNER_STORAGE_PREFIX = 'hotel-shift-planner:user:';

function getBrowserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function plannerStorageKeyForUser(userId: string): string {
  return PLANNER_STORAGE_PREFIX + encodeURIComponent(userId);
}

export function clearLegacyPlannerStorage(): void {
  const storage = getBrowserStorage();
  if (!storage) return;

  try {
    storage.removeItem(LEGACY_PLANNER_STORAGE_KEY);
  } catch {
    // Browser storage may be unavailable.
  }
}

export function readPlannerStorage(userId: string): string | null {
  const storage = getBrowserStorage();
  if (!storage) return null;

  clearLegacyPlannerStorage();

  try {
    return storage.getItem(plannerStorageKeyForUser(userId));
  } catch {
    return null;
  }
}

export function writePlannerStorage(userId: string, value: string): void {
  const storage = getBrowserStorage();
  if (!storage) return;

  clearLegacyPlannerStorage();

  try {
    storage.setItem(plannerStorageKeyForUser(userId), value);
  } catch {
    // Browser storage may be unavailable.
  }
}

export function clearPlannerStorageForUser(userId: string): void {
  const storage = getBrowserStorage();
  if (!storage) return;

  try {
    storage.removeItem(plannerStorageKeyForUser(userId));
  } catch {
    // Browser storage may be unavailable.
  }
}
