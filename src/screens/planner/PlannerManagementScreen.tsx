import { useRef } from 'react';
import {
  FileSpreadsheet,
  FileUp,
  Layers3,
  Pencil,
  Plus,
  Printer,
  Trash2,
} from 'lucide-react';

import {
  Department,
  DepartmentKind,
  Employee,
  EmployeeScheduleMode,
} from '../../types';
import {
  ActionButton,
  ControlsCard,
  ControlsRow,
  DepartmentCard,
  DepartmentGrid,
  DepartmentMeta,
  DepartmentName,
  DepartmentPanel,
  Divider,
  Muted,
  PanelTitle,
  PanelTitleRow,
  RowIconButton,
  Select,
  TextInput,
  TinyText,
} from '../../styles';
import { ScheduleView } from './PlannerScheduleTable';

interface PrintRange {
  key: string;
  label: string;
}

interface PlannerManagementScreenProps {
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
  employees: Employee[];
  canCreateEmployee: boolean;
  isCreatingEmployee: boolean;
  onAddEmployee: () => void;
  canManageDepartments: boolean;
  showDepartments: boolean;
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
  newDepartmentName: string;
  onNewDepartmentNameChange: (value: string) => void;
  newDepartmentKind: DepartmentKind;
  onNewDepartmentKindChange: (value: DepartmentKind) => void;
  mutatingDepartmentId: string | null;
  onAddDepartment: () => void;
  onChangeDepartmentKind: (
    departmentId: string,
    kind: DepartmentKind
  ) => void;
  onRenameDepartment: (department: Department) => void;
  onRemoveDepartment: (departmentId: string) => void;
}

export function PlannerManagementScreen({
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
  employees,
  canCreateEmployee,
  isCreatingEmployee,
  onAddEmployee,
  canManageDepartments,
  showDepartments,
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
  newDepartmentName,
  onNewDepartmentNameChange,
  newDepartmentKind,
  onNewDepartmentKindChange,
  mutatingDepartmentId,
  onAddDepartment,
  onChangeDepartmentKind,
  onRenameDepartment,
  onRemoveDepartment,
}: PlannerManagementScreenProps) {
  const excelFileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
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
              <TextInput
                type="time"
                value={newEmployeeFixedStartTime}
                disabled={!canCreateEmployee || isCreatingEmployee}
                onChange={(event) =>
                  onNewEmployeeFixedStartTimeChange(event.target.value)
                }
                title="Начало рабочего дня"
                aria-label="Начало рабочего дня"
                style={{ width: 118 }}
              />
              <TextInput
                type="time"
                value={newEmployeeFixedEndTime}
                disabled={!canCreateEmployee || isCreatingEmployee}
                onChange={(event) =>
                  onNewEmployeeFixedEndTimeChange(event.target.value)
                }
                title="Окончание рабочего дня"
                aria-label="Окончание рабочего дня"
                style={{ width: 118 }}
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
            {isCreatingEmployee ? 'Добавляю…' : 'Сотрудник'}
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

          <input
            ref={excelFileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            style={{ display: 'none' }}
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

          <Select
            value={printRangeKey}
            disabled={isPreparingPrint}
            onChange={(event) => onPrintRangeChange(event.target.value)}
            title="Что печатать"
            style={{ minWidth: 150 }}
          >
            <option value="month">Весь месяц</option>
            {printCalendarWeekRanges.map((range) => (
              <option key={range.key} value={range.key}>
                Неделя {range.label}
              </option>
            ))}
          </Select>

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

      {canManageDepartments && showDepartments && (
        <DepartmentPanel>
          <PanelTitleRow>
            <div>
              <PanelTitle>Отделы сотрудников</PanelTitle>
              <Muted>
                Создавайте отделы и переносите сотрудников между ними прямо в
                таблице.
              </Muted>
            </div>

            <ControlsRow>
              <TextInput
                value={newDepartmentName}
                onChange={(event) =>
                  onNewDepartmentNameChange(event.target.value)
                }
                onKeyDown={(event) =>
                  event.key === 'Enter' && onAddDepartment()
                }
                placeholder="Название отдела"
                style={{ flex: '0 1 220px' }}
              />

              <Select
                value={newDepartmentKind}
                onChange={(event) =>
                  onNewDepartmentKindChange(
                    event.target.value as DepartmentKind
                  )
                }
              >
                <option value="general">Обычный</option>
                <option value="fo">FO Agents</option>
                <option value="night">Night Agents</option>
              </Select>

              <ActionButton
                type="button"
                $variant="accent"
                onClick={onAddDepartment}
                disabled={mutatingDepartmentId !== null}
              >
                <Plus size={15} />
                {mutatingDepartmentId === 'create' ? 'Добавляю…' : 'Отдел'}
              </ActionButton>
            </ControlsRow>
          </PanelTitleRow>

          <DepartmentGrid>
            {departments.map((department) => {
              const employeeCount = employees.filter(
                (employee) => employee.departmentId === department.id
              ).length;

              return (
                <DepartmentCard key={department.id}>
                  <DepartmentMeta>
                    <DepartmentName>{department.name}</DepartmentName>
                    <TinyText>{employeeCount} сотрудников</TinyText>
                  </DepartmentMeta>

                  <Select
                    value={department.kind}
                    disabled={mutatingDepartmentId !== null}
                    onChange={(event) =>
                      onChangeDepartmentKind(
                        department.id,
                        event.target.value as DepartmentKind
                      )
                    }
                    style={{ minHeight: 32, padding: '0 8px' }}
                  >
                    <option value="general">Отдел</option>
                    <option value="fo">FO</option>
                    <option value="night">Night</option>
                  </Select>

                  <RowIconButton
                    type="button"
                    disabled={mutatingDepartmentId !== null}
                    onClick={() => onRenameDepartment(department)}
                    title="Переименовать"
                  >
                    <Pencil size={14} />
                  </RowIconButton>

                  <RowIconButton
                    type="button"
                    disabled={mutatingDepartmentId !== null}
                    onClick={() => onRemoveDepartment(department.id)}
                    title="Деактивировать пустой отдел"
                  >
                    <Trash2 size={14} />
                  </RowIconButton>
                </DepartmentCard>
              );
            })}
          </DepartmentGrid>
        </DepartmentPanel>
      )}
    </>
  );
}
