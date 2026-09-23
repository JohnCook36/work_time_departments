import { useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { Department, EmployeeScheduleMode } from '../../domain/models';
import { validateShiftInput } from '../../domain/schedule/shiftHours';
import {
  ActionButton,
  DrawerHeader,
  DrawerOverlay,
  DrawerSubtitle,
  DrawerTitle,
  FormGroup,
  FormLabel,
  IconButton,
} from '../../theme/styles';
import {
  CompactDrawer,
  DrawerActionsGrid,
  DrawerFieldError,
  FullWidthInput,
  FullWidthSelect,
  TwoColumnGrid,
} from './styles';

export interface EmployeeCreateValues {
  displayName: string;
  departmentId: string;
  scheduleMode: EmployeeScheduleMode;
  fixedStartTime: string;
  fixedEndTime: string;
}

interface EmployeeCreateDrawerProps {
  departments: Department[];
  busy: boolean;
  onCreate: (values: EmployeeCreateValues) => Promise<boolean>;
  onClose: () => void;
}

export function EmployeeCreateDrawer({
  departments,
  busy,
  onCreate,
  onClose,
}: EmployeeCreateDrawerProps) {
  const {
    register,
    handleSubmit,
    watch,
    getValues,
    setValue,
    reset,
    formState: { errors },
  } = useForm<EmployeeCreateValues>({
    defaultValues: {
      displayName: '',
      departmentId: departments[0]?.id || '',
      scheduleMode: 'flexible',
      fixedStartTime: '08:00',
      fixedEndTime: '17:00',
    },
  });

  const scheduleMode = watch('scheduleMode');

  useEffect(() => {
    const current = getValues('departmentId');
    if (!departments.some((department) => department.id === current)) {
      setValue('departmentId', departments[0]?.id || '');
    }
  }, [departments, getValues, setValue]);

  const submit = handleSubmit(async (values) => {
    const created = await onCreate({
      ...values,
      displayName: values.displayName.trim(),
    });

    if (created) {
      reset();
      onClose();
    }
  });

  return (
    <DrawerOverlay onMouseDown={busy ? undefined : onClose}>
      <CompactDrawer onMouseDown={(event) => event.stopPropagation()}>
        <DrawerHeader>
          <div>
            <DrawerTitle>Новый сотрудник</DrawerTitle>
            <DrawerSubtitle>
              Все параметры сотрудника заполняются здесь. Основной планировщик
              при этом не меняет положение.
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

        <form onSubmit={submit} noValidate>
          <FormGroup>
            <FormLabel>Имя и фамилия</FormLabel>
            <FullWidthInput
              type="text"
              placeholder="Например, Иван Иванов"
              disabled={busy}
              aria-invalid={errors.displayName ? 'true' : 'false'}
              {...register('displayName', {
                required: 'Введите имя и фамилию сотрудника',
                validate: (value) =>
                  value.trim().length >= 2 || 'Введите корректное имя',
              })}
            />
            <DrawerFieldError
              role={errors.displayName ? 'alert' : undefined}
              aria-live="polite"
            >
              {errors.displayName?.message || '\u00A0'}
            </DrawerFieldError>
          </FormGroup>

          <FormGroup>
            <FormLabel>Отдел</FormLabel>
            <FullWidthSelect
              disabled={busy}
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
            </FullWidthSelect>
            <DrawerFieldError
              role={errors.departmentId ? 'alert' : undefined}
              aria-live="polite"
            >
              {errors.departmentId?.message || '\u00A0'}
            </DrawerFieldError>
          </FormGroup>

          <FormGroup>
            <FormLabel>Режим графика</FormLabel>
            <FullWidthSelect
              disabled={busy}
              {...register('scheduleMode')}
            >
              <option value="flexible">Плавающий график</option>
              <option value="fixed-weekdays">5/2 · фиксированные часы</option>
            </FullWidthSelect>
            <DrawerFieldError>{'\u00A0'}</DrawerFieldError>
          </FormGroup>

          <FormGroup>
            <FormLabel>Рабочее время 5/2</FormLabel>
            <TwoColumnGrid>
              <FullWidthInput
                type="time"
                disabled={busy || scheduleMode !== 'fixed-weekdays'}
                aria-label="Начало рабочего дня"
                aria-invalid={errors.fixedStartTime ? 'true' : 'false'}
                {...register('fixedStartTime', {
                  validate: (value) =>
                    scheduleMode !== 'fixed-weekdays' ||
                    Boolean(value) ||
                    'Укажите начало рабочего дня',
                })}
              />
              <FullWidthInput
                type="time"
                disabled={busy || scheduleMode !== 'fixed-weekdays'}
                aria-label="Окончание рабочего дня"
                aria-invalid={errors.fixedEndTime ? 'true' : 'false'}
                {...register('fixedEndTime', {
                  validate: (value) => {
                    if (scheduleMode !== 'fixed-weekdays') return true;
                    if (!value) return 'Укажите окончание рабочего дня';

                    const start = getValues('fixedStartTime');
                    if (!start) return true;

                    return (
                      validateShiftInput(start + '-' + value).type === 'shift' ||
                      'Проверьте время начала и окончания'
                    );
                  },
                })}
              />
            </TwoColumnGrid>
            <DrawerFieldError
              role={
                errors.fixedStartTime || errors.fixedEndTime
                  ? 'alert'
                  : undefined
              }
              aria-live="polite"
            >
              {scheduleMode === 'fixed-weekdays'
                ? errors.fixedStartTime?.message ||
                  errors.fixedEndTime?.message ||
                  'По производственному календарю выходные и праздники подставятся автоматически.'
                : 'Для плавающего графика время задаётся по сменам.'}
            </DrawerFieldError>
          </FormGroup>

          <DrawerActionsGrid>
            <ActionButton
              type="submit"
              $variant="primary"
              disabled={busy || departments.length === 0}
            >
              <Plus size={16} />
              {busy ? 'Добавляю…' : 'Добавить сотрудника'}
            </ActionButton>

            <ActionButton type="button" onClick={onClose} disabled={busy}>
              Отмена
            </ActionButton>
          </DrawerActionsGrid>
        </form>
      </CompactDrawer>
    </DrawerOverlay>
  );
}
