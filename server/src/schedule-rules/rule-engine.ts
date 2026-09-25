import { createHash } from 'node:crypto';

import {
  RoleType,
  ScheduleRuleKind,
  ScheduleRuleScope,
  ScheduleRuleSeverity,
} from '@prisma/client';

import {
  SCHEDULE_PUBLICATION_RULES_VERSION,
  SchedulePublicationRuleViolation,
} from '../schedules/schedule-publication-rules';
import type { SchedulePublicationSnapshot } from '../schedules/schedule-publications.service';

export interface ManagedScheduleRuleSnapshot {
  id: string;
  name: string;
  description: string;
  kind: ScheduleRuleKind;
  scope: ScheduleRuleScope;
  scopeValue: string | null;
  departmentId: string | null;
  priority: number;
  severity: ScheduleRuleSeverity;
  isActive: boolean;
  config: unknown;
  violationMessage: string;
  version: number;
}

export interface ManagedRulesetSnapshot {
  baselineVersion: string;
  managedRules: ManagedScheduleRuleSnapshot[];
}

interface WorkingInterval {
  start: number;
  end: number;
  shiftId: string;
  employeeId: string;
  date: string;
}

export interface HourlyCoveragePoint {
  date: string;
  time: string;
  count: number;
  employeeIds: string[];
  shiftIds: string[];
  minRequired: number | null;
  maxAllowed: number | null;
  status: 'below' | 'within' | 'above';
}

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const SHIFT_CODES = new Set(['E', 'IN', 'INN', 'L', 'N']);

function minutes(value: string): number {
  const [hours, mins] = value.split(':').map(Number);
  return hours * 60 + mins;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dateForDay(year: number, month: number, day: number): string {
  return (
    String(year) +
    '-' +
    String(month).padStart(2, '0') +
    '-' +
    String(day).padStart(2, '0')
  );
}

function severity(rule: ManagedScheduleRuleSnapshot): 'hard' | 'soft' {
  return rule.severity === ScheduleRuleSeverity.HARD ? 'hard' : 'soft';
}

function activeIntervalsAt(
  intervals: WorkingInterval[],
  minute: number,
): WorkingInterval[] {
  return intervals.filter(
    (interval) => interval.start <= minute && minute < interval.end,
  );
}

function absoluteMinuteDateTime(
  year: number,
  month: number,
  absoluteMinute: number,
): { date: string; time: string } {
  const value = new Date(Date.UTC(year, month - 1, 1, 0, absoluteMinute));
  return {
    date: value.toISOString().slice(0, 10),
    time: value.toISOString().slice(11, 16),
  };
}

function managedViolationFields(
  rule: ManagedScheduleRuleSnapshot,
  active: WorkingInterval[],
  expected: number,
  actual: number,
  time?: string,
) {
  const affectedEmployeeIds = Array.from(
    new Set(active.map((interval) => interval.employeeId)),
  ).sort();
  const affectedShiftIds = active.map((interval) => interval.shiftId).sort();

  return {
    ruleId: rule.id,
    ruleVersion: rule.version,
    ruleName: rule.name,
    expected,
    actual,
    ...(time ? { time } : {}),
    affectedEmployeeIds,
    affectedShiftIds,
    employeeId: affectedEmployeeIds[0],
    shiftId: affectedShiftIds[0],
  };
}

function scopedEmployeeIds(
  rule: ManagedScheduleRuleSnapshot,
  snapshot: SchedulePublicationSnapshot,
): Set<string> | null {
  if (rule.scope !== ScheduleRuleScope.ROLE) return null;
  const role = rule.scopeValue as RoleType | null;
  if (!role || !Object.values(RoleType).includes(role)) return new Set();

  return new Set(
    snapshot.employees
      .filter((employee) => employee.roles?.includes(role))
      .map((employee) => employee.id),
  );
}

function intervalsForRule(
  rule: ManagedScheduleRuleSnapshot,
  snapshot: SchedulePublicationSnapshot,
): WorkingInterval[] {
  const employeeIds = scopedEmployeeIds(rule, snapshot);

  return snapshot.shifts
    .filter((shift) => {
      if (
        shift.isOff ||
        !shift.startTime ||
        !shift.endTime ||
        !TIME_PATTERN.test(shift.startTime) ||
        !TIME_PATTERN.test(shift.endTime)
      ) {
        return false;
      }
      if (employeeIds && !employeeIds.has(shift.employeeId)) return false;
      if (
        rule.scope === ScheduleRuleScope.SHIFT_TYPE &&
        shift.code !== rule.scopeValue
      ) {
        return false;
      }
      return true;
    })
    .map((shift) => {
      const day = Number(shift.date.slice(8, 10));
      const base = (day - 1) * 1440;
      const start = base + minutes(shift.startTime!);
      let end = base + minutes(shift.endTime!);
      if (end <= start) end += 1440;
      return {
        start,
        end,
        shiftId: shift.id,
        employeeId: shift.employeeId,
        date: shift.date,
      };
    });
}

function maxConcurrentViolation(
  rule: ManagedScheduleRuleSnapshot,
  snapshot: SchedulePublicationSnapshot,
): SchedulePublicationRuleViolation[] {
  const config = rule.config as { maxConcurrent?: unknown } | null;
  const maxConcurrent = config?.maxConcurrent;
  if (
    typeof maxConcurrent !== 'number' ||
    !Number.isInteger(maxConcurrent) ||
    maxConcurrent < 1
  ) {
    return [];
  }

  const intervals = intervalsForRule(rule, snapshot);
  const events = intervals.flatMap((interval) => [
    { at: interval.start, delta: 1 as const, interval },
    { at: interval.end, delta: -1 as const, interval },
  ]);
  events.sort((a, b) => a.at - b.at || a.delta - b.delta);

  const active = new Map<string, WorkingInterval>();
  for (const event of events) {
    if (event.delta < 0) {
      active.delete(event.interval.shiftId);
      continue;
    }

    active.set(event.interval.shiftId, event.interval);
    if (active.size <= maxConcurrent) continue;

    const affected = Array.from(active.values());
    const at = absoluteMinuteDateTime(
      Number(snapshot.shifts[0]?.date.slice(0, 4) ?? new Date().getUTCFullYear()),
      Number(snapshot.shifts[0]?.date.slice(5, 7) ?? 1),
      event.at,
    );
    return [
      {
        severity: severity(rule),
        code: 'MANAGED_MAX_CONCURRENT_EMPLOYEES',
        message:
          rule.violationMessage +
          ' Одновременно: ' +
          active.size +
          ', лимит: ' +
          maxConcurrent +
          '.',
        date: at.date,
        ...managedViolationFields(
          rule,
          affected,
          maxConcurrent,
          active.size,
          at.time,
        ),
      },
    ];
  }

  return [];
}

function minStaffAtTimeViolations(
  rule: ManagedScheduleRuleSnapshot,
  snapshot: SchedulePublicationSnapshot,
  year: number,
  month: number,
): SchedulePublicationRuleViolation[] {
  const config = rule.config as {
    time?: unknown;
    minStaff?: unknown;
  } | null;
  const time = config?.time;
  const minStaff = config?.minStaff;

  if (
    typeof time !== 'string' ||
    !TIME_PATTERN.test(time) ||
    typeof minStaff !== 'number' ||
    !Number.isInteger(minStaff) ||
    minStaff < 1
  ) {
    return [];
  }

  const intervals = intervalsForRule(rule, snapshot);
  const timeMinutes = minutes(time);
  const violations: SchedulePublicationRuleViolation[] = [];

  for (let day = 1; day <= daysInMonth(year, month); day++) {
    const targetMinute = (day - 1) * 1440 + timeMinutes;
    const active = activeIntervalsAt(intervals, targetMinute);

    if (active.length >= minStaff) continue;

    violations.push({
      severity: severity(rule),
      code: 'MANAGED_MIN_STAFF_AT_TIME',
      message:
        rule.violationMessage +
        ' ' +
        dateForDay(year, month, day) +
        ' в ' +
        time +
        ': ' +
        active.length +
        ' из ' +
        minStaff +
        '.',
      date: dateForDay(year, month, day),
      ...managedViolationFields(rule, active, minStaff, active.length, time),
    });
  }

  return violations;
}

export function buildHourlyCoverage(
  snapshot: SchedulePublicationSnapshot,
  rules: ManagedScheduleRuleSnapshot[],
  year: number,
  month: number,
): HourlyCoveragePoint[] {
  if (snapshot.department.kind !== 'FO') return [];

  const baseRule: ManagedScheduleRuleSnapshot = {
    id: 'coverage-projection',
    name: 'Coverage projection',
    description: '',
    kind: ScheduleRuleKind.MAX_CONCURRENT_EMPLOYEES,
    scope: ScheduleRuleScope.DEPARTMENT,
    scopeValue: null,
    departmentId: snapshot.department.id,
    priority: 0,
    severity: ScheduleRuleSeverity.SOFT,
    isActive: true,
    config: { maxConcurrent: 100 },
    violationMessage: '',
    version: 1,
  };
  const intervals = intervalsForRule(baseRule, snapshot);
  const applicable = rules.filter(
    (rule) =>
      rule.isActive &&
      (rule.scope !== ScheduleRuleScope.DEPARTMENT ||
        rule.departmentId === snapshot.department.id),
  );

  const maxRules = applicable.filter(
    (rule) =>
      rule.kind === ScheduleRuleKind.MAX_CONCURRENT_EMPLOYEES &&
      typeof (rule.config as { maxConcurrent?: unknown } | null)?.maxConcurrent ===
        'number',
  );
  const minimumRules = applicable.filter(
    (rule) =>
      rule.kind === ScheduleRuleKind.MIN_STAFF_AT_TIME &&
      typeof (rule.config as { time?: unknown; minStaff?: unknown } | null)
        ?.time === 'string' &&
      typeof (rule.config as { time?: unknown; minStaff?: unknown } | null)
        ?.minStaff === 'number',
  );

  const result: HourlyCoveragePoint[] = [];
  for (let day = 1; day <= daysInMonth(year, month); day++) {
    for (let hour = 0; hour < 24; hour++) {
      const targetMinute = (day - 1) * 1440 + hour * 60;
      const active = activeIntervalsAt(intervals, targetMinute);
      const time = String(hour).padStart(2, '0') + ':00';

      const maxAllowedValues = maxRules
        .map(
          (rule) =>
            (rule.config as { maxConcurrent?: number }).maxConcurrent ?? null,
        )
        .filter((value): value is number => value !== null);
      const minRequiredValues = minimumRules
        .filter(
          (rule) =>
            (rule.config as { time?: string }).time === time,
        )
        .map(
          (rule) => (rule.config as { minStaff?: number }).minStaff ?? null,
        )
        .filter((value): value is number => value !== null);

      const maxAllowed =
        maxAllowedValues.length > 0 ? Math.min(...maxAllowedValues) : null;
      const minRequired =
        minRequiredValues.length > 0 ? Math.max(...minRequiredValues) : null;
      const count = active.length;
      const status =
        maxAllowed !== null && count > maxAllowed
          ? 'above'
          : minRequired !== null && count < minRequired
            ? 'below'
            : 'within';

      result.push({
        date: dateForDay(year, month, day),
        time,
        count,
        employeeIds: Array.from(
          new Set(active.map((interval) => interval.employeeId)),
        ).sort(),
        shiftIds: active.map((interval) => interval.shiftId).sort(),
        minRequired,
        maxAllowed,
        status,
      });
    }
  }

  return result;
}

export function validateManagedScheduleRules(
  snapshot: SchedulePublicationSnapshot,
  rules: ManagedScheduleRuleSnapshot[],
  year: number,
  month: number,
): SchedulePublicationRuleViolation[] {
  const applicable = rules
    .filter((rule) => rule.isActive)
    .filter(
      (rule) =>
        rule.scope !== ScheduleRuleScope.DEPARTMENT ||
        rule.departmentId === snapshot.department.id,
    )
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));

  return applicable.flatMap((rule) => {
    if (rule.kind === ScheduleRuleKind.MAX_CONCURRENT_EMPLOYEES) {
      return maxConcurrentViolation(rule, snapshot);
    }
    if (rule.kind === ScheduleRuleKind.MIN_STAFF_AT_TIME) {
      return minStaffAtTimeViolations(rule, snapshot, year, month);
    }
    return [];
  });
}

export function buildManagedRulesetSnapshot(
  rules: ManagedScheduleRuleSnapshot[],
): ManagedRulesetSnapshot {
  const managedRules = rules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    description: rule.description,
    kind: rule.kind,
    scope: rule.scope,
    scopeValue: rule.scopeValue,
    departmentId: rule.departmentId,
    priority: rule.priority,
    severity: rule.severity,
    isActive: rule.isActive,
    config: rule.config,
    violationMessage: rule.violationMessage,
    version: rule.version,
  }));

  managedRules.sort(
    (a, b) => b.priority - a.priority || a.id.localeCompare(b.id),
  );

  return {
    baselineVersion: SCHEDULE_PUBLICATION_RULES_VERSION,
    managedRules,
  };
}

export function buildRulesVersion(
  ruleset: ManagedRulesetSnapshot,
): string {
  if (ruleset.managedRules.length === 0) {
    return ruleset.baselineVersion;
  }

  const digest = createHash('sha256')
    .update(JSON.stringify(ruleset))
    .digest('hex')
    .slice(0, 16);

  return ruleset.baselineVersion + '+managed-' + digest;
}

export function normalizeManagedRuleConfig(
  kind: ScheduleRuleKind,
  value: unknown,
): Record<string, string | number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('config must be an object');
  }

  const config = value as Record<string, unknown>;
  if (kind === ScheduleRuleKind.MAX_CONCURRENT_EMPLOYEES) {
    const maxConcurrent = config.maxConcurrent;
    if (
      typeof maxConcurrent !== 'number' ||
      !Number.isInteger(maxConcurrent) ||
      maxConcurrent < 1 ||
      maxConcurrent > 100
    ) {
      throw new Error('maxConcurrent must be an integer between 1 and 100');
    }
    return { maxConcurrent };
  }

  const time = config.time;
  const minStaff = config.minStaff;
  if (
    typeof time !== 'string' ||
    !TIME_PATTERN.test(time) ||
    typeof minStaff !== 'number' ||
    !Number.isInteger(minStaff) ||
    minStaff < 1 ||
    minStaff > 100
  ) {
    throw new Error(
      'MIN_STAFF_AT_TIME requires time HH:MM and minStaff integer 1..100',
    );
  }

  return { time, minStaff };
}

export function normalizeRuleScopeValue(
  scope: ScheduleRuleScope,
  value: unknown,
): string | null {
  if (scope === ScheduleRuleScope.ORGANIZATION) return null;
  if (scope === ScheduleRuleScope.DEPARTMENT) return null;

  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('scopeValue is required for ROLE and SHIFT_TYPE rules');
  }

  const normalized = value.trim().toUpperCase();
  if (
    scope === ScheduleRuleScope.ROLE &&
    !Object.values(RoleType).includes(normalized as RoleType)
  ) {
    throw new Error('scopeValue must be a valid RoleType');
  }
  if (
    scope === ScheduleRuleScope.SHIFT_TYPE &&
    !SHIFT_CODES.has(normalized)
  ) {
    throw new Error('scopeValue must be a supported shift code');
  }

  return normalized;
}
