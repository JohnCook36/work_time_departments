import { useState } from 'react';
import { Check, Clock3, Eraser, Moon, X } from 'lucide-react';
import { Employee, ShiftCode, ShiftEntry } from './types';
import { MONTH_NAMES } from './utils';
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
      <Drawer
        onMouseDown={(event) => event.stopPropagation()}
        style={{ width: 'min(500px, 100vw)' }}
      >
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
          <Select
            value={code}
            onChange={(event) =>
              setCode(event.target.value as ShiftCode | '')
            }
            style={{ width: '100%' }}
          >
            <option value="">Без кода</option>
            <option value="E">E</option>
            <option value="IN">IN</option>
            <option value="INN">INN</option>
            <option value="L">L</option>
            <option value="N">N</option>
          </Select>
        </FormGroup>

        <FormGroup>
          <FormLabel>Время работы</FormLabel>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div>
              <TinyText style={{ marginBottom: 5 }}>Начало</TinyText>
              <TextInput
                type="time"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                style={{ width: '100%', minWidth: 0 }}
              />
            </div>

            <Clock3 size={18} style={{ marginTop: 20, opacity: 0.6 }} />

            <div>
              <TinyText style={{ marginBottom: 5 }}>Окончание</TinyText>
              <TextInput
                type="time"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                style={{ width: '100%', minWidth: 0 }}
              />
            </div>
          </div>
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

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            marginTop: 18,
          }}
        >
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

          <ActionButton
            type="button"
            $variant="danger"
            onClick={() => onSave('')}
            style={{ gridColumn: '1 / -1' }}
          >
            <Eraser size={16} />
            Очистить ячейку
          </ActionButton>
        </div>

        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 12,
            border: '1px solid rgba(148,163,184,.28)',
          }}
        >
          <TinyText>
            Обычная смена считается как фактическая длительность минус 1 час
            перерыва. Для N используется специальное правило на 12 оплачиваемых
            часов.
          </TinyText>
        </div>
      </Drawer>
    </DrawerOverlay>
  );
}
