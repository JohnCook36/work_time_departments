import { ThemeProvider } from '@emotion/react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ShiftEditor } from './ShiftEditor';
import { getTheme } from './theme';
import type { ShiftEntry } from './types';

const employee = {
  id: 'employee-1',
  name: 'Тестовый сотрудник',
  departmentId: 'department-1',
};

function renderEditor(
  onSave = vi.fn(),
  onClose = vi.fn(),
  entry: ShiftEntry = { type: 'empty' },
) {
  const result = render(
    <ThemeProvider theme={getTheme('light')}>
      <ShiftEditor
        employee={employee}
        day={18}
        year={2026}
        month={8}
        entry={entry}
        onSave={onSave}
        onClose={onClose}
      />
    </ThemeProvider>,
  );

  return { ...result, onSave, onClose };
}

describe('ShiftEditor', () => {
  it('applies the 08:00-17:00 preset and saves it', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await user.click(screen.getByRole('button', { name: '08:00–17:00' }));
    await user.click(screen.getByRole('button', { name: /Сохранить смену/ }));

    expect(onSave).toHaveBeenCalledWith('08:00-17:00');
  });

  it('includes the N code when a night preset is selected', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await user.click(screen.getByRole('button', { name: /20:00–08:00/ }));
    await user.click(screen.getByRole('button', { name: /Сохранить смену/ }));

    expect(onSave).toHaveBeenCalledWith('N 20:00-08:00');
  });

  it('supports OFF and clearing the cell', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await user.click(screen.getByRole('button', { name: 'OFF' }));
    await user.click(screen.getByRole('button', { name: /Очистить ячейку/ }));

    expect(onSave).toHaveBeenNthCalledWith(1, 'OFF');
    expect(onSave).toHaveBeenNthCalledWith(2, '');
  });

  it('closes only when the overlay itself is pressed', () => {
    const { container, onClose } = renderEditor();
    const drawer = screen.getByText('Смена сотрудника').closest('div')!;

    fireEvent.mouseDown(drawer);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(container.firstElementChild!);
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('loads and saves an existing coded shift', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor(vi.fn(), vi.fn(), {
      type: 'shift',
      shift: { start: '10:00', end: '19:00', code: 'INN' },
    });

    expect(screen.getByRole('combobox')).toHaveValue('INN');
    expect(screen.getByDisplayValue('10:00')).toBeInTheDocument();
    expect(screen.getByDisplayValue('19:00')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Сохранить смену/ }));
    expect(onSave).toHaveBeenCalledWith('INN 10:00-19:00');
  });

  it('clears an existing code when a regular preset is selected', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor(vi.fn(), vi.fn(), {
      type: 'shift',
      shift: { start: '20:00', end: '08:00', code: 'N' },
    });

    await user.click(screen.getByRole('button', { name: '07:00–16:00' }));
    await user.click(screen.getByRole('button', { name: /Сохранить смену/ }));
    expect(onSave).toHaveBeenCalledWith('07:00-16:00');
  });

});
