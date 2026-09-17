import { Employee, ScheduleData } from '../types';
import { makeDateKey } from '../utils';

interface Props {
  schedule: ScheduleData;
  employees: Employee[];
  year: number;
  month: number;
  daysInMonth: number;
}

export default function ErrorPanel({ schedule, employees, year, month, daysInMonth }: Props) {
  const errors: { empName: string; day: number; error: string }[] = [];
  employees.forEach(employee => {
    for (let day = 1; day <= daysInMonth; day++) {
      const entry = schedule[employee.id]?.[makeDateKey(year, month, day)];
      if (entry?.type === 'error') {
        errors.push({ empName: employee.name, day, error: entry.error || 'Ошибка' });
      }
    }
  });
  if (!errors.length) return null;
  return (
    <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
      <h3 className="mb-2 font-semibold text-red-800">⚠️ Ошибки в заполнении ({errors.length})</h3>
      <ul className="space-y-1 text-sm text-red-700">
        {errors.map((error, index) => (
          <li key={`${error.empName}-${error.day}-${index}`}><strong>{error.empName}</strong> → {error.day}: {error.error}</li>
        ))}
      </ul>
    </div>
  );
}
