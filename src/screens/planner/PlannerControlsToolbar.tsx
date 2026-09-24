import { useState } from 'react';
import { Layers3, SlidersHorizontal, UserPlus } from 'lucide-react';

import {
  EmployeeCreateDrawer,
  EmployeeCreateValues,
} from '../../components/drawers/EmployeeCreateDrawer';
import { PlannerScheduleToolsDrawer } from '../../components/drawers/PlannerScheduleToolsDrawer';
import { Department } from '../../domain/models';
import {
  ActionButton,
  ControlsCard,
  ControlsRow,
} from '../../theme/styles';
import { ScheduleView } from './PlannerScheduleTable';
import { ToolbarActions } from './PlannerControlsToolbar.styles';

interface PrintRange {
  key: string;
  label: string;
}

export type EmployeeCreateFormValues = EmployeeCreateValues;

interface PlannerControlsToolbarProps {
  departments: Department[];
  canCreateEmployee: boolean;
  isCreatingEmployee: boolean;
  onAddEmployee: (values: EmployeeCreateFormValues) => Promise<boolean>;
  canManageDepartments: boolean;
  canViewDepartments: boolean;
  onToggleDepartments: () => void;
  scheduleView: ScheduleView;
  onScheduleViewChange: (view: ScheduleView) => void;
  canImportExcel: boolean;
  isImportingExcel: boolean;
  isApplyingExcelImport: boolean;
  onExcelFile: (file: File | null) => void;
  excelRangeKey: string;
  onExcelRangeChange: (value: string) => void;
  isExportingExcel: boolean;
  onExportExcel: () => void;
  printRangeKey: string;
  onPrintRangeChange: (value: string) => void;
  printCalendarWeekRanges: PrintRange[];
  isPreparingPrint: boolean;
  onPrint: () => void;
  canBulkEditSchedule: boolean;
  canSaveFixedWeekdays: boolean;
  isSavingFixedWeekdays: boolean;
  onSaveFixedWeekdays: () => void;
  isApplyingBulkSchedule: boolean;
  onFillOffAll: () => void;
  onClearAll: () => void;
}

export function PlannerControlsToolbar({
  departments,
  canCreateEmployee,
  isCreatingEmployee,
  onAddEmployee,
  canManageDepartments,
  canViewDepartments,
  onToggleDepartments,
  scheduleView,
  onScheduleViewChange,
  canImportExcel,
  isImportingExcel,
  isApplyingExcelImport,
  onExcelFile,
  excelRangeKey,
  onExcelRangeChange,
  isExportingExcel,
  onExportExcel,
  printRangeKey,
  onPrintRangeChange,
  printCalendarWeekRanges,
  isPreparingPrint,
  onPrint,
  canBulkEditSchedule,
  canSaveFixedWeekdays,
  isSavingFixedWeekdays,
  onSaveFixedWeekdays,
  isApplyingBulkSchedule,
  onFillOffAll,
  onClearAll,
}: PlannerControlsToolbarProps) {
  const [showEmployeeCreate, setShowEmployeeCreate] = useState(false);
  const [showScheduleTools, setShowScheduleTools] = useState(false);

  return (
    <>
      <ControlsCard>
        <ControlsRow>
          <ToolbarActions>
            <ActionButton
              type="button"
              $variant="primary"
              onClick={() => setShowEmployeeCreate(true)}
              disabled={!canCreateEmployee}
            >
              <UserPlus size={16} />
              Новый сотрудник
            </ActionButton>

            <ActionButton
              type="button"
              $variant="accent"
              onClick={onToggleDepartments}
              disabled={!canViewDepartments}
              title={
                canManageDepartments
                  ? 'Управление отделами'
                  : 'Просмотр отделов. Изменение структуры доступно только SUPER_ADMIN'
              }
            >
              <Layers3 size={16} />
              Отделы
            </ActionButton>

            <ActionButton
              type="button"
              onClick={() => setShowScheduleTools(true)}
            >
              <SlidersHorizontal size={16} />
              Управление графиком
            </ActionButton>

            <ActionButton
              type="button"
              $variant={scheduleView === 'schedule' ? 'primary' : 'secondary'}
              onClick={() => onScheduleViewChange('schedule')}
            >
              График
            </ActionButton>

            <ActionButton
              type="button"
              $variant={scheduleView === 'hours' ? 'primary' : 'secondary'}
              onClick={() => onScheduleViewChange('hours')}
            >
              День / ночь
            </ActionButton>
          </ToolbarActions>
        </ControlsRow>
      </ControlsCard>

      {showEmployeeCreate && (
        <EmployeeCreateDrawer
          departments={departments}
          busy={isCreatingEmployee}
          onCreate={onAddEmployee}
          onClose={() => setShowEmployeeCreate(false)}
        />
      )}

      {showScheduleTools && (
        <PlannerScheduleToolsDrawer
          canImportExcel={canImportExcel}
          isImportingExcel={isImportingExcel}
          isApplyingExcelImport={isApplyingExcelImport}
          onExcelFile={onExcelFile}
          excelRangeKey={excelRangeKey}
          onExcelRangeChange={onExcelRangeChange}
          isExportingExcel={isExportingExcel}
          onExportExcel={onExportExcel}
          printRangeKey={printRangeKey}
          onPrintRangeChange={onPrintRangeChange}
          printCalendarWeekRanges={printCalendarWeekRanges}
          isPreparingPrint={isPreparingPrint}
          onPrint={onPrint}
          canBulkEditSchedule={canBulkEditSchedule}
          canSaveFixedWeekdays={canSaveFixedWeekdays}
          isSavingFixedWeekdays={isSavingFixedWeekdays}
          onSaveFixedWeekdays={onSaveFixedWeekdays}
          isApplyingBulkSchedule={isApplyingBulkSchedule}
          onFillOffAll={onFillOffAll}
          onClearAll={onClearAll}
          onClose={() => setShowScheduleTools(false)}
        />
      )}
    </>
  );
}
