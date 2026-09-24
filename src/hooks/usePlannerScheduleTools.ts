import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { ExcelImportPreview, parseScheduleExcel } from '../services/excel/importExcel';
import { applyExcelImportEntries, resolveApplicableExcelImportEntries } from '../domain/schedule/excelImport';
import { exportScheduleToExcel } from '../services/excel/exportExcel';
import {
  getRequiredPrintPeriods,
  printSchedule,
} from '../services/print/printSchedule';
import {
  applyPlannerScheduleChanges,
  buildScheduleCellChange,
  loadPlannerServerSnapshot,
  PlannerCellMetadataMap,
} from '../api/planner';
import { buildEffectiveSchedulePeriods } from '../domain/schedule/employeeSchedule';
import {
  Department,
  Employee,
  ScheduleData,
  SchedulePeriodsData,
} from '../domain/models';
import { validateShiftInput } from '../domain/schedule/shiftHours';
import { useAppDialog } from '../components/dialogs/AppDialogProvider';

interface UsePlannerScheduleToolsOptions {
  departments: Department[];
  employees: Employee[];
  schedule: ScheduleData;
  schedules: SchedulePeriodsData;
  rawSchedule: ScheduleData;
  year: number;
  month: number;
  daysInMonth: number;
  periodKey: string;
  serverPlannerReadEnabled: boolean;
  serverPlannerWriteEnabled: boolean;
  serverCellMetadata: PlannerCellMetadataMap;
  updateCurrentSchedule: (
    updater: (current: ScheduleData) => ScheduleData
  ) => void;
  refreshServerPlanner: () => Promise<void>;
}

export function usePlannerScheduleTools({
  departments,
  employees,
  schedule,
  schedules,
  rawSchedule,
  year,
  month,
  daysInMonth,
  periodKey,
  serverPlannerReadEnabled,
  serverPlannerWriteEnabled,
  serverCellMetadata,
  updateCurrentSchedule,
  refreshServerPlanner,
}: UsePlannerScheduleToolsOptions) {
  const { showMessage } = useAppDialog();
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const [isApplyingExcelImport, setIsApplyingExcelImport] = useState(false);
  const [excelImportPreview, setExcelImportPreview] =
    useState<ExcelImportPreview | null>(null);
  const [overwriteExcelCells, setOverwriteExcelCells] = useState(false);
  const [excelRangeKey, setExcelRangeKey] = useState('month');
  const [printRangeKey, setPrintRangeKey] = useState('month');
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);

  useEffect(() => {
    setPrintRangeKey('month');
    setExcelRangeKey('month');
  }, [year, month]);

  const handleExportExcel = useCallback(async () => {
    if (isExportingExcel) return;

    try {
      setIsExportingExcel(true);
      let exportPeriods: SchedulePeriodsData = {};
      if (excelRangeKey !== 'month') {
        // In server mode only fetched snapshots are authoritative for adjacent months.
        const sourcePeriods: SchedulePeriodsData = serverPlannerReadEnabled
          ? { [periodKey]: rawSchedule }
          : { ...schedules, [periodKey]: rawSchedule };
        if (serverPlannerReadEnabled) {
          const adjacentPeriods = getRequiredPrintPeriods(year, month, excelRangeKey)
            .filter((period) => period.year !== year || period.month !== month);
          const snapshots = await Promise.all(adjacentPeriods.map(async (period) => ({
            period,
            snapshot: await loadPlannerServerSnapshot(period.year, period.month + 1),
          })));
          snapshots.forEach(({ period, snapshot }) => {
            sourcePeriods[period.year + '-' + String(period.month + 1).padStart(2, '0')] = snapshot.schedule;
          });
        }
        exportPeriods = buildEffectiveSchedulePeriods(employees, sourcePeriods, year, month);
      }
      await exportScheduleToExcel({
        departments,
        employees,
        schedule,
        year,
        month,
        daysInMonth,
        rangeKey: excelRangeKey,
        schedules: exportPeriods,
      });
    } catch (error) {
      console.error('Excel export failed', error);
      await showMessage('Не удалось сформировать Excel-файл.');
    } finally {
      setIsExportingExcel(false);
    }
  }, [
    daysInMonth,
    departments,
    employees,
    isExportingExcel,
    excelRangeKey,
    periodKey,
    rawSchedule,
    schedules,
    serverPlannerReadEnabled,
    showMessage,
    month,
    schedule,
    year,
  ]);

  const handlePrintSchedule = useCallback(async () => {
    if (isPreparingPrint) return;

    let printPeriods = buildEffectiveSchedulePeriods(
      employees,
      schedules,
      year,
      month
    );

    if (serverPlannerReadEnabled) {
      try {
        setIsPreparingPrint(true);

        const requiredPeriods = getRequiredPrintPeriods(
          year,
          month,
          printRangeKey
        );
        const adjacentPeriods = requiredPeriods.filter(
          (period) => period.year !== year || period.month !== month
        );

        const adjacentSnapshots = await Promise.all(
          adjacentPeriods.map(async (period) => ({
            period,
            snapshot: await loadPlannerServerSnapshot(
              period.year,
              period.month + 1
            ),
          }))
        );

        const serverSchedules = {
          ...schedules,
          [periodKey]: rawSchedule,
        };

        adjacentSnapshots.forEach(({ period, snapshot }) => {
          const key =
            period.year +
            '-' +
            String(period.month + 1).padStart(2, '0');
          serverSchedules[key] = snapshot.schedule;
        });

        printPeriods = buildEffectiveSchedulePeriods(
          employees,
          serverSchedules,
          year,
          month
        );
      } catch (error) {
        console.error('Server print period preload failed', error);
        await showMessage(
          'Не удалось загрузить соседние месяцы для печати. Попробуйте ещё раз.'
        );
        return;
      } finally {
        setIsPreparingPrint(false);
      }
    }

    const printResult = printSchedule({
      departments,
      employees,
      schedule,
      schedules: printPeriods,
      year,
      month,
      daysInMonth,
      rangeKey: printRangeKey,
    });

    if (printResult === 'blocked') {
      await showMessage(
        'Браузер заблокировал окно печати. Разрешите всплывающие окна для сайта.',
        { title: 'Печать' },
      );
    }
  }, [
    daysInMonth,
    departments,
    employees,
    isPreparingPrint,
    month,
    periodKey,
    printRangeKey,
    rawSchedule,
    schedule,
    schedules,
    serverPlannerReadEnabled,
    year,
  ]);

  const handleExcelFile = useCallback(
    async (file: File | null) => {
      if (!file || isImportingExcel) return;

      try {
        setIsImportingExcel(true);
        const preview = await parseScheduleExcel(file, employees);
        setOverwriteExcelCells(false);
        setExcelImportPreview(preview);
      } catch (error) {
        console.error('Excel import failed', error);
        await showMessage(
          error instanceof Error
            ? error.message
            : 'Не удалось прочитать Excel-файл.'
        );
      } finally {
        setIsImportingExcel(false);
      }
    },
    [employees, isImportingExcel]
  );

  const excelImportConflictCount = useMemo(() => {
    if (!excelImportPreview) return 0;

    return excelImportPreview.entries.reduce((count, item) => {
      if (!item.employeeId || item.day > daysInMonth) return count;
      const existing = schedule[item.employeeId]?.[item.day];
      return existing && existing.type !== 'empty' ? count + 1 : count;
    }, 0);
  }, [daysInMonth, excelImportPreview, schedule]);

  const applyExcelImport = useCallback(async () => {
    if (!excelImportPreview || isApplyingExcelImport) return;

    const options = {
      currentSchedule: rawSchedule,
      protectedSchedule: schedule,
      entries: excelImportPreview.entries,
      daysInMonth,
      overwriteExisting: overwriteExcelCells,
    };

    const result = applyExcelImportEntries(options);

    const details = [
      'Импортировано смен: ' + result.applied,
      result.skippedProtected > 0
        ? 'Защищено заполненных ячеек: ' + result.skippedProtected
        : null,
      result.skippedOutsideMonth > 0
        ? 'Пропущено дней вне текущего месяца: ' + result.skippedOutsideMonth
        : null,
    ].filter(Boolean);

    if (!serverPlannerWriteEnabled) {
      updateCurrentSchedule(() => result.schedule);
      setExcelImportPreview(null);
      setOverwriteExcelCells(false);
      await showMessage(details.join('\n'));
      return;
    }

    const resolved = resolveApplicableExcelImportEntries(options);

    if (resolved.entries.length === 0) {
      setExcelImportPreview(null);
      setOverwriteExcelCells(false);
      await showMessage(details.join('\n'));
      return;
    }

    let changes: ReturnType<typeof buildScheduleCellChange>[];
    try {
      changes = resolved.entries.map((item) => {
        if (!item.employeeId) {
          throw new Error('Excel import contains an unresolved Employee');
        }

        const entry = validateShiftInput(item.value);
        if (entry.type !== 'shift' && entry.type !== 'off') {
          throw new Error(
            'Excel import contains a schedule value that cannot be persisted'
          );
        }

        return buildScheduleCellChange(
          item.employeeId,
          item.day,
          entry,
          serverCellMetadata[item.employeeId]?.[item.day]
        );
      });
    } catch (error) {
      await showMessage(
        error instanceof Error
          ? 'Не удалось подготовить импорт: ' + error.message
          : 'Не удалось подготовить импорт для сервера.'
      );
      await refreshServerPlanner();
      return;
    }

    try {
      setIsApplyingExcelImport(true);
      await applyPlannerScheduleChanges(
        year,
        month + 1,
        changes
      );
      setExcelImportPreview(null);
      setOverwriteExcelCells(false);
      await refreshServerPlanner();
      await showMessage(details.join('\n'));
    } catch (error) {
      console.error('Server Excel import failed', error);
      await showMessage(
        error instanceof Error
          ? 'Не удалось применить импорт: ' + error.message
          : 'Не удалось применить импорт на сервере.'
      );
      await refreshServerPlanner();
    } finally {
      setIsApplyingExcelImport(false);
    }
  }, [
    daysInMonth,
    excelImportPreview,
    isApplyingExcelImport,
    month,
    overwriteExcelCells,
    rawSchedule,
    refreshServerPlanner,
    schedule,
    serverCellMetadata,
    serverPlannerWriteEnabled,
    updateCurrentSchedule,
    year,
  ]);

  const closeExcelImport = useCallback(() => {
    setExcelImportPreview(null);
    setOverwriteExcelCells(false);
  }, []);

  return {
    excelRangeKey,
    setExcelRangeKey,
    isExportingExcel,
    isImportingExcel,
    isApplyingExcelImport,
    excelImportPreview,
    overwriteExcelCells,
    setOverwriteExcelCells,
    printRangeKey,
    setPrintRangeKey,
    isPreparingPrint,
    handleExportExcel,
    handlePrintSchedule,
    handleExcelFile,
    excelImportConflictCount,
    applyExcelImport,
    closeExcelImport,
  };
}
