import { describe, expect, it } from 'vitest';

import { resolveRuntimeConfig } from '../../../src/config/runtime';

describe('resolveRuntimeConfig', () => {
  it('keeps localhost and local planner available in development', () => {
    expect(resolveRuntimeConfig({ PROD: false })).toEqual({
      apiUrl: 'http://localhost:3000',
      serverPlannerReadEnabled: false,
      serverPlannerWriteEnabled: false,
    });
  });

  it('normalizes an explicit API URL and enables read when write is enabled', () => {
    expect(
      resolveRuntimeConfig({
        PROD: false,
        VITE_API_URL: 'https://api.example.test/',
        VITE_SERVER_PLANNER_WRITE: '1',
      }),
    ).toEqual({
      apiUrl: 'https://api.example.test',
      serverPlannerReadEnabled: true,
      serverPlannerWriteEnabled: true,
    });
  });

  it('fails closed in production when API URL is missing', () => {
    expect(() =>
      resolveRuntimeConfig({
        PROD: true,
        VITE_SERVER_PLANNER_WRITE: '1',
      }),
    ).toThrow(/VITE_API_URL/);
  });

  it('fails closed in production when server planner write is disabled', () => {
    expect(() =>
      resolveRuntimeConfig({
        PROD: true,
        VITE_API_URL: 'https://api.example.test',
      }),
    ).toThrow(/VITE_SERVER_PLANNER_WRITE=1/);
  });
});
