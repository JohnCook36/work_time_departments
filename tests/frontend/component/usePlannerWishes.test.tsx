import { useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EmployeeWishesData } from '../../../src/domain/models';
import { usePlannerWishes } from '../../../src/hooks/usePlannerWishes';

function useHarness() {
  const [wishes, setWishes] = useState<EmployeeWishesData>({});

  const wishActions = usePlannerWishes({
    setWishes,
    periodKey: '2026-09',
    year: 2026,
    month: 8,
    serverPlannerWriteEnabled: false,
    serverPlannerStatus: 'disabled',
    refreshServerPlanner: vi.fn().mockResolvedValue(undefined),
  });

  return {
    wishes,
    ...wishActions,
  };
}

describe('usePlannerWishes local orchestration', () => {
  it('adds a local wish to the active employee period', () => {
    const { result } = renderHook(() => useHarness());

    act(() => {
      result.current.addWish('employee-1', {
        day: 12,
        text: 'Желательно выходной',
      });
    });

    const stored = result.current.wishes['employee-1']?.['2026-09'] || [];
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      day: 12,
      text: 'Желательно выходной',
    });
    expect(stored[0].id).toEqual(expect.any(String));
  });

  it('removes only the selected local wish', () => {
    const { result } = renderHook(() => useHarness());

    act(() => {
      result.current.addWish('employee-1', {
        day: null,
        text: 'Первое',
      });
      result.current.addWish('employee-1', {
        day: 20,
        text: 'Второе',
      });
    });

    const before = result.current.wishes['employee-1']?.['2026-09'] || [];
    expect(before).toHaveLength(2);

    act(() => {
      result.current.removeWish('employee-1', before[0].id);
    });

    const after = result.current.wishes['employee-1']?.['2026-09'] || [];
    expect(after).toHaveLength(1);
    expect(after[0].text).toBe('Второе');
  });
});
