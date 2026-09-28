import {
  AbsenceType,
  DepartmentKind,
  Prisma,
  RoleType,
  ShiftChangeRequestEventType,
  ShiftChangeRequestKind,
  ShiftChangeRequestStatus,
  WorkSessionEventType,
  WorkSessionSource,
} from '@prisma/client';

import {
  addDateDays,
  businessDateText,
  localBusinessDateTime,
} from '../hours/business-time';

export const DEMO_SEED_CONFIRMATION = 'SYNTHETIC_DEMO_ONLY';
export const DEMO_DEPARTMENT_NAME = 'Demo Front Office';
export const DEMO_MANAGER_PHONE = '+12025550101';
export const DEMO_AGENT_A_PHONE = '+12025550102';
export const DEMO_AGENT_B_PHONE = '+12025550103';
export const DEMO_AGENT_C_PHONE = '+12025550104';

interface DemoSeedOptions {
  now?: Date;
  timeZone: string;
}

function databaseName(databaseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must use PostgreSQL');
  }
  return decodeURIComponent(parsed.pathname.replace(/^\//, '')).trim();
}

export function assertDemoSeedEnvironment(input: {
  databaseUrl?: string;
  nodeEnv?: string;
  confirmation?: string;
}): void {
  if (input.nodeEnv === 'production') {
    throw new Error('Owner demo seed is forbidden in NODE_ENV=production');
  }
  if (input.confirmation !== DEMO_SEED_CONFIRMATION) {
    throw new Error(
      'Set DEMO_SEED_CONFIRM=' + DEMO_SEED_CONFIRMATION + ' explicitly',
    );
  }
  if (!input.databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  const name = databaseName(input.databaseUrl);
  const safeName =
    /^(?:demo|test)(?:$|[_-])|(?:^|[_-])(?:demo|test)(?:$|[_-])/i;
  if (!safeName.test(name)) {
    throw new Error(
      'Owner demo seed requires demo or test as a database-name segment',
    );
  }
}

async function ensureMembership(
  tx: Prisma.TransactionClient,
  userId: string,
  departmentId: string,
  role: RoleType,
) {
  const existing = await tx.membership.findFirst({
    where: { userId, departmentId, role },
  });
  if (existing) {
    if (!existing.isActive) {
      return tx.membership.update({
        where: { id: existing.id },
        data: { isActive: true },
      });
    }
    return existing;
  }
  return tx.membership.create({
    data: { userId, departmentId, role },
  });
}

async function ensureShift(
  tx: Prisma.TransactionClient,
  scheduleId: string,
  employeeId: string,
  dateText: string,
  startTime: string,
  endTime: string,
  code: string | null = null,
) {
  const date = new Date(dateText + 'T00:00:00.000Z');
  const existing = await tx.shift.findUnique({
    where: {
      scheduleId_employeeId_date: { scheduleId, employeeId, date },
    },
  });
  if (existing) return existing;
  return tx.shift.create({
    data: {
      scheduleId,
      employeeId,
      date,
      startTime,
      endTime,
      code,
      isOff: false,
    },
  });
}

async function ensureManualSession(
  tx: Prisma.TransactionClient,
  input: {
    employeeId: string;
    departmentId: string;
    actorUserId: string;
    checkInAt: Date;
    checkOutAt: Date;
  },
) {
  const existing = await tx.workSession.findFirst({
    where: {
      employeeId: input.employeeId,
      departmentId: input.departmentId,
      source: WorkSessionSource.MANUAL,
      checkInAt: input.checkInAt,
      checkOutAt: input.checkOutAt,
    },
  });
  if (existing) return existing;

  const session = await tx.workSession.create({
    data: {
      employeeId: input.employeeId,
      departmentId: input.departmentId,
      source: WorkSessionSource.MANUAL,
      checkInAt: input.checkInAt,
      checkOutAt: input.checkOutAt,
    },
  });
  await tx.workSessionEvent.create({
    data: {
      sessionId: session.id,
      employeeId: input.employeeId,
      actorUserId: input.actorUserId,
      type: WorkSessionEventType.CORRECTED,
      checkInAt: input.checkInAt,
      checkOutAt: input.checkOutAt,
      reason: 'Synthetic owner demo attendance',
    },
  });
  return session;
}

export async function seedOwnerDemo(
  tx: Prisma.TransactionClient,
  options: DemoSeedOptions,
) {
  const now = options.now ?? new Date();
  const dateText = businessDateText(now, options.timeZone);
  const tomorrow = addDateDays(dateText, 1);
  const [year, month] = dateText.split('-').map(Number);

  let department = await tx.department.findFirst({
    where: { name: DEMO_DEPARTMENT_NAME },
  });
  if (!department) {
    department = await tx.department.create({
      data: {
        name: DEMO_DEPARTMENT_NAME,
        kind: DepartmentKind.FO,
        position: 0,
      },
    });
  }

  const userSpecs = [
    [DEMO_MANAGER_PHONE, 'Демо Руководитель'],
    [DEMO_AGENT_A_PHONE, 'Демо Агент А'],
    [DEMO_AGENT_B_PHONE, 'Демо Агент Б'],
    [DEMO_AGENT_C_PHONE, 'Демо Агент В'],
  ] as const;

  const users = [];
  const employees = [];
  for (const [phoneE164, displayName] of userSpecs) {
    const user = await tx.user.upsert({
      where: { phoneE164 },
      create: { phoneE164 },
      update: { isActive: true },
    });
    const employee = await tx.employee.upsert({
      where: { userId: user.id },
      create: {
        displayName,
        userId: user.id,
        departmentId: department.id,
        employmentRate: 1,
        position: employees.length,
      },
      update: {
        displayName,
        departmentId: department.id,
        isActive: true,
      },
    });
    users.push(user);
    employees.push(employee);
  }

  await ensureMembership(
    tx,
    users[0].id,
    department.id,
    RoleType.DEPARTMENT_ADMIN,
  );
  for (let index = 1; index < users.length; index += 1) {
    await ensureMembership(
      tx,
      users[index].id,
      department.id,
      RoleType.EMPLOYEE,
    );
  }

  const schedule = await tx.schedule.upsert({
    where: { year_month: { year, month } },
    create: { year, month },
    update: {},
  });

  const todayShifts = [
    await ensureShift(tx, schedule.id, employees[1].id, dateText, '08:00', '17:00'),
    await ensureShift(tx, schedule.id, employees[2].id, dateText, '09:00', '17:00'),
    await ensureShift(tx, schedule.id, employees[3].id, dateText, '08:00', '15:00'),
  ];
  const tomorrowShifts = [
    await ensureShift(tx, schedule.id, employees[1].id, tomorrow, '08:00', '17:00'),
    await ensureShift(tx, schedule.id, employees[2].id, tomorrow, '09:00', '17:00'),
  ];
  const demoShifts = [...todayShifts, ...tomorrowShifts];

  const publicationMarker = 'Synthetic owner demo dataset';
  let publication = await tx.schedulePublication.findFirst({
    where: {
      scheduleId: schedule.id,
      departmentId: department.id,
      comment: publicationMarker,
    },
    orderBy: { version: 'desc' },
  });
  if (!publication) {
    const latest = await tx.schedulePublication.findFirst({
      where: { scheduleId: schedule.id, departmentId: department.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const snapshot = {
      department: {
        id: department.id,
        name: department.name,
        kind: department.kind,
      },
      employees: employees.map(employee => ({
        id: employee.id,
        displayName: employee.displayName,
        employmentRate: employee.employmentRate,
        scheduleMode: employee.scheduleMode,
        fixedStartTime: employee.fixedStartTime,
        fixedEndTime: employee.fixedEndTime,
      })),
      shifts: demoShifts.map(shift => ({
        id: shift.id,
        employeeId: shift.employeeId,
        date: shift.date.toISOString().slice(0, 10),
        code: shift.code,
        startTime: shift.startTime,
        endTime: shift.endTime,
        isOff: shift.isOff,
        updatedAt: shift.updatedAt.toISOString(),
      })),
    };
    publication = await tx.schedulePublication.create({
      data: {
        scheduleId: schedule.id,
        departmentId: department.id,
        version: (latest?.version ?? 0) + 1,
        publishedByUserId: users[0].id,
        sourceScheduleUpdatedAt: schedule.updatedAt,
        comment: publicationMarker,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        diff: { syntheticDemo: true } as Prisma.InputJsonValue,
      },
    });
  }

  const absenceDate = new Date(dateText + 'T00:00:00.000Z');
  const existingAbsence = await tx.absence.findFirst({
    where: {
      employeeId: employees[3].id,
      type: AbsenceType.TRAINING,
      startDate: absenceDate,
      endDate: absenceDate,
      canceledAt: null,
    },
  });
  if (!existingAbsence) {
    await tx.absence.create({
      data: {
        employeeId: employees[3].id,
        type: AbsenceType.TRAINING,
        startDate: absenceDate,
        endDate: absenceDate,
        createdByUserId: users[0].id,
        updatedByUserId: users[0].id,
      },
    });
  }

  await ensureManualSession(tx, {
    employeeId: employees[1].id,
    departmentId: department.id,
    actorUserId: users[0].id,
    checkInAt: localBusinessDateTime(dateText, '08:12', options.timeZone),
    checkOutAt: localBusinessDateTime(dateText, '16:40', options.timeZone),
  });
  await ensureManualSession(tx, {
    employeeId: employees[2].id,
    departmentId: department.id,
    actorUserId: users[0].id,
    checkInAt: localBusinessDateTime(dateText, '09:00', options.timeZone),
    checkOutAt: localBusinessDateTime(dateText, '17:20', options.timeZone),
  });

  let shiftRequest = await tx.shiftChangeRequest.findFirst({
    where: {
      requesterEmployeeId: employees[1].id,
      targetEmployeeId: employees[2].id,
      requesterShiftId: tomorrowShifts[0].id,
      targetShiftId: tomorrowShifts[1].id,
      status: ShiftChangeRequestStatus.PENDING_MANAGER,
    },
  });
  if (!shiftRequest) {
    shiftRequest = await tx.shiftChangeRequest.create({
      data: {
        kind: ShiftChangeRequestKind.SWAP,
        status: ShiftChangeRequestStatus.PENDING_MANAGER,
        requesterUserId: users[1].id,
        requesterEmployeeId: employees[1].id,
        requesterDepartmentId: department.id,
        targetUserId: users[2].id,
        targetEmployeeId: employees[2].id,
        targetDepartmentId: department.id,
        requesterShiftId: tomorrowShifts[0].id,
        targetShiftId: tomorrowShifts[1].id,
        requesterShiftUpdatedAt: tomorrowShifts[0].updatedAt,
        targetShiftUpdatedAt: tomorrowShifts[1].updatedAt,
      },
    });
    await tx.shiftChangeRequestEvent.createMany({
      data: [
        {
          requestId: shiftRequest.id,
          eventType: ShiftChangeRequestEventType.CREATED,
          actorUserId: users[1].id,
        },
        {
          requestId: shiftRequest.id,
          eventType: ShiftChangeRequestEventType.TARGET_ACCEPTED,
          actorUserId: users[2].id,
        },
      ],
    });
  }

  return {
    date: dateText,
    departmentId: department.id,
    departmentName: department.name,
    publicationId: publication.id,
    publicationVersion: publication.version,
    managerPhone: DEMO_MANAGER_PHONE,
    employeePhones: [
      DEMO_AGENT_A_PHONE,
      DEMO_AGENT_B_PHONE,
      DEMO_AGENT_C_PHONE,
    ],
    shiftRequestId: shiftRequest.id,
  };
}
