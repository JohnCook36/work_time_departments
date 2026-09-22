import { useMemo, useState } from 'react';
import { MessageSquare, Plus, Trash2, X } from 'lucide-react';
import { Employee, EmployeeWish } from './types';
import { MONTH_NAMES } from './utils';
import {
  ActionButton,
  Drawer,
  DrawerHeader,
  DrawerOverlay,
  DrawerSubtitle,
  DrawerTitle,
  EmptyState,
  FormGroup,
  FormLabel,
  IconButton,
  QuickChip,
  QuickChips,
  Select,
  TextArea,
  WishCard,
  WishDay,
  WishList,
  WishText,
} from './styles';

interface EmployeeWishDrawerProps {
  employee: Employee;
  year: number;
  month: number;
  daysInMonth: number;
  wishes: EmployeeWish[];
  busy?: boolean;
  onAdd: (wish: Omit<EmployeeWish, 'id'>) => void;
  onRemove: (wishId: string) => void;
  onClose: () => void;
}

const QUICK_TEMPLATES = [
  'Желательно выходной',
  'Могу выйти с 10:00',
  'Не ставить смену',
  'Первая половина дня',
  'Вторая половина дня',
];

export function EmployeeWishDrawer({
  employee,
  year,
  month,
  daysInMonth,
  wishes,
  busy = false,
  onAdd,
  onRemove,
  onClose,
}: EmployeeWishDrawerProps) {
  const [selectedDay, setSelectedDay] = useState<string>('general');
  const [text, setText] = useState('');

  const sortedWishes = useMemo(
    () =>
      [...wishes].sort((a, b) => {
        if (a.day === null && b.day !== null) return -1;
        if (a.day !== null && b.day === null) return 1;
        return (a.day || 0) - (b.day || 0);
      }),
    [wishes]
  );

  const addWish = () => {
    const normalized = text.trim();
    if (!normalized) return;

    onAdd({
      day: selectedDay === 'general' ? null : Number(selectedDay),
      text: normalized,
    });

    setText('');
  };

  return (
    <DrawerOverlay onMouseDown={onClose}>
      <Drawer onMouseDown={(event) => event.stopPropagation()}>
        <DrawerHeader>
          <div>
            <DrawerTitle>Пожелания сотрудника</DrawerTitle>
            <DrawerSubtitle>
              {employee.name} • {MONTH_NAMES[month]} {year}
            </DrawerSubtitle>
          </div>
          <IconButton type="button" onClick={onClose} title="Закрыть">
            <X size={18} />
          </IconButton>
        </DrawerHeader>

        <FormGroup>
          <FormLabel>К какому дню относится пожелание</FormLabel>
          <Select
            value={selectedDay}
            disabled={busy}
            onChange={(event) => setSelectedDay(event.target.value)}
            style={{ width: '100%' }}
          >
            <option value="general">Общее пожелание на месяц</option>
            {Array.from({ length: daysInMonth }, (_, index) => index + 1).map(
              (day) => (
                <option key={day} value={day}>
                  {day} {MONTH_NAMES[month].toLowerCase()}
                </option>
              )
            )}
          </Select>
        </FormGroup>

        <FormGroup>
          <FormLabel>Пожелание</FormLabel>
          <TextArea
            value={text}
            disabled={busy}
            onChange={(event) => setText(event.target.value)}
            placeholder="Например: выходной 22-го; 27-го только первая половина дня; во вторник могу с 18:00..."
          />
          <QuickChips>
            {QUICK_TEMPLATES.map((template) => (
              <QuickChip
                key={template}
                type="button"
                disabled={busy}
                onClick={() => setText(template)}
              >
                {template}
              </QuickChip>
            ))}
          </QuickChips>
        </FormGroup>

        <ActionButton
          type="button"
          $variant="primary"
          onClick={addWish}
          disabled={busy || !text.trim()}
          style={{ width: '100%' }}
        >
          <Plus size={16} />
          Добавить пожелание
        </ActionButton>

        <WishList>
          {sortedWishes.length === 0 ? (
            <EmptyState>
              <MessageSquare
                size={26}
                style={{ margin: '0 auto 8px', opacity: 0.55 }}
              />
              Пожеланий на этот месяц пока нет.
            </EmptyState>
          ) : (
            sortedWishes.map((wish) => (
              <WishCard key={wish.id}>
                <WishDay>{wish.day === null ? 'Общее' : String(wish.day)}</WishDay>
                <WishText>{wish.text}</WishText>
                <IconButton
                  type="button"
                  disabled={busy}
                  onClick={() => onRemove(wish.id)}
                  title="Удалить пожелание"
                  style={{ width: 30, height: 30 }}
                >
                  <Trash2 size={14} />
                </IconButton>
              </WishCard>
            ))
          )}
        </WishList>
      </Drawer>
    </DrawerOverlay>
  );
}
