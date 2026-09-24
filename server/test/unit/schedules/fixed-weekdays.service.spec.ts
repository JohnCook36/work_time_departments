import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EmployeeScheduleMode, RoleType } from '@prisma/client';

import { AuthUserContext } from '../../../src/auth/auth.service';
import { AuthorizationService } from '../../../src/auth/authorization.service';
import { SchedulesService } from '../../../src/schedules/schedules.service';

const departmentId = 'department-a';
const admin: AuthUserContext = {
  id: 'admin', phoneE164: '+79990000000', employee: null,
  memberships: [{ id: 'membership', role: RoleType.DEPARTMENT_ADMIN, departmentId }],
};

describe('fixed 5/2 schedule persistence', () => {
  const saved = new Map<string, { id: string; startTime: string | null; endTime: string | null; isOff: boolean }>();
  const employees = [
    { id: 'fixed', fixedStartTime: '08:00', fixedEndTime: '17:00' },
  ];
  const tx = {
    department: { findMany: jest.fn().mockResolvedValue([{ id: departmentId }]) },
    employee: { findMany: jest.fn().mockImplementation(async () => employees) },
    schedule: {
      upsert: jest.fn().mockResolvedValue({ id: 'schedule-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    shift: {
      createMany: jest.fn().mockImplementation(async ({ data }: { data: Array<{ employeeId: string; date: Date; startTime: string; endTime: string }> }) => {
        let count = 0;
        for (const row of data) {
          const key = `${row.employeeId}:${row.date.toISOString().slice(0, 10)}`;
          if (saved.has(key)) continue;
          saved.set(key, { id: `shift-${saved.size + 1}`, startTime: row.startTime, endTime: row.endTime, isOff: false });
          count++;
        }
        return { count };
      }),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    },
  };
  const prisma = { $transaction: jest.fn().mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) };
  const service = new SchedulesService(prisma as never, new AuthorizationService());

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-30T12:00:00Z'));
    saved.clear();
    employees.splice(0, employees.length, { id: 'fixed', fixedStartTime: '08:00', fixedEndTime: '17:00' });
    jest.clearAllMocks();
    tx.department.findMany.mockResolvedValue([{ id: departmentId }]);
  });
  afterEach(() => jest.useRealTimers());

  it('creates real IDs on working days, respects holidays and transfers, and stays idempotent', async () => {
    const first = await service.materializeFixedWeekdays(admin, 2026, 5, [departmentId]);
    expect(first.created).toBeGreaterThan(0);
    expect(tx.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ scheduleMode: EmployeeScheduleMode.FIXED_WEEKDAYS, isActive: true }),
    }));
    expect(saved.has('fixed:2026-05-01')).toBe(false);
    expect(saved.has('fixed:2026-05-02')).toBe(false);
    expect(saved.has('fixed:2026-05-11')).toBe(false);
    expect(saved.get('fixed:2026-05-04')).toEqual({ id: expect.stringMatching(/^shift-/), startTime: '08:00', endTime: '17:00', isOff: false });
    expect(tx.shift.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    const original = new Map(saved);
    expect(await service.materializeFixedWeekdays(admin, 2026, 5, [departmentId])).toEqual({ status: 'ok', created: 0 });
    expect(saved).toEqual(original);
  });

  it('preserves explicit OFF and manual shifts including their IDs and times', async () => {
    const off = { id: 'off-1', startTime: null, endTime: null, isOff: true };
    const manual = { id: 'manual-1', startTime: '11:00', endTime: '20:00', isOff: false };
    saved.set('fixed:2026-05-04', off);
    saved.set('fixed:2026-05-05', manual);
    await service.materializeFixedWeekdays(admin, 2026, 5, [departmentId]);
    expect(saved.get('fixed:2026-05-04')).toBe(off);
    expect(saved.get('fixed:2026-05-05')).toBe(manual);
  });

  it('does not create shifts for flexible employees or past days', async () => {
    employees.splice(0);
    expect(await service.materializeFixedWeekdays(admin, 2026, 5, [departmentId])).toEqual({ status: 'ok', created: 0 });
    expect(tx.schedule.upsert).not.toHaveBeenCalled();
    employees.push({ id: 'fixed', fixedStartTime: '08:00', fixedEndTime: '17:00' });
    expect(await service.materializeFixedWeekdays(admin, 2026, 3, [departmentId])).toEqual({ status: 'ok', created: 0 });
    expect(tx.shift.createMany).not.toHaveBeenCalled();
  });

  it('restricts writes to administered, active departments and rejects invalid input', async () => {
    await expect(service.materializeFixedWeekdays({ ...admin, memberships: [{ id: 'deputy', role: RoleType.DEPUTY, departmentId }] }, 2026, 5, [departmentId])).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.materializeFixedWeekdays(admin, 2026, 5, ['department-b'])).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.materializeFixedWeekdays(admin, 2026, 5, [departmentId, departmentId])).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
