import { useState } from 'react';
import { Save, Trash2, X } from 'lucide-react';

import {
  Department,
  Employee,
  EmployeeScheduleMode,
  EmploymentRate,
} from '../../domain/models';
import {
  ActionButton,
  Drawer,
  DrawerHeader,
  DrawerOverlay,
  DrawerSubtitle,
  DrawerTitle,
  FormGroup,
  FormLabel,
  IconButton,
  Select,
  TextInput,
  TinyText,
} from '../../theme/styles';
import {
  CompactDrawer,
  DrawerActionsGrid,
  DrawerAlertText,
  DrawerNotice,
  FullRowActionButton,
  FullWidthInput,
  FullWidthSelect,
  TwoColumnGrid,
} from './styles';

export interface EmployeeEditValues {
  displayName: string;
  departmentId: string;
  employmentRate: EmploymentRate;
  scheduleMode: EmployeeScheduleMode;
  fixedStartTime: string | null;
  fixedEndTime: string | null;
}

interface EmployeeEditDrawerProps {
  employee: Employee;
  departments: Department[];
  busy: boolean;
  onSave: (values: EmployeeEditValues) => void;
  onDeactivate: () => void;
  onClose: () => void;
}

function normalizeRate(value: string): EmploymentRate {
  if (value === '0.75') return 0.75;
  if (value === '0.5') return 0.5;
  return 1;
}

export function EmployeeEditDrawer({
  employee,
  departments,
  busy,
  onSave,
  onDeactivate,
  onClose,
}: EmployeeEditDrawerProps) {
  const [displayName, setDisplayName] = useState(employee.name);
  const [departmentId, setDepartmentId] = useState(employee.departmentId);
  const [employmentRate, setEmploymentRate] = useState<EmploymentRate>(
    employee.employmentRate ?? 1,
  );
  const [scheduleMode, setScheduleMode] = useState<EmployeeScheduleMode>(
    employee.scheduleMode ?? 'flexible',
  );
  const [fixedStartTime, setFixedStartTime] = useState(
    employee.fixedStartTime ?? '08:00',
  );
  const [fixedEndTime, setFixedEndTime] = useState(
    employee.fixedEndTime ?? '17:00',
  );
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const name = displayName.trim();

    if (name.length < 2) {
      setError('Имя сотрудника должно содержать минимум 2 символа.');
      return;
    }

    if (!departmentId) {
      setError('Выберите отдел сотрудника.');
      return;
    }

    if (scheduleMode === 'fixed-weekdays') {
      if (!fixedStartTime || !fixedEndTime) {
        setError('Для графика 5/2 укажите начало и окончание рабочего дня.');
        return;
      }

      if (fixedStartTime === fixedEndTime) {
        setError('Начало и окончание рабочего дня не могут совпадать.');
        return;
      }
    }

    setError(null);
    onSave({
      displayName: name,
      departmentId,
      employmentRate,
      scheduleMode,
      fixedStartTime:
        scheduleMode === 'fixed-weekdays' ? fixedStartTime : null,
      fixedEndTime:
        scheduleMode === 'fixed-weekdays' ? fixedEndTime : null,
    });
  };

  return (
    <DrawerOverlay onMouseDown={busy ? undefined : onClose}>
      <CompactDrawer onMouseDown={(event) => event.stopPropagation()}>
        <DrawerHeader>
          <div>
            <DrawerTitle>Редактирование сотрудника</DrawerTitle>
            <DrawerSubtitle>
              Рабочий профиль • {employee.name}
            </DrawerSubtitle>
          </div>

          <IconButton
            type="button"
            onClick={onClose}
            title="Закрыть"
            disabled={busy}
          >
            <X size={18} />
          </IconButton>
        </DrawerHeader>

        <FormGroup>
          <FormLabel>Имя и фамилия</FormLabel>
          <FullWidthInput
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            disabled={busy}
          />
        </FormGroup>

        <FormGroup>
          <FormLabel>Отдел</FormLabel>
          <FullWidthSelect
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
            disabled={busy}
          >
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </FullWidthSelect>
        </FormGroup>

        <FormGroup>
          <FormLabel>Ставка</FormLabel>
          <FullWidthSelect
            value={String(employmentRate)}
            onChange={(event) =>
              setEmploymentRate(normalizeRate(event.target.value))
            }
            disabled={busy}
          >
            <option value="1">1.0</option>
            <option value="0.75">0.75</option>
            <option value="0.5">0.5</option>
          </FullWidthSelect>
        </FormGroup>

        <FormGroup>
          <FormLabel>Режим графика</FormLabel>
          <FullWidthSelect
            value={scheduleMode}
            onChange={(event) =>
              setScheduleMode(event.target.value as EmployeeScheduleMode)
            }
            disabled={busy}
          >
            <option value="flexible">Гибкий</option>
            <option value="fixed-weekdays">Фиксированный 5/2</option>
          </FullWidthSelect>
        </FormGroup>

        {scheduleMode === 'fixed-weekdays' && (
          <FormGroup>
            <FormLabel>Время рабочего дня 5/2</FormLabel>
            <TwoColumnGrid>
              <FullWidthInput
                type="time"
                value={fixedStartTime}
                onChange={(event) => setFixedStartTime(event.target.value)}
                disabled={busy}
                aria-label="Начало рабочего дня"
              />
              <FullWidthInput
                type="time"
                value={fixedEndTime}
                onChange={(event) => setFixedEndTime(event.target.value)}
                disabled={busy}
                aria-label="Окончание рабочего дня"
              />
            </TwoColumnGrid>
          </FormGroup>
        )}

        {error && (
          <DrawerAlertText role="alert">
            {error}
          </DrawerAlertText>
        )}

        <DrawerActionsGrid>
          <ActionButton
            type="button"
            $variant="primary"
            onClick={submit}
            disabled={busy}
          >
            <Save size={16} />
            {busy ? 'Сохраняю…' : 'Сохранить'}
          </ActionButton>

          <ActionButton
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Отмена
          </ActionButton>

          <FullRowActionButton
            type="button"
            $variant="danger"
            onClick={onDeactivate}
            disabled={busy}
          >
            <Trash2 size={16} />
            Деактивировать сотрудника
          </FullRowActionButton>
        </DrawerActionsGrid>

        <DrawerNotice>
          <TinyText>
            Деактивация не удаляет исторические смены. Если профиль связан с
            аккаунтом, доступ пользователя и активные сессии будут отключены.
          </TinyText>
        </DrawerNotice>
      </CompactDrawer>
    </DrawerOverlay>
  );
}
