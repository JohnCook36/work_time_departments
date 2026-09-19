import { ThemeProvider } from '@emotion/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { getTheme } from './theme';
import type { ScheduleData } from './types';
import { WeeklyHoursPanel } from './WeeklyHoursPanel';

const week = [{ key: '1', start: 14, end: 20, label: '14–20' }];
const schedule: ScheduleData = {
  employee: {
    14: {
      type: 'shift' as const,
      shift: { start: '08:00', end: '17:00' },
    },
  },
};

function renderPanel(
  rate: 1 | 0.75 | 0.5 | undefined,
  onRateChange = vi.fn(),
  scheduleData: ScheduleData = schedule,
) {
  render(
    <ThemeProvider theme={getTheme('light')}>
      <WeeklyHoursPanel
        employees={[
          {
            id: 'employee',
            name: 'Сотрудник',
            departmentId: 'department',
            ...(rate === undefined ? {} : { employmentRate: rate }),
          },
        ]}
        schedule={scheduleData}
        year={2026}
        month={8}
        weeks={week}
        onRateChange={onRateChange}
      />
    </ThemeProvider>,
  );

  return onRateChange;
}

describe('WeeklyHoursPanel', () => {
  it.each([
    [1, '8 / 40', '-32 ч'],
    [0.75, '8 / 30', '-22 ч'],
    [0.5, '8 / 20', '-12 ч'],
  ] as const)('shows fact and norm for the %s rate', (rate, factNorm, delta) => {
    renderPanel(rate);

    expect(screen.getByText(factNorm)).toBeInTheDocument();
    expect(screen.getByText(delta)).toBeInTheDocument();
  });

  it('reports a changed employment rate', async () => {
    const user = userEvent.setup();
    const onRateChange = renderPanel(1);

    await user.selectOptions(screen.getByTitle('Ставка сотрудника'), '0.75');

    expect(onRateChange).toHaveBeenCalledWith('employee', 0.75);
  });
  it('uses the full-time rate when employmentRate is absent', () => {
    renderPanel(undefined);
    expect(screen.getByText('8 / 40')).toBeInTheDocument();
    expect(screen.getByTitle('Ставка сотрудника')).toHaveValue('1');
  });

  it('shows a positive weekly delta when fact exceeds the norm', () => {
    const overtimeSchedule: ScheduleData = {
      employee: Object.fromEntries(
        [14, 15, 16, 17, 18, 19].map((day) => [
          day,
          { type: 'shift' as const, shift: { start: '08:00', end: '17:00' } },
        ]),
      ),
    };
    renderPanel(1, vi.fn(), overtimeSchedule);
    expect(screen.getByText('48 / 40')).toBeInTheDocument();
    expect(screen.getByText('+8 ч')).toBeInTheDocument();
  });

});
