import { describe, expect, it, vi } from 'vitest';

import { getOnboardingStatus } from '../../../src/api/auth';

describe('auth api empty response handling', () => {
  it('normalizes an empty successful onboarding status response to null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(getOnboardingStatus()).resolves.toBeNull();
  });
});
