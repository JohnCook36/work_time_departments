import { ThemeProvider } from '@emotion/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EmployeeEditDrawer } from '../../../src/components/drawers/EmployeeEditDrawer';
import { AppDialogProvider } from '../../../src/components/dialogs/AppDialogProvider';
import { getTheme } from '../../../src/theme/theme';

const employee = {
  id: 'employee-1',
  name: 'Тестовый сотрудник',
  departmentId: 'department-a',
  employmentRate: 1 as const,
  scheduleMode: 'flexible' as const,
  isLinked: false,
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
      <AppDialogProvider>
      <EmployeeEditDrawer
        employee={employee}
        departments={departments}
        busy={false}
        onSave={onSave}
        onDeactivate={onDeactivate}
        onClose={onClose}
      />
      </AppDialogProvider>
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

    const startInput = screen.getByLabelText('Начало рабочего дня');
    const endInput = screen.getByLabelText('Окончание рабочего дня');
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

    const startInput = screen.getByLabelText('Начало рабочего дня');
    const endInput = screen.getByLabelText('Окончание рабочего дня');
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

  it('issues a one-time activation invitation without exposing employee PII in the QR payload', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          invitationId: 'invitation-1',
          purpose: 'ACTIVATION',
          expiresAt: '2026-09-28T18:00:00.000Z',
          employee: {
            id: 'employee-1',
            displayName: 'Тестовый сотрудник',
            departmentId: 'department-a',
            departmentName: 'Front Office',
          },
          token: 'opaque-activation-token',
          shortCode: 'ABCDE-FGHIJ',
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    renderDrawer();

    await user.click(
      screen.getByRole('button', { name: 'Выдать приглашение' }),
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '/auth/activation/employees/employee-1/invitation',
      ),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    expect(
      await screen.findByLabelText('QR-код активации'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Резервный код активации')).toHaveValue(
      'ABCDE-FGHIJ',
    );
    const activationLink = screen.getByLabelText('Ссылка активации');
    expect((activationLink as HTMLInputElement).value).toContain(
      '/login?activation=opaque-activation-token',
    );
    expect((activationLink as HTMLInputElement).value).not.toContain(
      'Тестовый сотрудник',
    );

    fetchSpy.mockRestore();
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
