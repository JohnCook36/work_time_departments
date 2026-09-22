import { Pencil, Plus, Trash2 } from 'lucide-react';

import {
  Department,
  DepartmentKind,
  Employee,
} from '../../domain/models';
import {
  ActionButton,
  ControlsRow,
  DepartmentCard,
  DepartmentGrid,
  DepartmentMeta,
  DepartmentName,
  DepartmentPanel,
  Muted,
  PanelTitle,
  PanelTitleRow,
  RowIconButton,
  Select,
  TextInput,
  TinyText,
} from '../../theme/styles';
import {
  CompactDepartmentSelect,
  DepartmentNameInput,
} from './PlannerDepartmentPanel.styles';

interface PlannerDepartmentPanelProps {
  departments: Department[];
  employees: Employee[];
  canManageDepartments: boolean;
  showDepartments: boolean;
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

export function PlannerDepartmentPanel({
  departments,
  employees,
  canManageDepartments,
  showDepartments,
  newDepartmentName,
  onNewDepartmentNameChange,
  newDepartmentKind,
  onNewDepartmentKindChange,
  mutatingDepartmentId,
  onAddDepartment,
  onChangeDepartmentKind,
  onRenameDepartment,
  onRemoveDepartment,
}: PlannerDepartmentPanelProps) {
  if (!canManageDepartments || !showDepartments) return null;

  return (
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
          <DepartmentNameInput
            value={newDepartmentName}
            onChange={(event) =>
              onNewDepartmentNameChange(event.target.value)
            }
            onKeyDown={(event) =>
              event.key === 'Enter' && onAddDepartment()
            }
            placeholder="Название отдела"
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

              <CompactDepartmentSelect
                value={department.kind}
                disabled={mutatingDepartmentId !== null}
                onChange={(event) =>
                  onChangeDepartmentKind(
                    department.id,
                    event.target.value as DepartmentKind
                  )
                }
              >
                <option value="general">Отдел</option>
                <option value="fo">FO</option>
                <option value="night">Night</option>
              </CompactDepartmentSelect>

              <RowIconButton>
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
  );
}
