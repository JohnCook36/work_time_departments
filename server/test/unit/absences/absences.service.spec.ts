import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AbsenceType, AuditAction, AuditEntityType } from '@prisma/client';

import type { AuthUserContext } from '../../../src/auth/auth.service';
import { AbsencesService } from '../../../src/absences/absences.service';

function admin(): AuthUserContext {
  return {
    id: 'admin-1',
    phoneE164: '+79990000001',
    employee: null,
    memberships: [],
  };
}

describe('AbsencesService', () => {
  const tx = {
    absence: {
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    auditLog: { create: jest.fn() },
    user: { findUnique: jest.fn() },
  };

  const prisma = {
    department: { findFirst: jest.fn() },
    employee: { findFirst: jest.fn() },
    absence: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
  };

  const authorization = {
    assertCapability: jest.fn(),
  };

  const service = new AbsencesService(
    prisma as never,
    authorization as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.employee.findFirst.mockResolvedValue({
      id: 'employee-1',
      departmentId: 'department-a',
    });
    tx.absence.findFirst.mockResolvedValue(null);
    tx.absence.create.mockResolvedValue({
      id: 'absence-1',
      employeeId: 'employee-1',
      type: AbsenceType.VACATION,
      startDate: new Date('2026-09-10T00:00:00.000Z'),
      endDate: new Date('2026-09-12T00:00:00.000Z'),
      comment: 'Отпуск',
      canceledAt: null,
      createdAt: new Date('2026-09-01T10:00:00.000Z'),
      updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    });
    tx.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    tx.user.findUnique.mockResolvedValue({
      isActive: true,
      memberships: [
        {
          id: 'membership-a',
          role: 'DEPARTMENT_ADMIN',
          departmentId: 'department-a',
          permissions: [],
        },
      ],
    });
    authorization.assertCapability.mockImplementation(
      (user: AuthUserContext) => {
        if (user.memberships.length === 0) {
          throw new ForbiddenException(
            'You do not have permission to perform this action',
          );
        }
      },
    );
  });

  it('creates a scoped structured absence and audits no comment content', async () => {
    const result = await service.create(admin(), {
      employeeId: 'employee-1',
      type: 'VACATION',
      startDate: '2026-09-10',
      endDate: '2026-09-12',
      comment: ' Отпуск ',
    });

    expect(authorization.assertCapability).toHaveBeenCalled();
    expect(tx.absence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employeeId: 'employee-1',
          type: AbsenceType.VACATION,
          comment: 'Отпуск',
          createdByUserId: 'admin-1',
          updatedByUserId: 'admin-1',
        }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'admin-1',
        action: AuditAction.ABSENCE_CREATED,
        entityType: AuditEntityType.ABSENCE,
        entityId: 'absence-1',
        departmentId: 'department-a',
      },
      select: { id: true },
    });
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain('Отпуск');
    expect(result).toEqual(
      expect.objectContaining({
        id: 'absence-1',
        startDate: '2026-09-10',
        endDate: '2026-09-12',
        status: 'ACTIVE',
      }),
    );
  });

  it('rejects free text for SICK to avoid medical detail storage', async () => {
    await expect(
      service.create(admin(), {
        employeeId: 'employee-1',
        type: 'SICK',
        startDate: '2026-09-10',
        endDate: '2026-09-10',
        comment: 'diagnosis-like detail',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.absence.create).not.toHaveBeenCalled();
  });

  it('rejects inverted date ranges', async () => {
    await expect(
      service.create(admin(), {
        employeeId: 'employee-1',
        type: 'TRAINING',
        startDate: '2026-09-12',
        endDate: '2026-09-10',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects exact active duplicates', async () => {
    tx.absence.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(
      service.create(admin(), {
        employeeId: 'employee-1',
        type: 'VACATION',
        startDate: '2026-09-10',
        endDate: '2026-09-12',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('clears an existing comment when absence type changes to SICK', async () => {
    prisma.absence.findUnique.mockResolvedValue({
      id: 'absence-1',
      employeeId: 'employee-1',
      type: AbsenceType.VACATION,
      startDate: new Date('2026-09-10T00:00:00.000Z'),
      endDate: new Date('2026-09-12T00:00:00.000Z'),
      comment: 'Old work note',
      canceledAt: null,
      updatedAt: new Date('2026-09-01T10:00:00.000Z'),
      employee: { departmentId: 'department-a', isActive: true },
    });
    tx.absence.updateMany.mockResolvedValue({ count: 1 });
    tx.absence.findUniqueOrThrow.mockResolvedValue({
      id: 'absence-1',
      employeeId: 'employee-1',
      type: AbsenceType.SICK,
      startDate: new Date('2026-09-10T00:00:00.000Z'),
      endDate: new Date('2026-09-12T00:00:00.000Z'),
      comment: null,
      canceledAt: null,
      createdAt: new Date('2026-09-01T09:00:00.000Z'),
      updatedAt: new Date('2026-09-01T11:00:00.000Z'),
    });

    await service.update(admin(), 'absence-1', {
      type: 'SICK',
      expectedUpdatedAt: '2026-09-01T10:00:00.000Z',
    });

    expect(tx.absence.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AbsenceType.SICK,
          comment: null,
        }),
      }),
    );
  });

  it('rejects update when current schedule-edit scope was revoked', async () => {
    prisma.absence.findUnique.mockResolvedValue({
      id: 'absence-1',
      employeeId: 'employee-1',
      type: AbsenceType.VACATION,
      startDate: new Date('2026-09-10T00:00:00.000Z'),
      endDate: new Date('2026-09-12T00:00:00.000Z'),
      comment: null,
      canceledAt: null,
      updatedAt: new Date('2026-09-01T10:00:00.000Z'),
      employee: { departmentId: 'department-a', isActive: true },
    });
    tx.user.findUnique.mockResolvedValueOnce({
      isActive: true,
      memberships: [],
    });

    await expect(
      service.update(admin(), 'absence-1', {
        endDate: '2026-09-13',
        expectedUpdatedAt: '2026-09-01T10:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(tx.absence.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('uses optimistic locking when updating', async () => {
    prisma.absence.findUnique.mockResolvedValue({
      id: 'absence-1',
      employeeId: 'employee-1',
      type: AbsenceType.VACATION,
      startDate: new Date('2026-09-10T00:00:00.000Z'),
      endDate: new Date('2026-09-12T00:00:00.000Z'),
      comment: null,
      canceledAt: null,
      updatedAt: new Date('2026-09-01T10:00:00.000Z'),
      employee: { departmentId: 'department-a', isActive: true },
    });
    tx.absence.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update(admin(), 'absence-1', {
        endDate: '2026-09-13',
        expectedUpdatedAt: '2026-09-01T09:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
