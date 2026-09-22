import { useState } from 'react';
import { Check, Clock3, Eraser, Moon, X } from 'lucide-react';
import { Employee, ShiftCode, ShiftEntry } from '../../domain/models';
import { MONTH_NAMES } from '../../utils/calendar';
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
  QuickChip,
  QuickChips,
  Select,
  TextInput,
  TinyText,
} from '../../theme/styles';
import {
  CompactDrawer,
  DrawerActionsGrid,
  DrawerNotice,
  FieldHint,
  FullRowActionButton,
  FullWidthInput,
  FullWidthSelect,
  ShiftTimeGrid,
  TimeIconSlot,
} from './styles';

interface ShiftEditorProps {
  employee: Employee;
  day: number;
  year: number;
  month: number;
  entry: ShiftEntry;
  onSave: (value: string) => void;
  onClose: () => void;
}

interface ShiftPreset {
  label: string;
  start: string;
  end: string;
  code?: ShiftCode;
}

const PRESETS: ShiftPreset[] = [
  { label: '07:00–16:00', start: '07:00', end: '16:00' },
  { label: '08:00–17:00', start: '08:00', end: '17:00' },
  { label: '10:00–19:00', start: '10:00', end: '19:00' },
  { label: '15:00–23:00', start: '15:00', end: '23:00' },
  { label: 'N · 20:00–08:00', start: '20:00', end: '08:00', code: 'N' },
];

export function ShiftEditor({
  employee,
  day,
  year,
  month,
  entry,
  onSave,
  onClose,
}: ShiftEditorProps) {
  const currentShift = entry.type === 'shift' ? entry.shift : undefined;
  const [code, setCode] = useState<ShiftCode | ''>(currentShift?.code || '');
  const [start, setStart] = useState(currentShift?.start || '08:00');
  const [end, setEnd] = useState(currentShift?.end || '17:00');

  const saveShift = () => {
    const prefix = code ? code + ' ' : '';
    onSave(prefix + start + '-' + end);
  };

  const applyPreset = (preset: ShiftPreset) => {
    setStart(preset.start);
    setEnd(preset.end);
    setCode(preset.code || '');
  };

  return (
    <DrawerOverlay onMouseDown={onClose}>
      <CompactDrawer onMouseDown={(event) => event.stopPropagation()}>
        <DrawerHeader>
          <div>
            <DrawerTitle>Смена сотрудника</DrawerTitle>
            <DrawerSubtitle>
              {employee.name} • {day} {MONTH_NAMES[month].toLowerCase()} {year}
            </DrawerSubtitle>
          </div>

          <IconButton type="button" onClick={onClose} title="Закрыть">
            <X size={18} />
          </IconButton>
        </DrawerHeader>

        <FormGroup>
          <FormLabel>Код смены</FormLabel>
          <FullWidthSelect
            value={code}
            onChange={(event) =>
              setCode(event.target.value as ShiftCode | '')
            }
          >
            <option value="">Без кода</option>
            <option value="E">E</option>
            <option value="IN">IN</option>
            <option value="INN">INN</option>
            <option value="L">L</option>
            <option value="N">N</option>
          </FullWidthSelect>
        </FormGroup>

        <FormGroup>
          <FormLabel>Время работы</FormLabel>
          <ShiftTimeGrid>
            <div>
              <FieldHint>Начало</FieldHint>
              <FullWidthInput
                type="time"
                step={900}
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </div>

            <TimeIconSlot><Clock3 size={18} /></TimeIconSlot>

            <div>
              <FieldHint>Окончание</FieldHint>
              <FullWidthInput
                type="time"
                step={900}
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </div>
          </ShiftTimeGrid>
        </FormGroup>

        <FormGroup>
          <FormLabel>Быстрый выбор</FormLabel>
          <QuickChips>
            {PRESETS.map((preset) => (
              <QuickChip
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset)}
              >
                {preset.code === 'N' && <Moon size={13} />}
                {preset.label}
              </QuickChip>
            ))}
          </QuickChips>
        </FormGroup>

        <DrawerActionsGrid>
          <ActionButton
            type="button"
            $variant="primary"
            onClick={saveShift}
          >
            <Check size={16} />
            Сохранить смену
          </ActionButton>

          <ActionButton
            type="button"
            onClick={() => onSave('OFF')}
          >
            OFF
          </ActionButton>

          <FullRowActionButton
            type="button"
            $variant="danger"
            onClick={() => onSave('')}
          >
            <Eraser size={16} />
            Очистить ячейку
          </FullRowActionButton>
        </DrawerActionsGrid>

        <DrawerNotice>
          <TinyText>
            Обычная смена считается как фактическая длительность минус 1 час
            перерыва. Для N используется специальное правило на 12 оплачиваемых
            часов.
          </TinyText>
        </DrawerNotice>
      </CompactDrawer>
    </DrawerOverlay>
  );
}
