import {
  Dispatch,
  SetStateAction,
  useCallback,
  useState,
} from 'react';

import {
  createPlannerWish,
  deletePlannerWish,
} from '../plannerApi';
import {
  EmployeeWish,
  EmployeeWishesData,
} from '../types';
import { PlannerServerStatus } from './usePlannerServerSync';

interface UsePlannerWishesOptions {
  wishes: EmployeeWishesData;
  setWishes: Dispatch<SetStateAction<EmployeeWishesData>>;
  periodKey: string;
  year: number;
  month: number;
  serverPlannerWriteEnabled: boolean;
  serverPlannerStatus: PlannerServerStatus;
  refreshServerPlanner: () => Promise<void>;
}

function generateLocalWishId(): string {
  return Math.random().toString(36).slice(2, 11);
}

export function usePlannerWishes({
  setWishes,
  periodKey,
  year,
  month,
  serverPlannerWriteEnabled,
  serverPlannerStatus,
  refreshServerPlanner,
}: UsePlannerWishesOptions) {
  const [mutatingWishId, setMutatingWishId] = useState<string | null>(null);

  const addWish = useCallback(
    (employeeId: string, wish: Omit<EmployeeWish, 'id'>) => {
      if (!serverPlannerWriteEnabled) {
        setWishes((prev) => ({
          ...prev,
          [employeeId]: {
            ...(prev[employeeId] || {}),
            [periodKey]: [
              ...(prev[employeeId]?.[periodKey] || []),
              { ...wish, id: generateLocalWishId() },
            ],
          },
        }));
        return;
      }

      if (serverPlannerStatus !== 'ready' || mutatingWishId !== null) {
        alert('График ещё не готов к изменению пожеланий.');
        return;
      }

      setMutatingWishId('create:' + employeeId);
      void createPlannerWish({
        employeeId,
        year,
        month: month + 1,
        day: wish.day,
        text: wish.text,
      })
        .then(() => refreshServerPlanner())
        .catch((error) => {
          console.error('Server wish create failed', error);
          alert(
            error instanceof Error
              ? 'Не удалось добавить пожелание: ' + error.message
              : 'Не удалось добавить пожелание на сервере.'
          );
          void refreshServerPlanner();
        })
        .finally(() => {
          setMutatingWishId(null);
        });
    },
    [
      month,
      mutatingWishId,
      periodKey,
      refreshServerPlanner,
      serverPlannerStatus,
      serverPlannerWriteEnabled,
      setWishes,
      year,
    ]
  );

  const removeWish = useCallback(
    (employeeId: string, wishId: string) => {
      if (!serverPlannerWriteEnabled) {
        setWishes((prev) => ({
          ...prev,
          [employeeId]: {
            ...(prev[employeeId] || {}),
            [periodKey]: (prev[employeeId]?.[periodKey] || []).filter(
              (wish) => wish.id !== wishId
            ),
          },
        }));
        return;
      }

      if (serverPlannerStatus !== 'ready' || mutatingWishId !== null) {
        alert('График ещё не готов к изменению пожеланий.');
        return;
      }

      setMutatingWishId(wishId);
      void deletePlannerWish(wishId)
        .then(() => refreshServerPlanner())
        .catch((error) => {
          console.error('Server wish delete failed', error);
          alert(
            error instanceof Error
              ? 'Не удалось удалить пожелание: ' + error.message
              : 'Не удалось удалить пожелание на сервере.'
          );
          void refreshServerPlanner();
        })
        .finally(() => {
          setMutatingWishId(null);
        });
    },
    [
      mutatingWishId,
      periodKey,
      refreshServerPlanner,
      serverPlannerStatus,
      serverPlannerWriteEnabled,
      setWishes,
    ]
  );

  return {
    addWish,
    removeWish,
    mutatingWishId,
  };
}
