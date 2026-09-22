import { EmployeeEditDrawer, EmployeeEditValues } from '../../EmployeeEditDrawer';
import { ExcelImportDrawer } from '../../ExcelImportDrawer';
import { ExcelImportPreview } from '../../importExcel';
import { ShiftEditor } from '../../ShiftEditor';
import { Department, Employee, EmployeeWish, ShiftEntry } from '../../types';
import { EmployeeWishDrawer } from '../../WishDrawer';

interface EditingCell {
  empId: string;
  day: number;
}

interface PlannerOverlaysProps {
  canImportExcel: boolean;
  excelImportPreview: ExcelImportPreview | null;
  excelImportConflictCount: number;
  overwriteExcelCells: boolean;
  onOverwriteExcelCellsChange: (value: boolean) => void;
  onApplyExcelImport: () => void;
  isApplyingExcelImport: boolean;
  onCloseExcelImport: () => void;
  canEditScheduleCells: boolean;
  selectedShiftEmployee: Employee | null;
  editingCell: EditingCell | null;
  periodKey: string;
  year: number;
  month: number;
  getEntry: (employeeId: string, day: number) => ShiftEntry;
  onSaveShift: (employeeId: string, day: number, value: string) => void;
  onCloseShift: () => void;
  selectedEditEmployee: Employee | null;
  canManageEmployeeProfiles: boolean;
  departments: Department[];
  mutatingEmployeeId: string | null;
  onSaveEmployee: (values: EmployeeEditValues) => void | Promise<void>;
  onDeactivateEmployee: (employeeId: string) => void;
  onCloseEmployee: () => void;
  canEditWishes: boolean;
  selectedWishEmployee: Employee | null;
  daysInMonth: number;
  selectedEmployeeWishes: EmployeeWish[];
  mutatingWishId: string | null;
  onAddWish: (
    employeeId: string,
    wish: Omit<EmployeeWish, 'id'>
  ) => void;
  onRemoveWish: (employeeId: string, wishId: string) => void;
  onCloseWishes: () => void;
}

export function PlannerOverlays({
  canImportExcel,
  excelImportPreview,
  excelImportConflictCount,
  overwriteExcelCells,
  onOverwriteExcelCellsChange,
  onApplyExcelImport,
  isApplyingExcelImport,
  onCloseExcelImport,
  canEditScheduleCells,
  selectedShiftEmployee,
  editingCell,
  periodKey,
  year,
  month,
  getEntry,
  onSaveShift,
  onCloseShift,
  selectedEditEmployee,
  canManageEmployeeProfiles,
  departments,
  mutatingEmployeeId,
  onSaveEmployee,
  onDeactivateEmployee,
  onCloseEmployee,
  canEditWishes,
  selectedWishEmployee,
  daysInMonth,
  selectedEmployeeWishes,
  mutatingWishId,
  onAddWish,
  onRemoveWish,
  onCloseWishes,
}: PlannerOverlaysProps) {
  return (
    <>
      {canImportExcel && excelImportPreview && (
        <ExcelImportDrawer
          preview={excelImportPreview}
          conflictCount={excelImportConflictCount}
          overwriteExisting={overwriteExcelCells}
          onOverwriteChange={onOverwriteExcelCellsChange}
          onApply={onApplyExcelImport}
          busy={isApplyingExcelImport}
          onClose={onCloseExcelImport}
        />
      )}

      {canEditScheduleCells && selectedShiftEmployee && editingCell && (
        <ShiftEditor
          key={selectedShiftEmployee.id + '-' + editingCell.day + '-' + periodKey}
          employee={selectedShiftEmployee}
          day={editingCell.day}
          year={year}
          month={month}
          entry={getEntry(selectedShiftEmployee.id, editingCell.day)}
          onSave={(value) =>
            onSaveShift(selectedShiftEmployee.id, editingCell.day, value)
          }
          onClose={onCloseShift}
        />
      )}

      {selectedEditEmployee && canManageEmployeeProfiles && (
        <EmployeeEditDrawer
          key={selectedEditEmployee.id}
          employee={selectedEditEmployee}
          departments={departments}
          busy={mutatingEmployeeId === selectedEditEmployee.id}
          onSave={onSaveEmployee}
          onDeactivate={() => onDeactivateEmployee(selectedEditEmployee.id)}
          onClose={onCloseEmployee}
        />
      )}

      {canEditWishes && selectedWishEmployee && (
        <EmployeeWishDrawer
          key={selectedWishEmployee.id + periodKey}
          employee={selectedWishEmployee}
          year={year}
          month={month}
          daysInMonth={daysInMonth}
          wishes={selectedEmployeeWishes}
          busy={mutatingWishId !== null}
          onAdd={(wish) => onAddWish(selectedWishEmployee.id, wish)}
          onRemove={(wishId) =>
            onRemoveWish(selectedWishEmployee.id, wishId)
          }
          onClose={onCloseWishes}
        />
      )}
    </>
  );
}
