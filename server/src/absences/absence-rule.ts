import type { AbsenceType } from '@prisma/client';

import type {
  SchedulePublicationRuleViolation,
} from '../schedules/schedule-publication-rules';
import type { SchedulePublicationSnapshot } from '../schedules/schedule-publications.service';

export interface ActiveAbsenceForValidation {
  id: string;
  employeeId: string;
  type: AbsenceType;
  startDate: Date;
  endDate: Date;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function validateShiftAbsenceConflicts(
  snapshot: SchedulePublicationSnapshot,
  absences: ActiveAbsenceForValidation[],
): SchedulePublicationRuleViolation[] {
  if (absences.length === 0 || snapshot.shifts.length === 0) return [];

  const byEmployee = new Map<string, ActiveAbsenceForValidation[]>();
  for (const absence of absences) {
    const items = byEmployee.get(absence.employeeId) ?? [];
    items.push(absence);
    byEmployee.set(absence.employeeId, items);
  }

  const violations: SchedulePublicationRuleViolation[] = [];

  for (const shift of snapshot.shifts) {
    if (shift.isOff) continue;
    const employeeAbsences = byEmployee.get(shift.employeeId);
    if (!employeeAbsences?.length) continue;

    const conflict = employeeAbsences.find(absence => {
      const start = dateOnly(absence.startDate);
      const end = dateOnly(absence.endDate);
      return shift.date >= start && shift.date <= end;
    });
    if (!conflict) continue;

    violations.push({
      severity: 'hard',
      code: 'SHIFT_OVERLAPS_ABSENCE',
      message:
        'Рабочая смена пересекается с активным отсутствием сотрудника.',
      employeeId: shift.employeeId,
      shiftId: shift.id,
      date: shift.date,
    });
  }

  return violations;
}
