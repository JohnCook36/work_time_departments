import { describe, expect, it } from 'vitest';

import { getOccupiedShiftNotice } from '../../../src/components/drawers/ShiftEditor';

describe('occupied shift warning', () => {
  it('returns no warning for an empty planner cell', () => {
    expect(
      getOccupiedShiftNotice({ type: 'empty' }, 22, 8, 2026),
    ).toBeNull();
  });

  it('shows the existing shift and selected date', () => {
    expect(
      getOccupiedShiftNotice(
        {
          type: 'shift',
          shift: { start: '08:00', end: '17:00', code: 'E' },
        },
        22,
        8,
        2026,
      ),
    ).toBe(
      'Сотрудник уже запланирован на 22.09.2026: E · 08:00–17:00. Чтобы поставить другую смену, измените текущую запись или сначала очистите ячейку.',
    );
  });

  it('also treats OFF as an occupied date', () => {
    expect(
      getOccupiedShiftNotice({ type: 'off' }, 22, 8, 2026),
    ).toBe(
      'У сотрудника уже есть запись на 22.09.2026: OFF. Чтобы поставить смену, измените текущую запись.',
    );
  });
});
