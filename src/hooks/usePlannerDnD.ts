import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';

import {
  buildDepartmentReorderInput,
  buildEmployeeMoveInput,
  buildEmployeeReorderInput,
  PlannerDepartmentMetadataMap,
  PlannerEmployeeMetadataMap,
  reorderPlannerDepartments,
  reorderPlannerEmployees,
  updatePlannerEmployee,
} from '../api/planner';
import { Department, Employee } from '../domain/models';
import { PlannerServerStatus } from './usePlannerServerSync';

interface UsePlannerDnDOptions {
  employees: Employee[];
  departments: Department[];
  setEmployees: Dispatch<SetStateAction<Employee[]>>;
  setDepartments: Dispatch<SetStateAction<Department[]>>;
  serverPlannerReadEnabled: boolean;
  serverPlannerWriteEnabled: boolean;
  serverPlannerStatus: PlannerServerStatus;
  serverEmployeeMetadata: PlannerEmployeeMetadataMap;
  serverDepartmentMetadata: PlannerDepartmentMetadataMap;
  isSuperAdmin: boolean;
  refreshServerPlanner: () => Promise<void>;
}

export function usePlannerDnD({
  employees,
  departments,
  setEmployees,
  setDepartments,
  serverPlannerReadEnabled,
  serverPlannerWriteEnabled,
  serverPlannerStatus,
  serverEmployeeMetadata,
  serverDepartmentMetadata,
  isSuperAdmin,
  refreshServerPlanner,
}: UsePlannerDnDOptions) {
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dragTargetDepartmentId, setDragTargetDepartmentId] =
    useState<string | null>(null);
  const [movingEmployeeId, setMovingEmployeeId] =
    useState<string | null>(null);
  const [movingDepartmentId, setMovingDepartmentId] =
    useState<string | null>(null);

  useEffect(() => {
    if (serverPlannerReadEnabled) return;

    setActiveDragId(null);
    setDragTargetDepartmentId(null);
    setMovingEmployeeId(null);
    setMovingDepartmentId(null);
  }, [serverPlannerReadEnabled]);

  const resolveTargetDepartmentId = useCallback(
    (overRaw: string): string | null => {
      if (overRaw.startsWith('dep:')) return overRaw.slice(4);
      if (overRaw.startsWith('dept:')) return overRaw.slice(5);
      if (overRaw.startsWith('emp:')) {
        const overEmployeeId = overRaw.slice(4);
        return (
          employees.find((employee) => employee.id === overEmployeeId)
            ?.departmentId || null
        );
      }
      return null;
    },
    [employees]
  );

  const clearDragState = useCallback(() => {
    setActiveDragId(null);
    setDragTargetDepartmentId(null);
  }, []);

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    setActiveDragId(String(active.id));
    setDragTargetDepartmentId(null);
  }, []);

  const handleDragOver = useCallback(
    ({ active, over }: DragOverEvent) => {
      const activeRaw = String(active.id);
      if (!over || !activeRaw.startsWith('emp:')) {
        setDragTargetDepartmentId(null);
        return;
      }

      setDragTargetDepartmentId(
        resolveTargetDepartmentId(String(over.id))
      );
    },
    [resolveTargetDepartmentId]
  );

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      clearDragState();
      if (!over) return;

      const activeRaw = String(active.id);
      const overRaw = String(over.id);

      if (activeRaw.startsWith('dept:')) {
        const activeDepartmentId = activeRaw.slice(5);
        const overEmployeeId = overRaw.startsWith('emp:')
          ? overRaw.slice(4)
          : null;
        const targetDepartmentId = overRaw.startsWith('dept:')
          ? overRaw.slice(5)
          : overRaw.startsWith('dep:')
            ? overRaw.slice(4)
            : overEmployeeId
              ? employees.find(
                  (employee) => employee.id === overEmployeeId
                )?.departmentId
              : undefined;

        if (
          !targetDepartmentId ||
          targetDepartmentId === activeDepartmentId
        ) {
          return;
        }

        const oldIndex = departments.findIndex(
          (department) => department.id === activeDepartmentId
        );
        const newIndex = departments.findIndex(
          (department) => department.id === targetDepartmentId
        );

        if (oldIndex === -1 || newIndex === -1) return;

        if (serverPlannerWriteEnabled) {
          if (
            !isSuperAdmin ||
            serverPlannerStatus !== 'ready' ||
            movingDepartmentId !== null
          ) {
            return;
          }

          const orderedDepartmentIds = arrayMove(
            departments.map((department) => department.id),
            oldIndex,
            newIndex
          );

          let reorderInput;
          try {
            reorderInput = buildDepartmentReorderInput(
              orderedDepartmentIds,
              serverDepartmentMetadata
            );
          } catch (error) {
            alert(
              error instanceof Error
                ? error.message
                : 'Не удалось подготовить новый порядок отделов.'
            );
            void refreshServerPlanner();
            return;
          }

          setMovingDepartmentId(activeDepartmentId);
          void reorderPlannerDepartments(reorderInput)
            .then(() => refreshServerPlanner())
            .catch((error) => {
              console.error('Server department reorder failed', error);
              alert(
                error instanceof Error
                  ? 'Не удалось изменить порядок отделов: ' + error.message
                  : 'Не удалось изменить порядок отделов на сервере.'
              );
              void refreshServerPlanner();
            })
            .finally(() => {
              setMovingDepartmentId(null);
            });
          return;
        }

        setDepartments((prev) => arrayMove(prev, oldIndex, newIndex));
        return;
      }

      if (!activeRaw.startsWith('emp:')) return;

      const activeEmployeeId = activeRaw.slice(4);
      const overEmployeeId = overRaw.startsWith('emp:')
        ? overRaw.slice(4)
        : null;
      const targetDepartmentId = overRaw.startsWith('dep:')
        ? overRaw.slice(4)
        : overRaw.startsWith('dept:')
          ? overRaw.slice(5)
          : overEmployeeId
            ? employees.find(
                (employee) => employee.id === overEmployeeId
              )?.departmentId
            : undefined;

      if (!targetDepartmentId) return;

      const activeEmployee = employees.find(
        (employee) => employee.id === activeEmployeeId
      );
      if (!activeEmployee) return;

      if (serverPlannerWriteEnabled) {
        if (
          serverPlannerStatus !== 'ready' ||
          movingEmployeeId !== null
        ) {
          return;
        }

        setMovingEmployeeId(activeEmployeeId);

        if (activeEmployee.departmentId === targetDepartmentId) {
          if (
            !overEmployeeId ||
            overEmployeeId === activeEmployeeId
          ) {
            setMovingEmployeeId(null);
            return;
          }

          const departmentEmployeeIds = employees
            .filter(
              (employee) =>
                employee.departmentId === targetDepartmentId
            )
            .map((employee) => employee.id);
          const oldIndex =
            departmentEmployeeIds.indexOf(activeEmployeeId);
          const newIndex =
            departmentEmployeeIds.indexOf(overEmployeeId);

          if (
            oldIndex === -1 ||
            newIndex === -1 ||
            oldIndex === newIndex
          ) {
            setMovingEmployeeId(null);
            return;
          }

          const orderedEmployeeIds = arrayMove(
            departmentEmployeeIds,
            oldIndex,
            newIndex
          );

          let reorderInput;
          try {
            reorderInput = buildEmployeeReorderInput(
              targetDepartmentId,
              orderedEmployeeIds,
              serverEmployeeMetadata
            );
          } catch (error) {
            setMovingEmployeeId(null);
            alert(
              error instanceof Error
                ? error.message
                : 'Не удалось подготовить новый порядок сотрудников.'
            );
            void refreshServerPlanner();
            return;
          }

          void reorderPlannerEmployees(reorderInput)
            .then(() => refreshServerPlanner())
            .catch((error) => {
              console.error('Server employee reorder failed', error);
              alert(
                error instanceof Error
                  ? 'Не удалось изменить порядок сотрудников: ' +
                    error.message
                  : 'Не удалось изменить порядок сотрудников на сервере.'
              );
              void refreshServerPlanner();
            })
            .finally(() => {
              setMovingEmployeeId(null);
            });
          return;
        }

        const metadata = serverEmployeeMetadata[activeEmployeeId];
        if (!metadata) {
          setMovingEmployeeId(null);
          alert(
            'Не удалось определить версию сотрудника. Обновляю данные.'
          );
          void refreshServerPlanner();
          return;
        }

        void updatePlannerEmployee(
          activeEmployeeId,
          buildEmployeeMoveInput(targetDepartmentId, metadata)
        )
          .then(() => refreshServerPlanner())
          .catch((error) => {
            console.error('Server employee move failed', error);
            alert(
              error instanceof Error
                ? 'Не удалось переместить сотрудника: ' + error.message
                : 'Не удалось переместить сотрудника на сервере.'
            );
            void refreshServerPlanner();
          })
          .finally(() => {
            setMovingEmployeeId(null);
          });
        return;
      }

      setEmployees((prev) => {
        const sourceIndex = prev.findIndex(
          (employee) => employee.id === activeEmployeeId
        );
        if (sourceIndex === -1) return prev;

        const moved: Employee = {
          ...prev[sourceIndex],
          departmentId: targetDepartmentId,
        };

        const next = prev.filter(
          (employee) => employee.id !== activeEmployeeId
        );

        if (
          overEmployeeId &&
          overEmployeeId !== activeEmployeeId
        ) {
          const overIndex = next.findIndex(
            (employee) => employee.id === overEmployeeId
          );
          if (overIndex >= 0) {
            next.splice(overIndex, 0, moved);
            return next;
          }
        }

        let insertIndex = -1;
        for (let index = next.length - 1; index >= 0; index--) {
          if (next[index].departmentId === targetDepartmentId) {
            insertIndex = index + 1;
            break;
          }
        }

        if (insertIndex === -1) {
          const departmentIndex = departments.findIndex(
            (department) => department.id === targetDepartmentId
          );
          const laterDepartmentIds = new Set(
            departments
              .slice(departmentIndex + 1)
              .map((department) => department.id)
          );

          insertIndex = next.findIndex((employee) =>
            laterDepartmentIds.has(employee.departmentId)
          );

          if (insertIndex === -1) insertIndex = next.length;
        }

        next.splice(insertIndex, 0, moved);
        return next;
      });
    },
    [
      clearDragState,
      departments,
      employees,
      isSuperAdmin,
      movingDepartmentId,
      movingEmployeeId,
      refreshServerPlanner,
      serverDepartmentMetadata,
      serverEmployeeMetadata,
      serverPlannerStatus,
      serverPlannerWriteEnabled,
      setDepartments,
      setEmployees,
    ]
  );

  return {
    activeDragId,
    dragTargetDepartmentId,
    movingEmployeeId,
    movingDepartmentId,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    clearDragState,
  };
}
