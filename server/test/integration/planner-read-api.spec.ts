import type { AddressInfo } from 'node:net';

import {
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { RoleType } from '@prisma/client';
import { Test } from '@nestjs/testing';

import { AuthService, AuthUserContext } from '../../src/auth/auth.service';
import { AuthorizationService } from '../../src/auth/authorization.service';
import { SessionAuthGuard } from '../../src/auth/session-auth.guard';
import { DepartmentsController } from '../../src/departments/departments.controller';
import { DepartmentsService } from '../../src/departments/departments.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ScheduleAcknowledgementsService } from '../../src/schedules/schedule-acknowledgements.service';
import { SchedulePublicationsService } from '../../src/schedules/schedule-publications.service';
import { SchedulesController } from '../../src/schedules/schedules.controller';
import { SchedulesService } from '../../src/schedules/schedules.service';

type DepartmentFindManyArgs = {
  where: {
    isActive: boolean;
    id?: { in: string[] };
  };
};

type DepartmentFindFirstArgs = {
  where: {
    id: string;
    isActive: boolean;
  };
};

type ScheduleFindUniqueArgs = {
  where: {
    year_month: {
      year: number;
      month: number;
    };
  };
};

type ShiftFindManyArgs = {
  where: {
    scheduleId: string;
    employee: {
      departmentId: string;
      isActive: boolean;
    };
  };
};

function userWith(
  role: RoleType,
  departmentId: string | null,
): AuthUserContext {
  return {
    id: 'user-' + role.toLowerCase(),
    phoneE164: '+79991234567',
    employee: null,
    memberships: [
      {
        id: 'membership-' + role.toLowerCase(),
        role,
        departmentId,
      },
    ],
  };
}

describe('Planner management read API', () => {
  const departments = [
    {
      id: 'department-a',
      name: 'Bravo',
      kind: 'GENERAL',
      position: 2,
      isActive: true,
      updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    },
    {
      id: 'department-b',
      name: 'Zulu',
      kind: 'GENERAL',
      position: 1,
      isActive: true,
      updatedAt: new Date('2026-09-01T11:00:00.000Z'),
    },
    {
      id: 'department-c',
      name: 'Alpha',
      kind: 'GENERAL',
      position: 1,
      isActive: true,
      updatedAt: new Date('2026-09-01T12:00:00.000Z'),
    },
    {
      id: 'department-inactive',
      name: 'Archived',
      kind: 'GENERAL',
      position: 0,
      isActive: false,
      updatedAt: new Date('2026-09-01T09:00:00.000Z'),
    },
  ];

  const employeesByDepartment = {
    'department-a': [
      {
        id: 'employee-fixed',
        displayName: 'Fixed Employee',
        employmentRate: 1,
        scheduleMode: 'FIXED_WEEKDAYS',
        fixedStartTime: '08:00',
        fixedEndTime: '17:00',
        position: 1,
        updatedAt: new Date('2026-09-01T08:00:00.000Z'),
      },
      {
        id: 'employee-flex',
        displayName: 'Flexible Employee',
        employmentRate: 0.75,
        scheduleMode: 'FLEXIBLE',
        fixedStartTime: null,
        fixedEndTime: null,
        position: 2,
        updatedAt: new Date('2026-09-01T08:30:00.000Z'),
      },
    ],
    'department-b': [
      {
        id: 'employee-b',
        displayName: 'Department B Employee',
        employmentRate: 1,
        scheduleMode: 'FLEXIBLE',
        fixedStartTime: null,
        fixedEndTime: null,
        position: 1,
        updatedAt: new Date('2026-09-01T09:00:00.000Z'),
      },
    ],
    'department-c': [],
  };

  const persistedShifts = [
    {
      id: 'shift-day',
      scheduleId: 'schedule-2026-09',
      departmentId: 'department-a',
      employeeId: 'employee-flex',
      date: new Date('2026-09-07T00:00:00.000Z'),
      code: 'E',
      startTime: '08:00',
      endTime: '17:00',
      isOff: false,
      updatedAt: new Date('2026-09-02T10:00:00.000Z'),
    },
    {
      id: 'shift-off',
      scheduleId: 'schedule-2026-09',
      departmentId: 'department-a',
      employeeId: 'employee-flex',
      date: new Date('2026-09-08T00:00:00.000Z'),
      code: null,
      startTime: null,
      endTime: null,
      isOff: true,
      updatedAt: new Date('2026-09-02T11:00:00.000Z'),
    },
  ];

  const prisma = {
    department: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    schedule: {
      findUnique: jest.fn(),
    },
    shift: {
      findMany: jest.fn(),
    },
  };

  const authUsers: Record<string, AuthUserContext> = {
    super: userWith(RoleType.SUPER_ADMIN, null),
    'admin-a': userWith(RoleType.DEPARTMENT_ADMIN, 'department-a'),
    deputy: userWith(RoleType.DEPUTY, 'department-a'),
    employee: userWith(RoleType.EMPLOYEE, 'department-a'),
  };

  const auth = {
    getCurrentUser: jest.fn(async (token: string) => {
      const user = authUsers[token];
      if (!user) throw new UnauthorizedException('Session is invalid');
      return user;
    }),
  };

  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    prisma.department.findMany.mockImplementation(
      async (args: DepartmentFindManyArgs) =>
        departments
          .filter(
            (department) =>
              department.isActive === args.where.isActive &&
              (!args.where.id ||
                args.where.id.in.includes(department.id)),
          )
          .sort(
            (left, right) =>
              left.position - right.position ||
              left.name.localeCompare(right.name),
          )
          .map(({ isActive: _isActive, ...department }) => department),
    );

    prisma.department.findFirst.mockImplementation(
      async (args: DepartmentFindFirstArgs) => {
        const department = departments.find(
          (candidate) =>
            candidate.id === args.where.id &&
            candidate.isActive === args.where.isActive,
        );

        if (!department) return null;

        const { isActive: _isActive, position: _position, updatedAt: _updatedAt, ...summary } =
          department;

        return {
          ...summary,
          employees: [
            ...(employeesByDepartment[
              department.id as keyof typeof employeesByDepartment
            ] ?? []),
          ].sort(
            (left, right) =>
              left.position - right.position ||
              left.displayName.localeCompare(right.displayName),
          ),
        };
      },
    );

    prisma.schedule.findUnique.mockImplementation(
      async (args: ScheduleFindUniqueArgs) =>
        args.where.year_month.year === 2026 &&
        args.where.year_month.month === 9
          ? {
              id: 'schedule-2026-09',
              updatedAt: new Date('2026-09-03T10:00:00.000Z'),
            }
          : null,
    );

    prisma.shift.findMany.mockImplementation(
      async (args: ShiftFindManyArgs) =>
        persistedShifts
          .filter(
            (shift) =>
              shift.scheduleId === args.where.scheduleId &&
              shift.departmentId === args.where.employee.departmentId,
          )
          .sort(
            (left, right) =>
              left.employeeId.localeCompare(right.employeeId) ||
              left.date.getTime() - right.date.getTime(),
          )
          .map(
            ({ scheduleId: _scheduleId, departmentId: _departmentId, ...shift }) =>
              shift,
          ),
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [DepartmentsController, SchedulesController],
      providers: [
        DepartmentsService,
        SchedulesService,
        { provide: SchedulePublicationsService, useValue: {} },
        { provide: ScheduleAcknowledgementsService, useValue: {} },
        AuthorizationService,
        SessionAuthGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: auth },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function get(path: string, token?: string) {
    return fetch(baseUrl + path, {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
  }

  describe('GET /departments/manageable', () => {
    it('returns every active department to SUPER_ADMIN in position/name order', async () => {
      const response = await get('/departments/manageable', 'super');
      const body = (await response.json()) as Array<{ id: string }>;

      expect(response.status).toBe(200);
      expect(body.map((department) => department.id)).toEqual([
        'department-c',
        'department-b',
        'department-a',
      ]);
      expect(body).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'department-inactive' }),
        ]),
      );
      expect(prisma.department.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
          orderBy: [{ position: 'asc' }, { name: 'asc' }],
        }),
      );
    });

    it('returns only the DEPARTMENT_ADMIN scope', async () => {
      const response = await get('/departments/manageable', 'admin-a');
      const body = (await response.json()) as Array<{ id: string }>;

      expect(response.status).toBe(200);
      expect(body.map((department) => department.id)).toEqual([
        'department-a',
      ]);
      expect(prisma.department.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isActive: true,
            id: { in: ['department-a'] },
          },
        }),
      );
    });

    it('returns 403 to EMPLOYEE', async () => {
      const response = await get('/departments/manageable', 'employee');

      expect(response.status).toBe(403);
      expect(prisma.department.findMany).not.toHaveBeenCalled();
    });

    it('returns 403 to DEPUTY without a separate management permission', async () => {
      const response = await get('/departments/manageable', 'deputy');

      expect(response.status).toBe(403);
      expect(prisma.department.findMany).not.toHaveBeenCalled();
    });
  });

  describe('GET /schedule-data/department', () => {
    const departmentAPath =
      '/schedule-data/department?departmentId=department-a&year=2026&month=9';

    it('requires authentication', async () => {
      const response = await get(departmentAPath);
      const body = (await response.json()) as { message?: string };

      expect(response.status).toBe(401);
      expect(body.message).toBe('Session is required');
      expect(auth.getCurrentUser).not.toHaveBeenCalled();
      expect(prisma.department.findFirst).not.toHaveBeenCalled();
    });

    it('blocks direct-URL IDOR attempts outside DEPARTMENT_ADMIN scope', async () => {
      const response = await get(
        '/schedule-data/department?departmentId=department-b&year=2026&month=9',
        'admin-a',
      );

      expect(response.status).toBe(403);
      expect(prisma.department.findFirst).not.toHaveBeenCalled();
      expect(prisma.schedule.findUnique).not.toHaveBeenCalled();
    });

    it('allows DEPARTMENT_ADMIN to read its own active department', async () => {
      const response = await get(departmentAPath, 'admin-a');

      expect(response.status).toBe(200);
    });

    it('lets SUPER_ADMIN read an active department with persisted IDs', async () => {
      const response = await get(departmentAPath, 'super');
      const body = (await response.json()) as {
        department: { id: string };
        employees: Array<{ id: string }>;
        shifts: Array<{ id: string }>;
      };

      expect(response.status).toBe(200);
      expect(body.department.id).toBe('department-a');
      expect(body.employees.map((employee) => employee.id)).toEqual([
        'employee-fixed',
        'employee-flex',
      ]);
      expect(body.shifts.map((shift) => shift.id)).toEqual([
        'shift-day',
        'shift-off',
      ]);
    });

    it('serializes a persisted regular shift with times and code', async () => {
      const response = await get(departmentAPath, 'super');
      const body = (await response.json()) as {
        shifts: Array<Record<string, unknown>>;
      };

      expect(body.shifts).toContainEqual({
        id: 'shift-day',
        employeeId: 'employee-flex',
        date: '2026-09-07',
        code: 'E',
        startTime: '08:00',
        endTime: '17:00',
        isOff: false,
        updatedAt: '2026-09-02T10:00:00.000Z',
      });
    });

    it('serializes a persisted OFF shift without times or code', async () => {
      const response = await get(departmentAPath, 'super');
      const body = (await response.json()) as {
        shifts: Array<Record<string, unknown>>;
      };

      expect(body.shifts).toContainEqual({
        id: 'shift-off',
        employeeId: 'employee-flex',
        date: '2026-09-08',
        code: null,
        startTime: null,
        endTime: null,
        isOff: true,
        updatedAt: '2026-09-02T11:00:00.000Z',
      });
    });

    it('returns schedule=null and no shifts for a month without Schedule', async () => {
      const response = await get(
        '/schedule-data/department?departmentId=department-a&year=2026&month=10',
        'super',
      );
      const body = (await response.json()) as {
        schedule: unknown;
        shifts: unknown[];
      };

      expect(response.status).toBe(200);
      expect(body.schedule).toBeNull();
      expect(body.shifts).toEqual([]);
      expect(prisma.shift.findMany).not.toHaveBeenCalled();
    });

    it('does not invent persisted shifts for a fixed 5/2 employee', async () => {
      const response = await get(departmentAPath, 'super');
      const body = (await response.json()) as {
        employees: Array<{
          id: string;
          scheduleMode: string;
          fixedStartTime: string | null;
          fixedEndTime: string | null;
        }>;
        shifts: Array<{ employeeId: string }>;
      };

      expect(body.employees).toContainEqual(
        expect.objectContaining({
          id: 'employee-fixed',
          scheduleMode: 'FIXED_WEEKDAYS',
          fixedStartTime: '08:00',
          fixedEndTime: '17:00',
        }),
      );
      expect(body.shifts).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ employeeId: 'employee-fixed' }),
        ]),
      );
    });
  });
});
