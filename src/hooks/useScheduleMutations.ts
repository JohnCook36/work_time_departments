import { useCallback, useState } from 'react';

import {
  applyDepartmentScheduleChanges,
  applyPlannerScheduleChanges,
  buildScheduleCellChange,
  PlannerCellMetadataMap,
} from '../plannerApi';
import { Employee, ScheduleData } from '../types';
import { validateShiftInput } from '../utils';
import { PlannerServerStatus } from './usePlannerServerSync';

interface UseScheduleMutationsOptions {
  serverPlannerWriteEnabled: boolean;
  serverPlannerStatus: PlannerServerStatus;
  serverCellMetadata: PlannerCellMetadataMap;
  employees: Employee[];
  rawSchedule: ScheduleData;
  year: number;
  month: number;
  daysInMonth: number;
  updateCurrentSchedule: (
    updater: (current: ScheduleData) => ScheduleData
  ) => void;
  refreshServerPlanner: () => Promise<void>;
}

export function useScheduleMutations({
  serverPlannerWriteEnabled,
  serverPlannerStatus,
  serverCellMetadata,
  employees,
  rawSchedule,
  year,
  month,
  daysInMonth,
  updateCurrentSchedule,
  refreshServerPlanner,
}: UseScheduleMutationsOptions) {
  const [isApplyingBulkSchedule, setIsApplyingBulkSchedule] =
    useState(false);

  const updateCell = useCallback(
    (empId: string, day: number, value: string) => {
      const entry = validateShiftInput(value);

      if (!serverPlannerWriteEnabled) {
        updateCurrentSchedule((current) => ({
          ...current,
          [empId]: {
            ...(current[empId] || {}),
            [day]: entry,
          },
        }));
        return;
      }

      if (entry.type === 'error') {
        alert(entry.error || 'Некорректная смена.');
        return;
      }

      if (serverPlannerStatus !== 'ready') {
        alert('График ещё не синхронизирован с сервером.');
        return;
      }

      const employee = employees.find((item) => item.id === empId);
      if (!employee) {
        alert('Сотрудник не найден в серверном графике.');
        void refreshServerPlanner();
        return;
      }

      const change = buildScheduleCellChange(
        empId,
        day,
        entry,
        serverCellMetadata[empId]?.[day]
      );

      updateCurrentSchedule((current) => ({
        ...current,
        [empId]: {
          ...(current[empId] || {}),
          [day]: entry,
        },
      }));

      void applyDepartmentScheduleChanges(
        employee.departmentId,
        year,
        month + 1,
        [change]
      )
        .then(() => refreshServerPlanner())
        .catch((error) => {
          console.error('Server planner write failed', error);
          alert(
            error instanceof Error
              ? 'Не удалось сохранить смену: ' + error.message
              : 'Не удалось сохранить смену на сервере.'
          );
          void refreshServerPlanner();
        });
    },
    [
      employees,
      month,
      refreshServerPlanner,
      serverCellMetadata,
      serverPlannerStatus,
      serverPlannerWriteEnabled,
      updateCurrentSchedule,
      year,
    ]
  );

  const fillOffAll = useCallback(async () => {
    if (!confirm('Заполнить все пустые ячейки текущего месяца как OFF?')) {
      return;
    }

    if (!serverPlannerWriteEnabled) {
      updateCurrentSchedule((current) => {
        const next = { ...current };

        employees.forEach((employee) => {
          let employeeSchedule = { ...(next[employee.id] || {}) };

          for (let day = 1; day <= daysInMonth; day++) {
            if (!employeeSchedule[day] || employeeSchedule[day].type === 'empty') {
              employeeSchedule = {
                ...employeeSchedule,
                [day]: { type: 'off' },
              };
            }
          }

          next[employee.id] = employeeSchedule;
        });

        return next;
      });
      return;
    }

    const changes = employees.flatMap((employee) => {
      const employeeSchedule = rawSchedule[employee.id] || {};

      return Array.from({ length: daysInMonth }, (_, index) => index + 1)
        .filter((day) => {
          const entry = employeeSchedule[day];
          return !entry || entry.type === 'empty';
        })
        .map((day) =>
          buildScheduleCellChange(
            employee.id,
            day,
            { type: 'off' },
            serverCellMetadata[employee.id]?.[day]
          )
        );
    });

    if (changes.length === 0) {
      alert('Пустых ячеек для заполнения OFF нет.');
      return;
    }

    if (changes.length > 5000) {
      alert(
        'Слишком много ячеек для одной атомарной операции. Уменьшите количество сотрудников.'
      );
      return;
    }

    try {
      setIsApplyingBulkSchedule(true);
      await applyPlannerScheduleChanges(year, month + 1, changes);
      await refreshServerPlanner();
    } catch (error) {
      console.error('Server bulk OFF failed', error);
      alert(
        error instanceof Error
          ? 'Не удалось заполнить OFF: ' + error.message
          : 'Не удалось заполнить OFF на сервере.'
      );
      await refreshServerPlanner();
    } finally {
      setIsApplyingBulkSchedule(false);
    }
  }, [
    daysInMonth,
    employees,
    month,
    rawSchedule,
    refreshServerPlanner,
    serverCellMetadata,
    serverPlannerWriteEnabled,
    updateCurrentSchedule,
    year,
  ]);

  const clearAll = useCallback(async () => {
    if (!confirm('Очистить все смены за текущий месяц?')) return;

    if (!serverPlannerWriteEnabled) {
      updateCurrentSchedule(() => ({}));
      return;
    }

    const changes = employees.flatMap((employee) =>
      Object.entries(serverCellMetadata[employee.id] || {})
        .map(([dayValue, metadata]) => ({
          day: Number(dayValue),
          metadata,
        }))
        .filter(
          ({ day }) =>
            Number.isInteger(day) && day >= 1 && day <= daysInMonth
        )
        .map(({ day, metadata }) =>
          buildScheduleCellChange(
            employee.id,
            day,
            { type: 'empty' },
            metadata
          )
        )
    );

    if (changes.length === 0) {
      alert('Сохранённых смен за текущий месяц нет.');
      return;
    }

    if (changes.length > 5000) {
      alert(
        'Слишком много ячеек для одной атомарной операции. Операция отменена.'
      );
      return;
    }

    try {
      setIsApplyingBulkSchedule(true);
      await applyPlannerScheduleChanges(year, month + 1, changes);
      await refreshServerPlanner();
    } catch (error) {
      console.error('Server clear month failed', error);
      alert(
        error instanceof Error
          ? 'Не удалось очистить месяц: ' + error.message
          : 'Не удалось очистить месяц на сервере.'
      );
      await refreshServerPlanner();
    } finally {
      setIsApplyingBulkSchedule(false);
    }
  }, [
    daysInMonth,
    employees,
    month,
    refreshServerPlanner,
    serverCellMetadata,
    serverPlannerWriteEnabled,
    updateCurrentSchedule,
    year,
  ]);

  return {
    updateCell,
    fillOffAll,
    clearAll,
    isApplyingBulkSchedule,
  };
}
