import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { RoleType } from '@prisma/client';

import type { AuthUserContext } from '../../../src/auth/auth.service';
import { AuthorizationService } from '../../../src/auth/authorization.service';
import { AttendanceService } from '../../../src/attendance/attendance.service';
import { issueAttendanceToken } from '../../../src/attendance/attendance-token';

describe('AttendanceService boundaries', () => {
  const original = process.env.ATTENDANCE_QR_SECRET;
  const user: AuthUserContext = {
    id: 'employee-user', phoneE164: '+79990001001', employee: null, memberships: [],
  };
  const manager: AuthUserContext = {
    id: 'manager-user', phoneE164: '+79990001002', employee: null,
    memberships: [{ id: 'membership-1', role: RoleType.DEPARTMENT_ADMIN, departmentId: 'department-a', permissions: [] }],
  };
  const tx = {
    employee: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    department: { findFirst: jest.fn() },
    workSession: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() },
  };
  const prisma = { ...tx, $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) };
  const service = new AttendanceService(prisma as never, new AuthorizationService());

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ATTENDANCE_QR_SECRET = 'unit-attendance-test-secret-at-least-32-characters';
  });
  afterAll(() => {
    if (original === undefined) delete process.env.ATTENDANCE_QR_SECRET;
    else process.env.ATTENDANCE_QR_SECRET = original;
  });

  it('rejects invalid ranges before any employee or session query', async () => {
    await expect(service.mine(user, '2026-09-31', '2026-09-31'))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.mine(user, '2026-09-01', '2026-10-02'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.employee.findFirst).not.toHaveBeenCalled();
  });

  it('checks current membership before issuing a QR or reading department attendance', async () => {
    tx.user.findUnique.mockResolvedValue({ isActive: true, memberships: [] });
    await expect(service.issueQr(manager, 'department-a')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.department(manager, 'department-a', '2026-09-01', '2026-09-01'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.department.findFirst).not.toHaveBeenCalled();
    expect(tx.workSession.findMany).not.toHaveBeenCalled();
  });

  it('rejects a foreign department QR before writing a session', async () => {
    tx.employee.findFirst.mockResolvedValue({ id: 'employee-a', departmentId: 'department-a' });
    const { token } = issueAttendanceToken('department-b');
    await expect(service.checkIn(user, token)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tx.workSession.create).not.toHaveBeenCalled();
  });
});
