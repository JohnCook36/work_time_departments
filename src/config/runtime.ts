export interface RuntimeEnv {
  PROD?: boolean;
  VITE_API_URL?: string;
  VITE_SERVER_PLANNER_READ?: string;
  VITE_SERVER_PLANNER_WRITE?: string;
}

export interface RuntimeConfig {
  apiUrl: string;
  serverPlannerReadEnabled: boolean;
  serverPlannerWriteEnabled: boolean;
}

export function resolveRuntimeConfig(env: RuntimeEnv): RuntimeConfig {
  const configuredApiUrl = env.VITE_API_URL?.trim();
  const serverPlannerWriteEnabled = env.VITE_SERVER_PLANNER_WRITE === '1';
  const serverPlannerReadEnabled =
    serverPlannerWriteEnabled || env.VITE_SERVER_PLANNER_READ === '1';

  if (env.PROD) {
    if (!configuredApiUrl) {
      throw new Error(
        'Production configuration requires VITE_API_URL; localhost fallback is disabled.',
      );
    }

    if (!serverPlannerWriteEnabled) {
      throw new Error(
        'Production configuration requires VITE_SERVER_PLANNER_WRITE=1; local planner mode is disabled.',
      );
    }
  }

  return {
    apiUrl: (configuredApiUrl || 'http://localhost:3000').replace(/\/$/, ''),
    serverPlannerReadEnabled,
    serverPlannerWriteEnabled,
  };
}

export function getRuntimeConfig(): RuntimeConfig {
  return resolveRuntimeConfig({
    PROD: import.meta.env.PROD,
    VITE_API_URL: import.meta.env.VITE_API_URL,
    VITE_SERVER_PLANNER_READ: import.meta.env.VITE_SERVER_PLANNER_READ,
    VITE_SERVER_PLANNER_WRITE: import.meta.env.VITE_SERVER_PLANNER_WRITE,
  });
}
