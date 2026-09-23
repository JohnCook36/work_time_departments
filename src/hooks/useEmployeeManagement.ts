import { Dispatch, SetStateAction, useCallback, useState } from 'react';

import {
  createPlannerEmployee,
  deactivatePlannerEmployee,
  PlannerEmployeeMetadataMap,
  updatePlannerEmployee,
} from '../api/planner';
import {
  Employee,
  EmployeeScheduleMode,
  EmployeeWishesData,
  EmploymentRate,
  SchedulePeriodsData,
} from '../domain/models';
import { PlannerServerStatus } from './usePlannerServerSync';
import { useAppDialog } from '../components/dialogs/AppDialogProvider';

export interface EmployeeManagementValues {
  displayName: string;
  departmentId: string;
  employmentRate: EmploymentRate;
  scheduleMode: EmployeeScheduleMode;
  fixedStartTime?: string | null;
  fixedEndTime?: string | null;
}

interface UseEmployeeManagementOptions {
  serverPlannerWriteEnabled: boolean;
  serverPlannerStatus: PlannerServerStatus;
  serverEmployeeMetadata: PlannerEmployeeMetadataMap;
  setEmployees: Dispatch<SetStateAction<Employee[]>>;
  setSchedules: Dispatch<SetStateAction<SchedulePeriodsData>>;
  setWishes: Dispatch<SetStateAction<EmployeeWishesData>>;
  refreshServerPlanner: () => Promise<void>;
}

function generateLocalId(): string {
  return Math.random().toString(36).slice(2, 11);
}

export function useEmployeeManagement({
  serverPlannerWriteEnabled,
  serverPlannerStatus,
  serverEmployeeMetadata,
  setEmployees,
  setSchedules,
  setWishes,
  refreshServerPlanner,
}: UseEmployeeManagementOptions) {
  const { showMessage } = useAppDialog();
  const [isCreatingEmployee, setIsCreatingEmployee] = useState(false);
  const [updatingEmployeeRateId, setUpdatingEmployeeRateId] =
    useState<string | null>(null);
  const [mutatingEmployeeId, setMutatingEmployeeId] =
    useState<string | null>(null);

  const createEmployee = useCallback(
    async (values: EmployeeManagementValues): Promise<boolean> => {
      if (isCreatingEmployee) return false;

      if (!serverPlannerWriteEnabled) {
        setEmployees((prev) => [
          ...prev,
          {
            id: generateLocalId(),
            name: values.displayName,
            departmentId: values.departmentId,
            employmentRate: values.employmentRate,
            scheduleMode: values.scheduleMode,
            ...(values.scheduleMode === 'fixed-weekdays'
              ? {
                  fixedStartTime: values.fixedStartTime || undefined,
                  fixedEndTime: values.fixedEndTime || undefined,
                }
              : {}),
          },
        ]);
        return true;
      }

      if (serverPlannerStatus !== 'ready') {
        void showMessage('График ещё не синхронизирован с сервером.');
        return false;
      }

      try {
        setIsCreatingEmployee(true);
        await createPlannerEmployee({
          displayName: values.displayName,
          departmentId: values.departmentId,
          employmentRate: values.employmentRate,
          scheduleMode:
            values.scheduleMode === 'fixed-weekdays'
              ? 'FIXED_WEEKDAYS'
              : 'FLEXIBLE',
          ...(values.scheduleMode === 'fixed-weekdays'
            ? {
                fixedStartTime: values.fixedStartTime || null,
                fixedEndTime: values.fixedEndTime || null,
              }
            : {
                fixedStartTime: null,
                fixedEndTime: null,
              }),
        });
        await refreshServerPlanner();
        return true;
      } catch (error) {
        console.error('Server employee create failed', error);
        void showMessage(
          error instanceof Error
            ? 'Не удалось добавить сотрудника: ' + error.message
            : 'Не удалось добавить сотрудника на сервере.'
        );
        await refreshServerPlanner();
        return false;
      } finally {
        setIsCreatingEmployee(false);
      }
    },
    [
      isCreatingEmployee,
      refreshServerPlanner,
      serverPlannerStatus,
      serverPlannerWriteEnabled,
      setEmployees,
    ]
  );

  const changeEmployeeRate = useCallback(
    (employeeId: string, employmentRate: EmploymentRate) => {
      if (!serverPlannerWriteEnabled) {
        setEmployees((prev) =>
          prev.map((employee) =>
            employee.id === employeeId
              ? { ...employee, employmentRate }
              : employee
          )
        );
        return;
      }

      if (
        serverPlannerStatus !== 'ready' ||
        updatingEmployeeRateId !== null
      ) {
        void showMessage('График ещё не готов к изменению ставки.');
        return;
      }

      const metadata = serverEmployeeMetadata[employeeId];
      if (!metadata) {
        void showMessage('Не удалось определить версию сотрудника. Обновляю данные.');
        void refreshServerPlanner();
        return;
      }

      setUpdatingEmployeeRateId(employeeId);
      void updatePlannerEmployee(employeeId, {
        employmentRate,
        expectedUpdatedAt: metadata.updatedAt,
      })
        .then(() => refreshServerPlanner())
        .catch((error) => {
          console.error('Server employee rate update failed', error);
          void showMessage(
            error instanceof Error
              ? 'Не удалось изменить ставку: ' + error.message
              : 'Не удалось изменить ставку сотрудника на сервере.'
          );
          void refreshServerPlanner();
        })
        .finally(() => {
          setUpdatingEmployeeRateId(null);
        });
    },
    [
      refreshServerPlanner,
      serverEmployeeMetadata,
      serverPlannerStatus,
      serverPlannerWriteEnabled,
      setEmployees,
      updatingEmployeeRateId,
    ]
  );

  const updateEmployee = useCallback(
    async (
      employeeId: string,
      values: EmployeeManagementValues
    ): Promise<'success' | 'failed' | 'blocked'> => {
      if (mutatingEmployeeId !== null) return 'blocked';

      if (!serverPlannerWriteEnabled) {
        setEmployees((prev) =>
          prev.map((employee) =>
            employee.id === employeeId
              ? {
                  ...employee,
                  name: values.displayName,
                  departmentId: values.departmentId,
                  employmentRate: values.employmentRate,
                  scheduleMode: values.scheduleMode,
                  ...(values.scheduleMode === 'fixed-weekdays'
                    ? {
                        fixedStartTime: values.fixedStartTime || undefined,
                        fixedEndTime: values.fixedEndTime || undefined,
                      }
                    : {
                        fixedStartTime: undefined,
                        fixedEndTime: undefined,
                      }),
                }
              : employee
          )
        );
        return 'success';
      }

      if (serverPlannerStatus !== 'ready') {
        void showMessage('График ещё не готов к редактированию сотрудника.');
        return 'blocked';
      }

      const metadata = serverEmployeeMetadata[employeeId];
      if (!metadata) {
        void showMessage('Не удалось определить версию сотрудника. Обновляю данные.');
        void refreshServerPlanner();
        return 'failed';
      }

      try {
        setMutatingEmployeeId(employeeId);
        await updatePlannerEmployee(employeeId, {
          displayName: values.displayName,
          departmentId: values.departmentId,
          employmentRate: values.employmentRate,
          scheduleMode:
            values.scheduleMode === 'fixed-weekdays'
              ? 'FIXED_WEEKDAYS'
              : 'FLEXIBLE',
          fixedStartTime: values.fixedStartTime || null,
          fixedEndTime: values.fixedEndTime || null,
          expectedUpdatedAt: metadata.updatedAt,
        });
        await refreshServerPlanner();
        return 'success';
      } catch (error) {
        console.error('Server employee edit failed', error);
        void showMessage(
          error instanceof Error
            ? 'Не удалось изменить сотрудника: ' + error.message
            : 'Не удалось изменить сотрудника на сервере.'
        );
        void refreshServerPlanner();
        return 'failed';
      } finally {
        setMutatingEmployeeId(null);
      }
    },
    [
      mutatingEmployeeId,
      refreshServerPlanner,
      serverEmployeeMetadata,
      serverPlannerStatus,
      serverPlannerWriteEnabled,
      setEmployees,
    ]
  );

  const deactivateEmployee = useCallback(
    async (employeeId: string): Promise<'success' | 'failed' | 'blocked'> => {
      if (!serverPlannerWriteEnabled) {
        setEmployees((prev) =>
          prev.filter((employee) => employee.id !== employeeId)
        );
        setSchedules((prev) => {
          const next: SchedulePeriodsData = {};
          Object.entries(prev).forEach(([key, periodSchedule]) => {
            const periodNext = { ...periodSchedule };
            delete periodNext[employeeId];
            next[key] = periodNext;
          });
          return next;
        });
        setWishes((prev) => {
          const next = { ...prev };
          delete next[employeeId];
          return next;
        });
        return 'success';
      }

      if (
        serverPlannerStatus !== 'ready' ||
        mutatingEmployeeId !== null
      ) {
        void showMessage('График ещё не готов к деактивации сотрудника.');
        return 'blocked';
      }

      const metadata = serverEmployeeMetadata[employeeId];
      if (!metadata) {
        void showMessage('Не удалось определить версию сотрудника. Обновляю данные.');
        void refreshServerPlanner();
        return 'failed';
      }

      try {
        setMutatingEmployeeId(employeeId);
        await deactivatePlannerEmployee(employeeId, metadata.updatedAt);
        await refreshServerPlanner();
        return 'success';
      } catch (error) {
        console.error('Server employee deactivate failed', error);
        void showMessage(
          error instanceof Error
            ? 'Не удалось деактивировать сотрудника: ' + error.message
            : 'Не удалось деактивировать сотрудника на сервере.'
        );
        void refreshServerPlanner();
        return 'failed';
      } finally {
        setMutatingEmployeeId(null);
      }
    },
    [
      mutatingEmployeeId,
      refreshServerPlanner,
      serverEmployeeMetadata,
      serverPlannerStatus,
      serverPlannerWriteEnabled,
      setEmployees,
      setSchedules,
      setWishes,
    ]
  );

  return {
    createEmployee,
    changeEmployeeRate,
    updateEmployee,
    deactivateEmployee,
    isCreatingEmployee,
    updatingEmployeeRateId,
    mutatingEmployeeId,
  };
}
