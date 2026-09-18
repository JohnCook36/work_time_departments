import { ThemeProvider } from '@emotion/react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ShiftEditor } from './ShiftEditor';
import { getTheme } from './theme';

const employee = {
  id: 'employee-1',
  name: 'Тестовый сотрудник',
  departmentId: 'department-1',
};

function renderEditor(
  onSave = vi.fn(),
  onClose = vi.fn(),
) {
  const result = render(
    <ThemeProvider theme={getTheme('light')}>
      <ShiftEditor
        employee={employee}
        day={18}
        year={2026}
        month={8}
        entry={{ type: 'empty' }}
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
});
