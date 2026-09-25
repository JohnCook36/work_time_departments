import type { AddressInfo } from 'node:net';

import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { RoleType } from '@prisma/client';
import { Test } from '@nestjs/testing';

import { AuthUserContext } from '../../../src/auth/auth.service';
import { AuthorizationService } from '../../../src/auth/authorization.service';
import { SessionAuthGuard } from '../../../src/auth/session-auth.guard';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { ScheduleAcknowledgementsService } from '../../../src/schedules/schedule-acknowledgements.service';
import { SchedulePublicationsService } from '../../../src/schedules/schedule-publications.service';
import { SchedulesController } from '../../../src/schedules/schedules.controller';
import { SchedulesService } from '../../../src/schedules/schedules.service';

describe('SchedulesController API validation', () => {
  const currentUser: AuthUserContext = {
    id: 'user-1',
    phoneE164: '+79991234567',
    employee: {
      id: 'employee-1',
      displayName: 'Employee',
      departmentId: 'department-a',
      departmentName: 'Department A',
      employmentRate: 1,
    },
    memberships: [
      {
        id: 'membership-1',
        role: RoleType.DEPARTMENT_ADMIN,
        departmentId: 'department-a',
      },
    ],
  };

  const transaction = {
    auditLog: { create: jest.fn() },
    department: { findMany: jest.fn() },
    employee: { findMany: jest.fn() },
    schedule: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    shift: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      upsert: jest.fn(),
      createMany: jest.fn(),
    },
  };

  const prisma = {
    employee: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };

  const assertCanAdministerDepartment = jest.fn();
  const assertCanAdministerDepartments = jest.fn();
  const authorization = {
    assertCanAdministerDepartment,
    assertCanAdministerDepartments,
    assertCapability: jest.fn(
      (user: AuthUserContext, _capability: unknown, departmentId: string) =>
        assertCanAdministerDepartment(user, departmentId),
    ),
    assertCapabilityForDepartments: jest.fn(
      (
        user: AuthUserContext,
        _capability: unknown,
        departmentIds: readonly string[],
      ) => assertCanAdministerDepartments(user, departmentIds),
    ),
  };

  const publications = {
    validateDepartmentSchedule: jest.fn(),
  };

  let app: INestApplication;
  let endpoint: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SchedulesController],
      providers: [
        SchedulesService,
        { provide: SchedulePublicationsService, useValue: publications },
        { provide: ScheduleAcknowledgementsService, useValue: {} },
        { provide: PrismaService, useValue: prisma },
        { provide: AuthorizationService, useValue: authorization },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest().authUser = currentUser;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address() as AddressInfo;
    endpoint = `http://127.0.0.1:${address.port}/schedule-data/department/entries`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.employee.findMany.mockResolvedValue([{ id: 'employee-1' }]);
    transaction.schedule.findUnique.mockResolvedValue({
      id: 'schedule-1',
      updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    });
    transaction.shift.findMany.mockResolvedValue([]);
    transaction.shift.upsert.mockResolvedValue({});
    transaction.schedule.update.mockResolvedValue({
      id: 'schedule-1',
      updatedAt: new Date('2026-09-01T12:00:00.000Z'),
    });
  });

  async function patchShift(startTime: string, endTime: string) {
    return fetch(endpoint, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        departmentId: 'department-a',
        year: 2026,
        month: 9,
        changes: [
          {
            employeeId: 'employee-1',
            day: 7,
            type: 'shift',
            startTime,
            endTime,
          },
        ],
      }),
    });
  }

  it('exposes scoped prepublish validation over HTTP', async () => {
    publications.validateDepartmentSchedule.mockResolvedValue({
      departmentId: 'department-a',
      period: { year: 2026, month: 9 },
      rulesVersion: 'schedule-publication-rules-v1',
      canPublish: false,
      violations: [
        {
          severity: 'hard',
          code: 'ZERO_DURATION_SHIFT',
          message: 'Время начала и окончания рабочей смены не может совпадать.',
          employeeId: 'employee-1',
          shiftId: 'shift-1',
          date: '2026-09-07',
        },
      ],
    });

    const url = endpoint.replace(
      '/department/entries',
      '/department/validation?departmentId=department-a&year=2026&month=9',
    );
    const response = await fetch(url);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        departmentId: 'department-a',
        canPublish: false,
        violations: [
          expect.objectContaining({
            severity: 'hard',
            code: 'ZERO_DURATION_SHIFT',
          }),
        ],
      }),
    );
    expect(publications.validateDepartmentSchedule).toHaveBeenCalledWith(
      currentUser,
      'department-a',
      2026,
      9,
    );
  });

  it('rejects a zero-duration shift through PATCH schedule-data', async () => {
    const response = await patchShift('08:00', '08:00');
    const body = (await response.json()) as { message?: string };

    expect(response.status).toBe(400);
    expect(body.message).toBe(
      'shift startTime and endTime must be different',
    );
    expect(prisma.employee.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('validates the fixed 5/2 endpoint and uses server department scope', async () => {
    const url = endpoint.replace('/department/entries', '/planner/fixed-weekdays');
    const invalid = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ year: 2026, month: 5, departmentIds: ['department-a', 'department-a'] }),
    });
    expect(invalid.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();

    transaction.department.findMany.mockResolvedValue([{ id: 'department-a' }]);
    transaction.employee.findMany.mockResolvedValue([]);
    const valid = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ year: 2026, month: 5, departmentIds: ['department-a'] }),
    });
    expect(valid.status).toBe(201);
    expect(await valid.json()).toEqual({ status: 'ok', created: 0 });
    expect(authorization.assertCanAdministerDepartments).toHaveBeenCalledWith(currentUser, ['department-a']);
  });

  it('returns a clear 409 when create intent targets an occupied employee/date', async () => {
    transaction.shift.findMany.mockResolvedValue([
      {
        id: 'shift-existing',
        employeeId: 'employee-1',
        date: new Date('2026-09-07T00:00:00.000Z'),
        code: 'E',
        startTime: '08:00',
        endTime: '17:00',
        isOff: false,
        updatedAt: new Date('2026-09-01T11:00:00.000Z'),
      },
    ]);

    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        departmentId: 'department-a',
        year: 2026,
        month: 9,
        changes: [
          {
            employeeId: 'employee-1',
            day: 7,
            type: 'shift',
            startTime: '10:00',
            endTime: '19:00',
            expectedUpdatedAt: null,
          },
        ],
      }),
    });
    const body = (await response.json()) as { message?: string };

    expect(response.status).toBe(409);
    expect(body.message).toBe(
      'Сотрудник уже запланирован на 07.09.2026: E · 08:00–17:00. Сначала измените или удалите существующую смену.',
    );
    expect(transaction.shift.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ['20:00', '08:00'],
    ['23:00', '05:00'],
  ])(
    'accepts an overnight shift from %s to %s through PATCH schedule-data',
    async (startTime, endTime) => {
      const response = await patchShift(startTime, endTime);

      expect(response.status).toBe(200);
      expect(transaction.shift.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ startTime, endTime }),
        }),
      );
    },
  );
});
