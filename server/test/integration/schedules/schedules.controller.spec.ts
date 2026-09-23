import type { AddressInfo } from 'node:net';

import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { RoleType } from '@prisma/client';
import { Test } from '@nestjs/testing';

import { AuthUserContext } from '../../../src/auth/auth.service';
import { AuthorizationService } from '../../../src/auth/authorization.service';
import { SessionAuthGuard } from '../../../src/auth/session-auth.guard';
import { PrismaService } from '../../../src/prisma/prisma.service';
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
    schedule: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    shift: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      upsert: jest.fn(),
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

  const authorization = {
    assertCanAdministerDepartment: jest.fn(),
  };

  let app: INestApplication;
  let endpoint: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SchedulesController],
      providers: [
        SchedulesService,
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
