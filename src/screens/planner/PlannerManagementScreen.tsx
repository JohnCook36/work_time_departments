import {
  Department,
  DepartmentKind,
  Employee,
  EmployeeScheduleMode,
} from '../../domain/models';
import {
  EmployeeCreateFormValues,
  PlannerControlsToolbar,
} from './PlannerControlsToolbar';
import { PlannerDepartmentPanel } from './PlannerDepartmentPanel';
import { ScheduleView } from './PlannerScheduleTable';

interface PrintRange {
  key: string;
  label: string;
}

interface PlannerManagementScreenProps {
  departments: Department[];
  employees: Employee[];
  canCreateEmployee: boolean;
  isCreatingEmployee: boolean;
  onAddEmployee: (values: EmployeeCreateFormValues) => Promise<boolean>;
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
  return (
    <>
      <PlannerControlsToolbar
        departments={departments}
        canCreateEmployee={canCreateEmployee}
        isCreatingEmployee={isCreatingEmployee}
        onAddEmployee={onAddEmployee}
        canManageDepartments={canManageDepartments}
        onToggleDepartments={onToggleDepartments}
        scheduleView={scheduleView}
        onScheduleViewChange={onScheduleViewChange}
        canImportExcel={canImportExcel}
        isImportingExcel={isImportingExcel}
        isApplyingExcelImport={isApplyingExcelImport}
        onExcelFile={onExcelFile}
        isExportingExcel={isExportingExcel}
        onExportExcel={onExportExcel}
        printRangeKey={printRangeKey}
        onPrintRangeChange={onPrintRangeChange}
        printCalendarWeekRanges={printCalendarWeekRanges}
        isPreparingPrint={isPreparingPrint}
        onPrint={onPrint}
        canBulkEditSchedule={canBulkEditSchedule}
        isApplyingBulkSchedule={isApplyingBulkSchedule}
        onFillOffAll={onFillOffAll}
        onClearAll={onClearAll}
      />

      <PlannerDepartmentPanel
        departments={departments}
        employees={employees}
        canManageDepartments={canManageDepartments}
        showDepartments={showDepartments}
        newDepartmentName={newDepartmentName}
        onNewDepartmentNameChange={onNewDepartmentNameChange}
        newDepartmentKind={newDepartmentKind}
        onNewDepartmentKindChange={onNewDepartmentKindChange}
        mutatingDepartmentId={mutatingDepartmentId}
        onAddDepartment={onAddDepartment}
        onChangeDepartmentKind={onChangeDepartmentKind}
        onRenameDepartment={onRenameDepartment}
        onRemoveDepartment={onRemoveDepartment}
      />
    </>
  );
}
