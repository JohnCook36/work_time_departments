import { ThemeProvider } from '@emotion/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyFoCoveragePreset,
  createScheduleRule,
  deleteScheduleRule,
  getManageableScheduleRules,
  getScheduleRuleHistory,
  ScheduleRuleResponse,
  updateScheduleRule,
} from '../../../src/api/planner';
import { ScheduleRulesDrawer } from '../../../src/components/drawers/ScheduleRulesDrawer';
import { getTheme } from '../../../src/theme/theme';

vi.mock('../../../src/api/planner', () => ({
  applyFoCoveragePreset: vi.fn(),
  createScheduleRule: vi.fn(),
  deleteScheduleRule: vi.fn(),
  getManageableScheduleRules: vi.fn(),
  getScheduleRuleHistory: vi.fn(),
  updateScheduleRule: vi.fn(),
}));

const applyFoPreset = vi.mocked(applyFoCoveragePreset);
const listRules = vi.mocked(getManageableScheduleRules);
const createRule = vi.mocked(createScheduleRule);
const updateRule = vi.mocked(updateScheduleRule);
const removeRule = vi.mocked(deleteScheduleRule);
const getHistory = vi.mocked(getScheduleRuleHistory);

function rule(overrides: Partial<ScheduleRuleResponse> = {}): ScheduleRuleResponse {
  return {
    id: 'rule-1',
    name: 'Не более 5 одновременно',
    description: 'Ограничение для Front Office',
    kind: 'MAX_CONCURRENT_EMPLOYEES',
    scope: 'DEPARTMENT',
    scopeValue: null,
    departmentId: 'department-a',
    priority: 100,
    severity: 'HARD',
    isActive: true,
    isDeleted: false,
    config: { maxConcurrent: 5 },
    violationMessage: 'В отделе одновременно больше 5 сотрудников.',
    version: 1,
    createdAt: '2026-09-24T20:00:00.000Z',
    updatedAt: '2026-09-24T20:00:00.000Z',
    editable: true,
    ...overrides,
  };
}

const departments = [
  { id: 'department-a', name: 'Front Office', kind: 'fo' as const },
];

describe('ScheduleRulesDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listRules.mockResolvedValue([rule()]);
  });

  it('applies the standard FO preset without hiding manual rule management', async () => {
    applyFoPreset.mockResolvedValue({
      status: 'ok',
      departmentId: 'department-a',
      created: 2,
      existing: 0,
      rules: [
        rule({
          id: 'preset-max',
          name: 'Стандарт FO · максимум 5 одновременно',
        }),
        rule({
          id: 'preset-open',
          name: 'Стандарт FO · 2 сотрудника к 07:00',
          kind: 'MIN_STAFF_AT_TIME',
          config: { time: '07:00', minStaff: 2 },
        }),
      ],
    });
    listRules
      .mockResolvedValueOnce([rule()])
      .mockResolvedValueOnce([
        rule(),
        rule({
          id: 'preset-max',
          name: 'Стандарт FO · максимум 5 одновременно',
        }),
        rule({
          id: 'preset-open',
          name: 'Стандарт FO · 2 сотрудника к 07:00',
          kind: 'MIN_STAFF_AT_TIME',
          config: { time: '07:00', minStaff: 2 },
        }),
      ]);

    render(
      <ThemeProvider theme={getTheme('light')}>
        <ScheduleRulesDrawer
          departments={departments}
          serverMode
          isSuperAdmin={false}
          onClose={vi.fn()}
        />
      </ThemeProvider>,
    );

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Добавить стандарт FO' }),
    );

    await waitFor(() => {
      expect(applyFoPreset).toHaveBeenCalledWith('department-a');
    });
    expect(
      await screen.findByText('Стандарт FO · максимум 5 одновременно'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Новое правило' })).toBeEnabled();
  });

  it('creates a department hard rule and refreshes the list', async () => {
    const created = rule({ id: 'rule-2', name: 'Минимум к 07:00' });
    createRule.mockResolvedValue(created);

    render(
      <ThemeProvider theme={getTheme('light')}>
        <ScheduleRulesDrawer
          departments={departments}
          serverMode
          isSuperAdmin={false}
          onClose={vi.fn()}
        />
      </ThemeProvider>,
    );

    expect(await screen.findByText('Не более 5 одновременно')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Новое правило' }));
    await user.type(screen.getByLabelText('Название'), 'Минимум к 07:00');
    await user.type(screen.getByLabelText('Описание'), 'Утреннее покрытие');
    await user.type(
      screen.getByLabelText('Текст нарушения'),
      'К 07:00 должен быть сотрудник.',
    );
    await user.click(screen.getByRole('button', { name: 'Создать правило' }));

    await waitFor(() => {
      expect(createRule).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Минимум к 07:00',
          scope: 'DEPARTMENT',
          departmentId: 'department-a',
          severity: 'HARD',
          priority: 100,
          isActive: true,
          config: { maxConcurrent: 5 },
        }),
      );
    });
    expect(listRules).toHaveBeenCalledTimes(2);
  });

  it('shows immutable history and supports enable/disable with optimistic version', async () => {
    const current = rule();
    listRules
      .mockResolvedValueOnce([current])
      .mockResolvedValueOnce([rule({ isActive: false, version: 2 })]);
    updateRule.mockResolvedValue(rule({ isActive: false, version: 2 }));
    getHistory.mockResolvedValue([
      {
        id: 'version-2',
        version: 2,
        snapshot: { name: current.name, isActive: false },
        changedByLabel: 'Администратор',
        createdAt: '2026-09-24T21:00:00.000Z',
      },
      {
        id: 'version-1',
        version: 1,
        snapshot: { name: current.name, isActive: true },
        changedByLabel: 'Администратор',
        createdAt: '2026-09-24T20:00:00.000Z',
      },
    ]);

    render(
      <ThemeProvider theme={getTheme('light')}>
        <ScheduleRulesDrawer
          departments={departments}
          serverMode
          isSuperAdmin
          onClose={vi.fn()}
        />
      </ThemeProvider>,
    );

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'История' }));
    expect(await screen.findByText(/^v2 ·/)).toBeInTheDocument();
    expect(screen.getByText(/^v1 ·/)).toBeInTheDocument();
    expect(screen.getAllByText('Изменил: Администратор')).toHaveLength(2);
    expect(screen.queryByText('user-admin')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Выключить' }));
    await waitFor(() => {
      expect(updateRule).toHaveBeenCalledWith('rule-1', {
        isActive: false,
        expectedUpdatedAt: current.updatedAt,
      });
    });
  });

  it('keeps organization/role/shift-type scopes unavailable to department admin', async () => {
    render(
      <ThemeProvider theme={getTheme('light')}>
        <ScheduleRulesDrawer
          departments={departments}
          serverMode
          isSuperAdmin={false}
          onClose={vi.fn()}
        />
      </ThemeProvider>,
    );

    await screen.findByText('Не более 5 одновременно');
    const scope = screen.getByLabelText('Область');
    expect(scope).toContainHTML('<option value="DEPARTMENT">Отдел</option>');
    expect(scope).not.toContainHTML('ORGANIZATION');
    expect(scope).not.toContainHTML('ROLE');
    expect(scope).not.toContainHTML('SHIFT_TYPE');
  });

  it('requires explicit second delete click and preserves server optimistic version', async () => {
    const current = rule();
    listRules
      .mockResolvedValueOnce([current])
      .mockResolvedValueOnce([]);
    removeRule.mockResolvedValue({ status: 'ok', ruleId: current.id });

    render(
      <ThemeProvider theme={getTheme('light')}>
        <ScheduleRulesDrawer
          departments={departments}
          serverMode
          isSuperAdmin
          onClose={vi.fn()}
        />
      </ThemeProvider>,
    );

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Удалить' }));
    expect(removeRule).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Подтвердить удаление' }),
    );

    await waitFor(() => {
      expect(removeRule).toHaveBeenCalledWith(current.id, current.updatedAt);
    });
  });
});
