import { Pencil, Plus, Trash2, X } from 'lucide-react';

import { Department, Employee } from '../../domain/models';
import {
  ActionButton,
  DepartmentCard,
  DepartmentGrid,
  DepartmentMeta,
  DepartmentName,
  DrawerHeader,
  DrawerOverlay,
  DrawerSubtitle,
  DrawerTitle,
  FormGroup,
  FormLabel,
  IconButton,
  Muted,
  RowIconButton,
  TinyText,
} from '../../theme/styles';
import {
  CompactDrawer,
  FullWidthInput,
} from '../../components/drawers/styles';

interface PlannerDepartmentPanelProps {
  departments: Department[];
  employees: Employee[];
  canManageDepartments: boolean;
  canViewDepartments: boolean;
  showDepartments: boolean;
  newDepartmentName: string;
  onNewDepartmentNameChange: (value: string) => void;
  mutatingDepartmentId: string | null;
  onAddDepartment: () => void;
  onRenameDepartment: (department: Department) => void;
  onRemoveDepartment: (departmentId: string) => void;
  onClose: () => void;
}

export function PlannerDepartmentPanel({
  departments,
  employees,
  canManageDepartments,
  canViewDepartments,
  showDepartments,
  newDepartmentName,
  onNewDepartmentNameChange,
  mutatingDepartmentId,
  onAddDepartment,
  onRenameDepartment,
  onRemoveDepartment,
  onClose,
}: PlannerDepartmentPanelProps) {
  if (!canViewDepartments || !showDepartments) return null;

  return (
    <DrawerOverlay onMouseDown={onClose}>
      <CompactDrawer onMouseDown={(event) => event.stopPropagation()}>
        <DrawerHeader>
          <div>
            <DrawerTitle>Отделы</DrawerTitle>
            <DrawerSubtitle>
              Управление структурой отделов вынесено из основной таблицы.
            </DrawerSubtitle>
          </div>

          <IconButton type="button" onClick={onClose} title="Закрыть">
            <X size={18} />
          </IconButton>
        </DrawerHeader>

        {canManageDepartments ? (
          <FormGroup>
            <FormLabel>Новый отдел</FormLabel>
            <FullWidthInput
              value={newDepartmentName}
              onChange={(event) =>
                onNewDepartmentNameChange(event.target.value)
              }
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  newDepartmentName.trim().length >= 2 &&
                  mutatingDepartmentId === null
                ) {
                  onAddDepartment();
                }
              }}
              placeholder="Название отдела"
              disabled={mutatingDepartmentId !== null}
            />

            <ActionButton
              type="button"
              $variant="accent"
              onClick={onAddDepartment}
              disabled={
                mutatingDepartmentId !== null ||
                newDepartmentName.trim().length < 2
              }
            >
              <Plus size={15} />
              {mutatingDepartmentId === 'create'
                ? 'Создаю…'
                : 'Создать отдел'}
            </ActionButton>
          </FormGroup>
        ) : (
          <Muted>
            Изменять структуру отделов может только SUPER_ADMIN. Для вашей роли
            доступен просмотр.
          </Muted>
        )}

        <DepartmentGrid>
          {departments.map((department) => {
            const employeeCount = employees.filter(
              (employee) => employee.departmentId === department.id,
            ).length;

            return (
              <DepartmentCard key={department.id}>
                <DepartmentMeta>
                  <DepartmentName>{department.name}</DepartmentName>
                  <TinyText>{employeeCount} сотрудников</TinyText>
                </DepartmentMeta>

                <RowIconButton
                  type="button"
                  disabled={
                    !canManageDepartments || mutatingDepartmentId !== null
                  }
                  onClick={() => onRenameDepartment(department)}
                  title="Переименовать"
                >
                  <Pencil size={14} />
                </RowIconButton>

                <RowIconButton
                  type="button"
                  disabled={
                    !canManageDepartments || mutatingDepartmentId !== null
                  }
                  onClick={() => onRemoveDepartment(department.id)}
                  title="Деактивировать пустой отдел"
                >
                  <Trash2 size={14} />
                </RowIconButton>
              </DepartmentCard>
            );
          })}
        </DepartmentGrid>
      </CompactDrawer>
    </DrawerOverlay>
  );
}
