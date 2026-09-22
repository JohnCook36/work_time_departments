import { Dispatch, SetStateAction, useCallback, useState } from 'react';

import {
  createPlannerDepartment,
  deactivatePlannerDepartment,
  PlannerDepartmentMetadataMap,
  updatePlannerDepartment,
} from '../plannerApi';
import { Department, DepartmentKind } from '../types';

interface DepartmentCreateValues {
  name: string;
  kind: DepartmentKind;
}

interface UseDepartmentManagementOptions {
  serverPlannerWriteEnabled: boolean;
  canManageDepartments: boolean;
  serverDepartmentMetadata: PlannerDepartmentMetadataMap;
  setDepartments: Dispatch<SetStateAction<Department[]>>;
  refreshServerPlanner: () => Promise<void>;
}

type DepartmentMutationResult = 'success' | 'failed' | 'blocked';

function generateLocalId(): string {
  return Math.random().toString(36).slice(2, 11);
}

export function useDepartmentManagement({
  serverPlannerWriteEnabled,
  canManageDepartments,
  serverDepartmentMetadata,
  setDepartments,
  refreshServerPlanner,
}: UseDepartmentManagementOptions) {
  const [mutatingDepartmentId, setMutatingDepartmentId] =
    useState<string | null>(null);

  const createDepartment = useCallback(
    async (values: DepartmentCreateValues): Promise<string | null> => {
      if (mutatingDepartmentId !== null) return null;

      if (!serverPlannerWriteEnabled) {
        const department: Department = {
          id: generateLocalId(),
          name: values.name,
          kind: values.kind,
        };
        setDepartments((prev) => [...prev, department]);
        return department.id;
      }

      if (!canManageDepartments) {
        alert('Управление отделами сейчас недоступно.');
        return null;
      }

      try {
        setMutatingDepartmentId('create');
        const created = await createPlannerDepartment(values);
        await refreshServerPlanner();
        return created.id;
      } catch (error) {
        console.error('Server department create failed', error);
        alert(
          error instanceof Error
            ? 'Не удалось создать отдел: ' + error.message
            : 'Не удалось создать отдел на сервере.'
        );
        await refreshServerPlanner();
        return null;
      } finally {
        setMutatingDepartmentId(null);
      }
    },
    [
      canManageDepartments,
      mutatingDepartmentId,
      refreshServerPlanner,
      serverPlannerWriteEnabled,
      setDepartments,
    ]
  );

  const renameDepartment = useCallback(
    async (
      departmentId: string,
      name: string
    ): Promise<DepartmentMutationResult> => {
      if (mutatingDepartmentId !== null) return 'blocked';

      if (!serverPlannerWriteEnabled) {
        setDepartments((prev) =>
          prev.map((department) =>
            department.id === departmentId ? { ...department, name } : department
          )
        );
        return 'success';
      }

      if (!canManageDepartments) {
        alert('Управление отделами сейчас недоступно.');
        return 'blocked';
      }

      const metadata = serverDepartmentMetadata[departmentId];
      if (!metadata) {
        alert('Не удалось определить версию отдела. Обновляю данные.');
        void refreshServerPlanner();
        return 'failed';
      }

      try {
        setMutatingDepartmentId(departmentId);
        await updatePlannerDepartment(departmentId, {
          name,
          expectedUpdatedAt: metadata.updatedAt,
        });
        await refreshServerPlanner();
        return 'success';
      } catch (error) {
        console.error('Server department rename failed', error);
        alert(
          error instanceof Error
            ? 'Не удалось переименовать отдел: ' + error.message
            : 'Не удалось переименовать отдел на сервере.'
        );
        void refreshServerPlanner();
        return 'failed';
      } finally {
        setMutatingDepartmentId(null);
      }
    },
    [
      canManageDepartments,
      mutatingDepartmentId,
      refreshServerPlanner,
      serverDepartmentMetadata,
      serverPlannerWriteEnabled,
      setDepartments,
    ]
  );

  const changeDepartmentKind = useCallback(
    async (
      departmentId: string,
      kind: DepartmentKind
    ): Promise<DepartmentMutationResult> => {
      if (mutatingDepartmentId !== null) return 'blocked';

      if (!serverPlannerWriteEnabled) {
        setDepartments((prev) =>
          prev.map((department) =>
            department.id === departmentId ? { ...department, kind } : department
          )
        );
        return 'success';
      }

      if (!canManageDepartments) {
        alert('Управление отделами сейчас недоступно.');
        return 'blocked';
      }

      const metadata = serverDepartmentMetadata[departmentId];
      if (!metadata) {
        alert('Не удалось определить версию отдела. Обновляю данные.');
        void refreshServerPlanner();
        return 'failed';
      }

      try {
        setMutatingDepartmentId(departmentId);
        await updatePlannerDepartment(departmentId, {
          kind,
          expectedUpdatedAt: metadata.updatedAt,
        });
        await refreshServerPlanner();
        return 'success';
      } catch (error) {
        console.error('Server department kind update failed', error);
        alert(
          error instanceof Error
            ? 'Не удалось изменить тип отдела: ' + error.message
            : 'Не удалось изменить тип отдела на сервере.'
        );
        void refreshServerPlanner();
        return 'failed';
      } finally {
        setMutatingDepartmentId(null);
      }
    },
    [
      canManageDepartments,
      mutatingDepartmentId,
      refreshServerPlanner,
      serverDepartmentMetadata,
      serverPlannerWriteEnabled,
      setDepartments,
    ]
  );

  const deactivateDepartment = useCallback(
    async (departmentId: string): Promise<DepartmentMutationResult> => {
      if (mutatingDepartmentId !== null) return 'blocked';

      if (!serverPlannerWriteEnabled) {
        setDepartments((prev) =>
          prev.filter((department) => department.id !== departmentId)
        );
        return 'success';
      }

      if (!canManageDepartments) {
        alert('Управление отделами сейчас недоступно.');
        return 'blocked';
      }

      const metadata = serverDepartmentMetadata[departmentId];
      if (!metadata) {
        alert('Не удалось определить версию отдела. Обновляю данные.');
        void refreshServerPlanner();
        return 'failed';
      }

      try {
        setMutatingDepartmentId(departmentId);
        await deactivatePlannerDepartment(departmentId, metadata.updatedAt);
        await refreshServerPlanner();
        return 'success';
      } catch (error) {
        console.error('Server department deactivate failed', error);
        alert(
          error instanceof Error
            ? 'Не удалось деактивировать отдел: ' + error.message
            : 'Не удалось деактивировать отдел на сервере.'
        );
        void refreshServerPlanner();
        return 'failed';
      } finally {
        setMutatingDepartmentId(null);
      }
    },
    [
      canManageDepartments,
      mutatingDepartmentId,
      refreshServerPlanner,
      serverDepartmentMetadata,
      serverPlannerWriteEnabled,
      setDepartments,
    ]
  );

  return {
    createDepartment,
    renameDepartment,
    changeDepartmentKind,
    deactivateDepartment,
    mutatingDepartmentId,
  };
}
