import { useRef } from 'react';
import {
  FileSpreadsheet,
  FileUp,
  Layers3,
  Plus,
  Printer,
  Trash2,
} from 'lucide-react';

import { Department, EmployeeScheduleMode } from '../../domain/models';
import {
  ActionButton,
  ControlsCard,
  ControlsRow,
  Divider,
  Select,
  TextInput,
} from '../../theme/styles';
import { ScheduleView } from './PlannerScheduleTable';
import {
  FixedTimeInput,
  HiddenFileInput,
  PrintRangeSelect,
} from './PlannerControlsToolbar.styles';

interface PrintRange {
  key: string;
  label: string;
}

interface PlannerControlsToolbarProps {
  newEmployeeName: string;
  onNewEmployeeNameChange: (value: string) => void;
  newEmployeeDepartmentId: string;
  onNewEmployeeDepartmentChange: (value: string) => void;
  newEmployeeScheduleMode: EmployeeScheduleMode;
  onNewEmployeeScheduleModeChange: (value: EmployeeScheduleMode) => void;
  newEmployeeFixedStartTime: string;
  onNewEmployeeFixedStartTimeChange: (value: string) => void;
  newEmployeeFixedEndTime: string;
  onNewEmployeeFixedEndTimeChange: (value: string) => void;
  departments: Department[];
  canCreateEmployee: boolean;
  isCreatingEmployee: boolean;
  onAddEmployee: () => void;
  canManageDepartments: boolean;
  onToggleDepartments: () => void;
  scheduleView: ScheduleView;
  onScheduleViewChange: (view: ScheduleView) => void;
  canImportExcel: boolean;
  isImportingExcel: boolean;
  isApplyingExcelImport: boolean;
  onExcelFile: (file: File | null) => void;
  isExportingExcel: boolean;
  onExportExcel: () => void;
  printRangeKey: string;
  onPrintRangeChange: (value: string) => void;
  printCalendarWeekRanges: PrintRange[];
  isPreparingPrint: boolean;
  onPrint: () => void;
  canBulkEditSchedule: boolean;
  isApplyingBulkSchedule: boolean;
  onFillOffAll: () => void;
  onClearAll: () => void;
}

export function PlannerControlsToolbar({
  newEmployeeName,
  onNewEmployeeNameChange,
  newEmployeeDepartmentId,
  onNewEmployeeDepartmentChange,
  newEmployeeScheduleMode,
  onNewEmployeeScheduleModeChange,
  newEmployeeFixedStartTime,
  onNewEmployeeFixedStartTimeChange,
  newEmployeeFixedEndTime,
  onNewEmployeeFixedEndTimeChange,
  departments,
  canCreateEmployee,
  isCreatingEmployee,
  onAddEmployee,
  canManageDepartments,
  onToggleDepartments,
  scheduleView,
  onScheduleViewChange,
  canImportExcel,
  isImportingExcel,
  isApplyingExcelImport,
  onExcelFile,
  isExportingExcel,
  onExportExcel,
  printRangeKey,
  onPrintRangeChange,
  printCalendarWeekRanges,
  isPreparingPrint,
  onPrint,
  canBulkEditSchedule,
  isApplyingBulkSchedule,
  onFillOffAll,
  onClearAll,
}: PlannerControlsToolbarProps) {
  const excelFileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <ControlsCard>
      <ControlsRow>
        <TextInput
          type="text"
          value={newEmployeeName}
          disabled={!canCreateEmployee || isCreatingEmployee}
          onChange={(event) => onNewEmployeeNameChange(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && onAddEmployee()}
          placeholder="ФИО нового сотрудника..."
        />

        <Select
          value={newEmployeeDepartmentId}
          disabled={!canCreateEmployee || isCreatingEmployee}
          onChange={(event) =>
            onNewEmployeeDepartmentChange(event.target.value)
          }
        >
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </Select>

        <Select
          value={newEmployeeScheduleMode}
          disabled={!canCreateEmployee || isCreatingEmployee}
          onChange={(event) =>
            onNewEmployeeScheduleModeChange(
              event.target.value as EmployeeScheduleMode
            )
          }
          title="Тип рабочего графика сотрудника"
        >
          <option value="flexible">Плавающий график</option>
          <option value="fixed-weekdays">5/2 · фиксированные часы</option>
        </Select>

        {newEmployeeScheduleMode === 'fixed-weekdays' && (
          <>
            <FixedTimeInput
              type="time"
              value={newEmployeeFixedStartTime}
              disabled={!canCreateEmployee || isCreatingEmployee}
              onChange={(event) =>
                onNewEmployeeFixedStartTimeChange(event.target.value)
              }
              title="Начало рабочего дня"
              aria-label="Начало рабочего дня"
            />
            <FixedTimeInput
              type="time"
              value={newEmployeeFixedEndTime}
              disabled={!canCreateEmployee || isCreatingEmployee}
              onChange={(event) =>
                onNewEmployeeFixedEndTimeChange(event.target.value)
              }
              title="Окончание рабочего дня"
              aria-label="Окончание рабочего дня"
            />
          </>
        )}

        <ActionButton
          type="button"
          $variant="primary"
          onClick={onAddEmployee}
          disabled={!canCreateEmployee || isCreatingEmployee}
        >
          <Plus size={16} />
          {isCreatingEmployee ? 'Добавляю…' : 'Добавить сотрудника'}
        </ActionButton>

        <ActionButton
          type="button"
          $variant="accent"
          onClick={onToggleDepartments}
          disabled={!canManageDepartments}
        >
          <Layers3 size={16} />
          Отделы
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

        <Divider />

        <HiddenFileInput
          ref={excelFileInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => {
            onExcelFile(event.target.files?.[0] || null);
            event.currentTarget.value = '';
          }}
        />

        <ActionButton
          type="button"
          onClick={() => excelFileInputRef.current?.click()}
          disabled={!canImportExcel || isImportingExcel || isApplyingExcelImport}
          title="Загрузить график из Excel с предпросмотром"
        >
          <FileUp size={16} />
          {isImportingExcel ? 'Читаю…' : 'Импорт Excel'}
        </ActionButton>

        <ActionButton
          type="button"
          $variant="accent"
          onClick={onExportExcel}
          disabled={isExportingExcel}
          title="Сформировать Excel-файл текущего месяца"
        >
          <FileSpreadsheet size={16} />
          {isExportingExcel ? 'Excel…' : 'Экспорт Excel'}
        </ActionButton>

        <PrintRangeSelect
          value={printRangeKey}
          disabled={isPreparingPrint}
          onChange={(event) => onPrintRangeChange(event.target.value)}
          title="Что печатать"
        >
          <option value="month">Весь месяц</option>
          {printCalendarWeekRanges.map((range) => (
            <option key={range.key} value={range.key}>
              Неделя {range.label}
            </option>
          ))}
        </PrintRangeSelect>

        <ActionButton
          type="button"
          onClick={onPrint}
          disabled={isPreparingPrint}
          title="Открыть печатную версию A4"
        >
          <Printer size={16} />
          {isPreparingPrint ? 'Готовлю…' : 'Печать'}
        </ActionButton>

        <ActionButton
          type="button"
          onClick={onFillOffAll}
          disabled={!canBulkEditSchedule}
        >
          {isApplyingBulkSchedule ? 'Применяю…' : 'OFF все'}
        </ActionButton>

        <ActionButton
          type="button"
          $variant="danger"
          onClick={onClearAll}
          disabled={!canBulkEditSchedule}
        >
          <Trash2 size={15} />
          {isApplyingBulkSchedule ? 'Применяю…' : 'Очистить месяц'}
        </ActionButton>
      </ControlsRow>
    </ControlsCard>
  );
}
