import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EmployeeCreateDrawer } from '../../../src/components/drawers/EmployeeCreateDrawer';
import { AppThemeProvider } from '../../../src/theme/AppThemeProvider';

describe('EmployeeCreateDrawer schedule fields', () => {
  it('shows fixed working time only for the 5/2 schedule mode', async () => {
    const user = userEvent.setup();

    render(
      <AppThemeProvider>
        <EmployeeCreateDrawer
          departments={[
            { id: 'front-office', name: 'Front Office', kind: 'general' },
          ]}
          busy={false}
          onCreate={vi.fn().mockResolvedValue(true)}
          onClose={vi.fn()}
        />
      </AppThemeProvider>,
    );

    expect(screen.queryByText('Рабочее время 5/2')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Начало рабочего дня'),
    ).not.toBeInTheDocument();

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[1], 'fixed-weekdays');

    expect(screen.getByText('Рабочее время 5/2')).toBeInTheDocument();
    expect(screen.getByLabelText('Начало рабочего дня')).toBeInTheDocument();
    expect(screen.getByLabelText('Окончание рабочего дня')).toBeInTheDocument();

    await user.selectOptions(selects[1], 'flexible');

    expect(screen.queryByText('Рабочее время 5/2')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Начало рабочего дня'),
    ).not.toBeInTheDocument();
  });
});
