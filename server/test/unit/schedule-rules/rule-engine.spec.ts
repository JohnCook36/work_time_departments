import {
  RoleType,
  ScheduleRuleKind,
  ScheduleRuleScope,
  ScheduleRuleSeverity,
} from '@prisma/client';

import {
  buildManagedRulesetSnapshot,
  buildRulesVersion,
  ManagedScheduleRuleSnapshot,
  normalizeManagedRuleConfig,
  validateManagedScheduleRules,
} from '../../../src/schedule-rules/rule-engine';
import type { SchedulePublicationSnapshot } from '../../../src/schedules/schedule-publications.service';

function snapshot(): SchedulePublicationSnapshot {
  return {
    department: {
      id: 'department-a',
      name: 'Front Office',
      kind: 'FO',
    },
    employees: [
      {
        id: 'employee-1',
        displayName: 'Employee 1',
        employmentRate: 1,
        scheduleMode: 'FLEXIBLE',
        fixedStartTime: null,
        fixedEndTime: null,
        roles: [RoleType.EMPLOYEE],
      },
      {
        id: 'employee-2',
        displayName: 'Employee 2',
        employmentRate: 1,
        scheduleMode: 'FLEXIBLE',
        fixedStartTime: null,
        fixedEndTime: null,
        roles: [RoleType.DEPARTMENT_ADMIN],
      },
    ],
    shifts: [
      {
        id: 'shift-1',
        employeeId: 'employee-1',
        date: '2026-09-01',
        code: 'N',
        startTime: '20:00',
        endTime: '08:00',
        isOff: false,
        updatedAt: '2026-09-01T10:00:00.000Z',
      },
      {
        id: 'shift-2',
        employeeId: 'employee-2',
        date: '2026-09-01',
        code: 'E',
        startTime: '20:00',
        endTime: '08:00',
        isOff: false,
        updatedAt: '2026-09-01T10:00:00.000Z',
      },
    ],
  };
}

function rule(
  overrides: Partial<ManagedScheduleRuleSnapshot> = {},
): ManagedScheduleRuleSnapshot {
  return {
    id: 'rule-1',
    name: 'Rule',
    description: 'Rule description',
    kind: ScheduleRuleKind.MAX_CONCURRENT_EMPLOYEES,
    scope: ScheduleRuleScope.ORGANIZATION,
    scopeValue: null,
    departmentId: null,
    priority: 100,
    severity: ScheduleRuleSeverity.HARD,
    isActive: true,
    config: { maxConcurrent: 1 },
    violationMessage: 'Слишком много сотрудников одновременно.',
    version: 1,
    ...overrides,
  };
}

describe('managed schedule rule engine', () => {
  it('emits a hard violation when concurrent staffing exceeds the configured maximum', () => {
    const violations = validateManagedScheduleRules(
      snapshot(),
      [rule()],
      2026,
      9,
    );

    expect(violations).toEqual([
      expect.objectContaining({
        severity: 'hard',
        code: 'MANAGED_MAX_CONCURRENT_EMPLOYEES',
        date: '2026-09-01',
      }),
    ]);
    expect(violations[0].message).toContain('лимит: 1');
  });

  it('keeps a soft minimum-staff rule non-blocking and counts overnight coverage', () => {
    const violations = validateManagedScheduleRules(
      snapshot(),
      [
        rule({
          kind: ScheduleRuleKind.MIN_STAFF_AT_TIME,
          severity: ScheduleRuleSeverity.SOFT,
          config: { time: '07:00', minStaff: 2 },
          violationMessage: 'Недостаточно сотрудников.',
        }),
      ],
      2026,
      9,
    );

    expect(violations.every((violation) => violation.severity === 'soft')).toBe(
      true,
    );
    expect(
      violations.some((violation) => violation.date === '2026-09-02'),
    ).toBe(false);
    expect(
      violations.some((violation) => violation.date === '2026-09-03'),
    ).toBe(true);
  });

  it('ignores a department-scoped rule for a different department', () => {
    expect(
      validateManagedScheduleRules(
        snapshot(),
        [
          rule({
            scope: ScheduleRuleScope.DEPARTMENT,
            departmentId: 'department-b',
          }),
        ],
        2026,
        9,
      ),
    ).toEqual([]);
  });

  it('filters ROLE scope by employee roles stored in the publication snapshot', () => {
    const noViolation = validateManagedScheduleRules(
      snapshot(),
      [
        rule({
          scope: ScheduleRuleScope.ROLE,
          scopeValue: RoleType.EMPLOYEE,
        }),
      ],
      2026,
      9,
    );
    expect(noViolation).toEqual([]);

    const value = snapshot();
    value.employees[1].roles = [RoleType.EMPLOYEE];

    expect(
      validateManagedScheduleRules(
        value,
        [
          rule({
            scope: ScheduleRuleScope.ROLE,
            scopeValue: RoleType.EMPLOYEE,
          }),
        ],
        2026,
        9,
      ),
    ).toEqual([
      expect.objectContaining({
        code: 'MANAGED_MAX_CONCURRENT_EMPLOYEES',
      }),
    ]);
  });

  it('filters SHIFT_TYPE scope by persisted shift code', () => {
    expect(
      validateManagedScheduleRules(
        snapshot(),
        [
          rule({
            scope: ScheduleRuleScope.SHIFT_TYPE,
            scopeValue: 'N',
          }),
        ],
        2026,
        9,
      ),
    ).toEqual([]);
  });

  it('builds a stable rules version from normalized rule content and changes it when rule version changes', () => {
    const first = buildManagedRulesetSnapshot([rule()]);
    const same = buildManagedRulesetSnapshot([rule()]);
    const changed = buildManagedRulesetSnapshot([
      rule({ version: 2 }),
    ]);

    expect(buildRulesVersion(first)).toBe(buildRulesVersion(same));
    expect(buildRulesVersion(first)).toMatch(
      /^schedule-publication-rules-v1\+managed-[a-f0-9]{16}$/,
    );
    expect(buildRulesVersion(changed)).not.toBe(buildRulesVersion(first));
  });

  it('validates executable rule config shapes', () => {
    expect(
      normalizeManagedRuleConfig(
        ScheduleRuleKind.MAX_CONCURRENT_EMPLOYEES,
        { maxConcurrent: 5 },
      ),
    ).toEqual({ maxConcurrent: 5 });

    expect(() =>
      normalizeManagedRuleConfig(
        ScheduleRuleKind.MIN_STAFF_AT_TIME,
        { time: '7:00', minStaff: 1 },
      ),
    ).toThrow('MIN_STAFF_AT_TIME requires time HH:MM');
  });
});
