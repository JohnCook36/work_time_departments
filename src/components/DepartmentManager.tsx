import { Department, DepartmentKind, Employee } from '../types';
import { UNGROUPED_ID } from '../plannerStorage';

interface Props {
  departments: Department[];
  employees: Employee[];
  newDepartmentName: string;
  onNewDepartmentName: (value: string) => void;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<Department>) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
}

export default function DepartmentManager({
  departments,
  employees,
  newDepartmentName,
  onNewDepartmentName,
  onAdd,
  onUpdate,
  onMove,
  onRemove,
}: Props) {
  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:mb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-800">Отделы и группы сотрудников</h2>
          <p className="text-xs text-slate-500">Создавайте группы здесь, затем перетаскивайте сотрудников между ними прямо в таблице.</p>
        </div>
        <div className="flex min-w-[300px] flex-1 justify-end gap-2">
          <input
            value={newDepartmentName}
            onChange={event => onNewDepartmentName(event.target.value)}
            onKeyDown={event => event.key === 'Enter' && onAdd()}
            placeholder="Название нового отдела"
            className="max-w-[320px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button onClick={onAdd} className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900">+ Отдел</button>
        </div>
      </div>

      <div className="grid gap-2 xl:grid-cols-2">
        {departments.map((department, index) => {
          const count = employees.filter(employee => employee.departmentId === department.id).length;
          return (
            <div key={department.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
              <div className="flex items-center gap-1">
                <button onClick={() => onMove(department.id, -1)} disabled={index === 0} className="h-8 w-8 rounded-lg bg-white text-slate-500 shadow-sm disabled:opacity-30" title="Выше">↑</button>
                <button onClick={() => onMove(department.id, 1)} disabled={index === departments.length - 1} className="h-8 w-8 rounded-lg bg-white text-slate-500 shadow-sm disabled:opacity-30" title="Ниже">↓</button>
              </div>
              <input
                value={department.name}
                onChange={event => onUpdate(department.id, { name: event.target.value })}
                className="min-w-[150px] flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium"
              />
              <select
                value={department.kind}
                onChange={event => onUpdate(department.id, { kind: event.target.value as DepartmentKind })}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
              >
                <option value="generic">Обычный</option>
                <option value="fo">FO</option>
                <option value="night">Night</option>
              </select>
              <span className="min-w-[54px] text-center text-xs text-slate-500">{count} чел.</span>
              <button
                onClick={() => onRemove(department.id)}
                disabled={department.id === UNGROUPED_ID}
                className="h-8 rounded-lg px-2 text-xs text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
              >Удалить</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
