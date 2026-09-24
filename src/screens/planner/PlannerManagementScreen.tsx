import {
  Department,
  Employee,
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
  year: number;
  monthIndex: number;
  publicationReadEnabled: boolean;
  canPublishSchedule: boolean;
  employees: Employee[];
  canCreateEmployee: boolean;
  isCreatingEmployee: boolean;
  onAddEmployee: (values: EmployeeCreateFormValues) => Promise<boolean>;
  canManageDepartments: boolean;
  canViewDepartments: boolean;
  showDepartments: boolean;
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
  newDepartmentName: string;
  onNewDepartmentNameChange: (value: string) => void;
  mutatingDepartmentId: string | null;
  onAddDepartment: () => void;
  onRenameDepartment: (department: Department) => void;
  onRemoveDepartment: (departmentId: string) => void;
}

export function PlannerManagementScreen({
  departments,
  year,
  monthIndex,
  publicationReadEnabled,
  canPublishSchedule,
  employees,
  canCreateEmployee,
  isCreatingEmployee,
  onAddEmployee,
  canManageDepartments,
  canViewDepartments,
  showDepartments,
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
  newDepartmentName,
  onNewDepartmentNameChange,
  mutatingDepartmentId,
  onAddDepartment,
  onRenameDepartment,
  onRemoveDepartment,
}: PlannerManagementScreenProps) {
  return (
    <>
      <PlannerControlsToolbar
        departments={departments}
        year={year}
        monthIndex={monthIndex}
        publicationReadEnabled={publicationReadEnabled}
        canPublishSchedule={canPublishSchedule}
        canCreateEmployee={canCreateEmployee}
        isCreatingEmployee={isCreatingEmployee}
        onAddEmployee={onAddEmployee}
        canManageDepartments={canManageDepartments}
        canViewDepartments={canViewDepartments}
        onToggleDepartments={onToggleDepartments}
        scheduleView={scheduleView}
        onScheduleViewChange={onScheduleViewChange}
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
      />

      <PlannerDepartmentPanel
        departments={departments}
        employees={employees}
        canManageDepartments={canManageDepartments}
        canViewDepartments={canViewDepartments}
        showDepartments={showDepartments}
        newDepartmentName={newDepartmentName}
        onNewDepartmentNameChange={onNewDepartmentNameChange}
        mutatingDepartmentId={mutatingDepartmentId}
        onAddDepartment={onAddDepartment}
        onRenameDepartment={onRenameDepartment}
        onRemoveDepartment={onRemoveDepartment}
        onClose={onToggleDepartments}
      />
    </>
  );
}
