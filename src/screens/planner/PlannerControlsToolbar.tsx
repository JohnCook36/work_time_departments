import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  FileSpreadsheet,
  FileUp,
  Layers3,
  Plus,
  Printer,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';

import { Department, EmployeeScheduleMode } from '../../domain/models';
import { validateShiftInput } from '../../domain/schedule/shiftHours';
import {
  ActionButton,
  ControlsCard,
  ControlsRow,
  Drawer,
  DrawerHeader,
  DrawerOverlay,
  DrawerSubtitle,
  DrawerTitle,
  IconButton,
  Select,
} from '../../theme/styles';
import { ScheduleView } from './PlannerScheduleTable';
import {
  DrawerActions,
  DrawerField,
  DrawerFieldLabel,
  DrawerForm,
  EmployeeNameInput,
  FixedTimeInput,
  HiddenFileInput,
  PrintRangeSelect,
  ToolbarActions,
  ToolsGrid,
  ToolsSection,
  ToolsSectionTitle,
  ValidationSlot,
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
  canViewDepartments: boolean;
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
  canViewDepartments,
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
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [showScheduleTools, setShowScheduleTools] = useState(false);

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
      setShowEmployeeForm(false);
    }
  });

  return (
    <>
      <ControlsCard>
        <ControlsRow>
          <ToolbarActions>
            <ActionButton
              type="button"
              $variant="primary"
              onClick={() => setShowEmployeeForm(true)}
              disabled={!canCreateEmployee}
            >
              <UserPlus size={16} />
              Добавить сотрудника
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

      <HiddenFileInput
        ref={excelFileInputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(event) => {
          onExcelFile(event.target.files?.[0] || null);
          event.currentTarget.value = '';
        }}
      />

      {showEmployeeForm && (
        <DrawerOverlay onMouseDown={() => setShowEmployeeForm(false)}>
          <Drawer onMouseDown={(event) => event.stopPropagation()}>
            <DrawerHeader>
              <div>
                <DrawerTitle>Добавить сотрудника</DrawerTitle>
                <DrawerSubtitle>
                  Все параметры нового сотрудника собраны в одной форме.
                </DrawerSubtitle>
              </div>
              <IconButton
                type="button"
                onClick={() => setShowEmployeeForm(false)}
                title="Закрыть"
              >
                <X size={18} />
              </IconButton>
            </DrawerHeader>

            <DrawerForm onSubmit={submitEmployee} noValidate>
              <DrawerField>
                <DrawerFieldLabel htmlFor="employee-display-name">
                  ФИО сотрудника
                </DrawerFieldLabel>
                <EmployeeNameInput
                  id="employee-display-name"
                  type="text"
                  disabled={!canCreateEmployee || isCreatingEmployee}
                  aria-invalid={errors.displayName ? 'true' : 'false'}
                  placeholder="Например, Иван Иванов"
                  {...register('displayName', {
                    required: 'Введите ФИО нового сотрудника',
                    validate: (value) =>
                      value.trim().length >= 2 || 'Введите корректное ФИО',
                  })}
                />
                <ValidationSlot role={errors.displayName ? 'alert' : undefined}>
                  {errors.displayName?.message || ' '}
                </ValidationSlot>
              </DrawerField>

              <DrawerField>
                <DrawerFieldLabel htmlFor="employee-department">
                  Отдел
                </DrawerFieldLabel>
                <Select
                  id="employee-department"
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
                <ValidationSlot role={errors.departmentId ? 'alert' : undefined}>
                  {errors.departmentId?.message ||
                    (departments.length === 0
                      ? 'Нет доступных отделов для добавления сотрудника'
                      : ' ')}
                </ValidationSlot>
              </DrawerField>

              <DrawerField>
                <DrawerFieldLabel htmlFor="employee-schedule-mode">
                  График
                </DrawerFieldLabel>
                <Select
                  id="employee-schedule-mode"
                  disabled={!canCreateEmployee || isCreatingEmployee}
                  {...register('scheduleMode')}
                >
                  <option value="flexible">Плавающий график</option>
                  <option value="fixed-weekdays">5/2 · фиксированные часы</option>
                </Select>
                <ValidationSlot>{' '}</ValidationSlot>
              </DrawerField>

              {scheduleMode === 'fixed-weekdays' && (
                <>
                  <DrawerField>
                    <DrawerFieldLabel htmlFor="employee-fixed-start">
                      Начало рабочего дня
                    </DrawerFieldLabel>
                    <FixedTimeInput
                      id="employee-fixed-start"
                      type="time"
                      disabled={!canCreateEmployee || isCreatingEmployee}
                      aria-invalid={errors.fixedStartTime ? 'true' : 'false'}
                      {...register('fixedStartTime', {
                        validate: (value) =>
                          scheduleMode !== 'fixed-weekdays' ||
                          Boolean(value) ||
                          'Укажите начало рабочего дня',
                      })}
                    />
                    <ValidationSlot
                      role={errors.fixedStartTime ? 'alert' : undefined}
                    >
                      {errors.fixedStartTime?.message || ' '}
                    </ValidationSlot>
                  </DrawerField>

                  <DrawerField>
                    <DrawerFieldLabel htmlFor="employee-fixed-end">
                      Окончание рабочего дня
                    </DrawerFieldLabel>
                    <FixedTimeInput
                      id="employee-fixed-end"
                      type="time"
                      disabled={!canCreateEmployee || isCreatingEmployee}
                      aria-invalid={errors.fixedEndTime ? 'true' : 'false'}
                      {...register('fixedEndTime', {
                        validate: (value) => {
                          if (scheduleMode !== 'fixed-weekdays') return true;
                          if (!value) return 'Укажите окончание рабочего дня';

                          const startTime = getValues('fixedStartTime');
                          if (!startTime) return true;

                          const entry = validateShiftInput(
                            startTime + '-' + value,
                          );
                          return (
                            entry.type === 'shift' ||
                            'Проверьте время начала и окончания'
                          );
                        },
                      })}
                    />
                    <ValidationSlot
                      role={errors.fixedEndTime ? 'alert' : undefined}
                    >
                      {errors.fixedEndTime?.message || ' '}
                    </ValidationSlot>
                  </DrawerField>
                </>
              )}

              <DrawerActions>
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
              </DrawerActions>
            </DrawerForm>
          </Drawer>
        </DrawerOverlay>
      )}

      {showScheduleTools && (
        <DrawerOverlay onMouseDown={() => setShowScheduleTools(false)}>
          <Drawer onMouseDown={(event) => event.stopPropagation()}>
            <DrawerHeader>
              <div>
                <DrawerTitle>Управление графиком</DrawerTitle>
                <DrawerSubtitle>
                  Импорт, экспорт, печать и массовые операции собраны отдельно от
                  основной таблицы.
                </DrawerSubtitle>
              </div>
              <IconButton
                type="button"
                onClick={() => setShowScheduleTools(false)}
                title="Закрыть"
              >
                <X size={18} />
              </IconButton>
            </DrawerHeader>

            <ToolsSection>
              <ToolsSectionTitle>Excel</ToolsSectionTitle>
              <ToolsGrid>
                <ActionButton
                  type="button"
                  onClick={() => excelFileInputRef.current?.click()}
                  disabled={
                    !canImportExcel ||
                    isImportingExcel ||
                    isApplyingExcelImport
                  }
                >
                  <FileUp size={16} />
                  {isImportingExcel ? 'Читаю…' : 'Импорт Excel'}
                </ActionButton>

                <ActionButton
                  type="button"
                  $variant="accent"
                  onClick={onExportExcel}
                  disabled={isExportingExcel}
                >
                  <FileSpreadsheet size={16} />
                  {isExportingExcel ? 'Excel…' : 'Экспорт Excel'}
                </ActionButton>
              </ToolsGrid>
            </ToolsSection>

            <ToolsSection>
              <ToolsSectionTitle>Печать</ToolsSectionTitle>
              <PrintRangeSelect
                value={printRangeKey}
                disabled={isPreparingPrint}
                onChange={(event) => onPrintRangeChange(event.target.value)}
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
              >
                <Printer size={16} />
                {isPreparingPrint ? 'Готовлю…' : 'Печать'}
              </ActionButton>
            </ToolsSection>

            <ToolsSection>
              <ToolsSectionTitle>Массовые операции</ToolsSectionTitle>
              <ToolsGrid>
                <ActionButton
                  type="button"
                  onClick={onFillOffAll}
                  disabled={!canBulkEditSchedule}
                >
                  {isApplyingBulkSchedule ? 'Применяю…' : 'OFF весь месяц'}
                </ActionButton>

                <ActionButton
                  type="button"
                  $variant="danger"
                  onClick={onClearAll}
                  disabled={!canBulkEditSchedule}
                >
                  <Trash2 size={15} />
                  {isApplyingBulkSchedule
                    ? 'Применяю…'
                    : 'Очистить весь месяц'}
                </ActionButton>
              </ToolsGrid>
            </ToolsSection>
          </Drawer>
        </DrawerOverlay>
      )}
    </>
  );
}
