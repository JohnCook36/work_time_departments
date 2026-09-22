import { ThemeProvider } from '@emotion/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EmployeeEditDrawer } from './EmployeeEditDrawer';
import { getTheme } from './theme';

const employee = {
  id: 'employee-1',
  name: 'Тестовый сотрудник',
  departmentId: 'department-a',
  employmentRate: 1 as const,
  scheduleMode: 'flexible' as const,
};

const departments = [
  { id: 'department-a', name: 'Front Office', kind: 'fo' as const },
  { id: 'department-b', name: 'Night', kind: 'night' as const },
];

function renderDrawer(
  onSave = vi.fn(),
  onDeactivate = vi.fn(),
  onClose = vi.fn(),
) {
  render(
    <ThemeProvider theme={getTheme('light')}>
      <EmployeeEditDrawer
        employee={employee}
        departments={departments}
        busy={false}
        onSave={onSave}
        onDeactivate={onDeactivate}
        onClose={onClose}
      />
    </ThemeProvider>,
  );

  return { onSave, onDeactivate, onClose };
}

describe('EmployeeEditDrawer', () => {
  it('submits normalized Employee edit values', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDrawer();

    const nameInput = screen.getByDisplayValue('Тестовый сотрудник');
    await user.clear(nameInput);
    await user.type(nameInput, '  Обновлённый сотрудник  ');

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[0], 'department-b');
    await user.selectOptions(selects[1], '0.75');
    await user.selectOptions(selects[2], 'fixed-weekdays');

    const startInput = screen.getByRole('textbox', {
      name: 'Начало рабочего дня',
    });
    const endInput = screen.getByRole('textbox', {
      name: 'Окончание рабочего дня',
    });
    await user.clear(startInput);
    await user.type(startInput, '09:00');
    await user.clear(endInput);
    await user.type(endInput, '18:00');

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSave).toHaveBeenCalledWith({
      displayName: 'Обновлённый сотрудник',
      departmentId: 'department-b',
      employmentRate: 0.75,
      scheduleMode: 'fixed-weekdays',
      fixedStartTime: '09:00',
      fixedEndTime: '18:00',
    });
  });

  it('blocks equal fixed start and end times', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDrawer();

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[2], 'fixed-weekdays');

    const startInput = screen.getByRole('textbox', {
      name: 'Начало рабочего дня',
    });
    const endInput = screen.getByRole('textbox', {
      name: 'Окончание рабочего дня',
    });
    await user.clear(startInput);
    await user.type(startInput, '08:00');
    await user.clear(endInput);
    await user.type(endInput, '08:00');

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(
      screen.getByRole('alert'),
    ).toHaveTextContent('Начало и окончание рабочего дня не могут совпадать.');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation action to deactivate', async () => {
    const user = userEvent.setup();
    const { onDeactivate } = renderDrawer();

    await user.click(
      screen.getByRole('button', { name: 'Деактивировать сотрудника' }),
    );

    expect(onDeactivate).toHaveBeenCalledOnce();
  });
});
