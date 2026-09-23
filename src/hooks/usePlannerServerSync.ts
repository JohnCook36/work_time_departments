import { useCallback, useEffect, useRef, useState } from 'react';

import {
  loadPlannerServerSnapshot,
  PlannerCellMetadataMap,
  PlannerDepartmentMetadataMap,
  PlannerEmployeeMetadataMap,
  PlannerServerSnapshot,
} from '../api/planner';

export type PlannerServerStatus =
  | 'disabled'
  | 'loading'
  | 'ready'
  | 'error';

interface UsePlannerServerSyncOptions {
  enabled: boolean;
  year: number;
  month: number;
  onSnapshot: (snapshot: PlannerServerSnapshot) => void;
}

export function usePlannerServerSync({
  enabled,
  year,
  month,
  onSnapshot,
}: UsePlannerServerSyncOptions) {
  const [status, setStatus] = useState<PlannerServerStatus>(
    enabled ? 'loading' : 'disabled'
  );
  const [error, setError] = useState<string | null>(null);
  const [cellMetadata, setCellMetadata] =
    useState<PlannerCellMetadataMap>({});
  const [employeeMetadata, setEmployeeMetadata] =
    useState<PlannerEmployeeMetadataMap>({});
  const [departmentMetadata, setDepartmentMetadata] =
    useState<PlannerDepartmentMetadataMap>({});
  const loadVersion = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;

    const currentVersion = ++loadVersion.current;
    setStatus('loading');
    setError(null);

    try {
      const snapshot = await loadPlannerServerSnapshot(year, month + 1);
      if (currentVersion !== loadVersion.current) return;

      onSnapshot(snapshot);
      setCellMetadata(snapshot.cellMetadata);
      setEmployeeMetadata(snapshot.employeeMetadata);
      setDepartmentMetadata(snapshot.departmentMetadata);
      setStatus('ready');
    } catch (loadError) {
      if (currentVersion !== loadVersion.current) return;

      console.error('Server planner load failed', loadError);
      setStatus('error');
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Не удалось загрузить график с сервера.'
      );
    }
  }, [enabled, month, onSnapshot, year]);

  useEffect(() => {
    if (!enabled) {
      loadVersion.current++;
      setStatus('disabled');
      setError(null);
      setCellMetadata({});
      setEmployeeMetadata({});
      setDepartmentMetadata({});
      return;
    }

    void refresh();

    return () => {
      loadVersion.current++;
    };
  }, [enabled, refresh]);

  return {
    status,
    error,
    cellMetadata,
    employeeMetadata,
    departmentMetadata,
    refresh,
  };
}
