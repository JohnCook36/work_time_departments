import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import {
  FileSpreadsheet,
  FileUp,
  Layers3,
  Plus,
  Printer,
  Trash2,
} from 'lucide-react';

import { Department, EmployeeScheduleMode } from '../../domain/models';
import { validateShiftInput } from '../../domain/schedule/shiftHours';
import {
  ActionButton,
  ControlsCard,
  ControlsRow,
  Divider,
  Select,
} from '../../theme/styles';
import { ScheduleView } from './PlannerScheduleTable';
import {
  EmployeeFieldError,
  EmployeeForm,
  EmployeeFormStatus,
  EmployeeNameField,
  EmployeeNameInput,
  FixedTimeInput,
  HiddenFileInput,
  PrintRangeSelect,
} from './PlannerControlsToolbar.styles';

interface PrintRange {
  key: string;
  label: string;
}

export interface EmployeeCreateFormValues {
  displayName: string;
  departmentId: string;
  scheduleMode: EmployeeScheduleMode;
  fixedStartTime: string;
  fixedEndTime: string;
}

interface PlannerControlsToolbarProps {
  departments: Department[];
  canCreateEmployee: boolean;
  isCreatingEmployee: boolean;
  onAddEmployee: (values: EmployeeCreateFormValues) => Promise<boolean>;
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
  const {
    register,
    handleSubmit,
    watch,
    getValues,
    setValue,
    reset,
    formState: { errors },
  } = useForm<EmployeeCreateFormValues>({
    defaultValues: {
      displayName: '',
      departmentId: departments[0]?.id || '',
      scheduleMode: 'flexible',
      fixedStartTime: '',
      fixedEndTime: '',
    },
  });

  const scheduleMode = watch('scheduleMode');

  useEffect(() => {
    const departmentId = getValues('departmentId');
    if (!departments.some((department) => department.id === departmentId)) {
      setValue('departmentId', departments[0]?.id || '');
    }
  }, [departments, getValues, setValue]);

  const submitEmployee = handleSubmit(async (values) => {
    const created = await onAddEmployee({
      ...values,
      displayName: values.displayName.trim(),
    });

    if (created) {
      reset({
        displayName: '',
        departmentId: departments[0]?.id || '',
        scheduleMode: 'flexible',
        fixedStartTime: '',
        fixedEndTime: '',
      });
    }
  });

  return (
    <ControlsCard>
      <ControlsRow>
        <EmployeeForm onSubmit={submitEmployee} noValidate>
          <EmployeeNameField>
            <EmployeeNameInput
              type="text"
              disabled={!canCreateEmployee || isCreatingEmployee}
              aria-invalid={errors.displayName ? 'true' : 'false'}
              placeholder="ФИО нового сотрудника..."
              {...register('displayName', {
                required: 'Введите ФИО нового сотрудника',
                validate: (value) =>
                  value.trim().length >= 2 || 'Введите корректное ФИО',
              })}
            />
            {errors.displayName && (
              <EmployeeFieldError role="alert">
                {errors.displayName.message}
              </EmployeeFieldError>
            )}
          </EmployeeNameField>

          <Select
            disabled={!canCreateEmployee || isCreatingEmployee}
            aria-invalid={errors.departmentId ? 'true' : 'false'}
            {...register('departmentId', {
              required: 'Выберите отдел',
            })}
          >
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>

          <Select
            disabled={!canCreateEmployee || isCreatingEmployee}
            {...register('scheduleMode')}
            title="Тип рабочего графика сотрудника"
          >
            <option value="flexible">Плавающий график</option>
            <option value="fixed-weekdays">5/2 · фиксированные часы</option>
          </Select>

          {scheduleMode === 'fixed-weekdays' && (
            <>
              <FixedTimeInput
                type="time"
                disabled={!canCreateEmployee || isCreatingEmployee}
                aria-invalid={errors.fixedStartTime ? 'true' : 'false'}
                aria-label="Начало рабочего дня"
                {...register('fixedStartTime', {
                  validate: (value) =>
                    scheduleMode !== 'fixed-weekdays' ||
                    Boolean(value) ||
                    'Укажите начало рабочего дня',
                })}
              />
              <FixedTimeInput
                type="time"
                disabled={!canCreateEmployee || isCreatingEmployee}
                aria-invalid={errors.fixedEndTime ? 'true' : 'false'}
                aria-label="Окончание рабочего дня"
                {...register('fixedEndTime', {
                  validate: (value) => {
                    if (scheduleMode !== 'fixed-weekdays') return true;
                    if (!value) return 'Укажите окончание рабочего дня';

                    const startTime = getValues('fixedStartTime');
                    if (!startTime) return true;

                    const entry = validateShiftInput(startTime + '-' + value);
                    return (
                      entry.type === 'shift' ||
                      'Проверьте время начала и окончания'
                    );
                  },
                })}
              />
            </>
          )}

          <ActionButton
            type="submit"
            $variant="primary"
            disabled={
              !canCreateEmployee ||
              isCreatingEmployee ||
              departments.length === 0
            }
          >
            <Plus size={16} />
            {isCreatingEmployee ? 'Добавляю…' : 'Добавить сотрудника'}
          </ActionButton>

          {(errors.departmentId ||
            errors.fixedStartTime ||
            errors.fixedEndTime) && (
            <EmployeeFormStatus role="alert">
              {errors.departmentId?.message ||
                errors.fixedStartTime?.message ||
                errors.fixedEndTime?.message}
            </EmployeeFormStatus>
          )}

          {departments.length === 0 && (
            <EmployeeFormStatus>
              Нет доступных отделов для добавления сотрудника.
            </EmployeeFormStatus>
          )}
        </EmployeeForm>

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
