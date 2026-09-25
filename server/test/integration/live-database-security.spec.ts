import type { INestApplication } from '@nestjs/common';
import {
  AuditAction,
  AuditEntityType,
  PermissionCapability,
  RoleType,
  ScheduleRuleKind,
  ScheduleRuleScope,
  ScheduleRuleSeverity,
} from '@prisma/client';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

const LIVE_DB_ENABLED = process.env.LIVE_DATABASE_TESTS === '1';
const describeLive = LIVE_DB_ENABLED ? describe : describe.skip;
const OTP_CODE = '123456';
const OTP_PEPPER = 'ci-live-db-otp-pepper-value-at-least-32-characters';

function requireDedicatedTestDatabase(): void {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (
    !databaseUrl.includes('work_time_departments_test') ||
    (!databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1'))
  ) {
    throw new Error(
      'Live database tests require a dedicated local work_time_departments_test database',
    );
  }
}

describeLive('live PostgreSQL security boundaries', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  async function clearDatabase(): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SET LOCAL app.schedule_rule_retention_mode = 'on'",
      );
      await tx.scheduleRuleVersion.deleteMany();
      await tx.scheduleRule.deleteMany();
    });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SET LOCAL app.schedule_publication_retention_mode = 'on'",
      );
      await tx.schedulePublication.deleteMany();
    });
    await prisma.shiftChangeRequestEvent.deleteMany();
    await prisma.shiftChangeRequest.deleteMany();
    await prisma.onboardingRequest.deleteMany();
    await prisma.employeeWish.deleteMany();
    await prisma.shift.deleteMany();
    await prisma.schedule.deleteMany();
    await prisma.authSession.deleteMany();
    await prisma.authChallenge.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.user.deleteMany();
    await prisma.department.deleteMany();
  }

  async function requestCode(phone: string): Promise<void> {
    const response = await fetch(baseUrl + '/auth/request-code', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    expect(response.status).toBe(201);
  }

  async function verifyCode(phone: string): Promise<Response> {
    return fetch(baseUrl + '/auth/verify-code', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone, code: OTP_CODE }),
    });
  }

  function sessionCookie(response: Response): string {
    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    return setCookie!.split(';', 1)[0];
  }

  beforeAll(async () => {
    requireDedicatedTestDatabase();

    process.env.NODE_ENV = 'test';
    process.env.AUTH_OTP_PEPPER = OTP_PEPPER;
    process.env.AUTH_DEV_OTP_CODE = OTP_CODE;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    prisma = app.get(PrismaService);
    await prisma.$connect();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    if (prisma) {
      await clearDatabase();
    }
    await app?.close();
  });

  it('persists, authenticates and revokes a real database session', async () => {
    const phone = '+79990000001';
    await requestCode(phone);

    const verification = await verifyCode(phone);
    expect(verification.status).toBe(201);
    const cookie = sessionCookie(verification);

    const current = await fetch(baseUrl + '/auth/me', {
      headers: { cookie },
    });
    expect(current.status).toBe(200);
    expect(await current.json()).toMatchObject({
      phoneE164: phone,
      memberships: [],
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { phoneE164: phone },
    });
    const storedSession = await prisma.authSession.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(storedSession.revokedAt).toBeNull();

    const logout = await fetch(baseUrl + '/auth/logout', {
      method: 'POST',
      headers: { cookie },
    });
    expect(logout.status).toBe(201);

    const revokedSession = await prisma.authSession.findUniqueOrThrow({
      where: { id: storedSession.id },
    });
    expect(revokedSession.revokedAt).toBeInstanceOf(Date);

    const afterLogout = await fetch(baseUrl + '/auth/me', {
      headers: { cookie },
    });
    expect(afterLogout.status).toBe(401);
  });

  it('prunes expired and revoked auth sessions during authentication traffic', async () => {
    const user = await prisma.user.create({
      data: { phoneE164: '+79990000050' },
    });
    const expired = await prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash: 'expired-session-hash',
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const revoked = await prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash: 'revoked-session-hash',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
      },
    });
    const active = await prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash: 'active-session-hash',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const phone = '+79990000051';
    await requestCode(phone);
    const verification = await verifyCode(phone);
    expect(verification.status).toBe(201);

    expect(
      await prisma.authSession.findUnique({ where: { id: expired.id } }),
    ).toBeNull();
    expect(
      await prisma.authSession.findUnique({ where: { id: revoked.id } }),
    ).toBeNull();
    expect(
      await prisma.authSession.findUnique({ where: { id: active.id } }),
    ).not.toBeNull();
  });

  it('prunes OTP challenges older than the active retention window before creating a new one', async () => {
    const now = Date.now();
    const stale = await prisma.authChallenge.create({
      data: {
        phoneE164: '+79990000040',
        codeHash: 'a'.repeat(64),
        expiresAt: new Date(now - 10 * 60 * 1000),
        consumedAt: new Date(now - 10 * 60 * 1000),
        createdAt: new Date(now - 11 * 60 * 1000),
      },
    });
    const recent = await prisma.authChallenge.create({
      data: {
        phoneE164: '+79990000041',
        codeHash: 'b'.repeat(64),
        expiresAt: new Date(now - 8 * 60 * 1000),
        consumedAt: new Date(now - 8 * 60 * 1000),
        createdAt: new Date(now - 9 * 60 * 1000),
      },
    });

    await requestCode('+79990000042');

    expect(
      await prisma.authChallenge.findUnique({ where: { id: stale.id } }),
    ).toBeNull();
    expect(
      await prisma.authChallenge.findUnique({ where: { id: recent.id } }),
    ).not.toBeNull();
  });

  it('allows only one request-code challenge inside the cooldown under concurrency', async () => {
    const phone = '+79990000004';

    const send = () =>
      fetch(baseUrl + '/auth/request-code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

    const [first, second] = await Promise.all([send(), send()]);

    expect([first.status, second.status].sort((a, b) => a - b)).toEqual([
      201,
      429,
    ]);

    expect(
      await prisma.authChallenge.count({
        where: { phoneE164: phone },
      }),
    ).toBe(1);
  });

  it('limits successful request-code sends from one source across different phones', async () => {
    const statuses: number[] = [];

    for (let index = 0; index < 21; index += 1) {
      const phone = '+79991' + String(index).padStart(6, '0');
      const response = await fetch(baseUrl + '/auth/request-code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 20)).toEqual(Array(20).fill(201));
    expect(statuses[20]).toBe(429);
    expect(await prisma.authChallenge.count()).toBe(20);
  });

  it('allows only one successful verification when the same OTP is submitted concurrently', async () => {
    const phone = '+79990000002';
    await requestCode(phone);

    const [first, second] = await Promise.all([
      verifyCode(phone),
      verifyCode(phone),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 401]);

    const sessions = await prisma.authSession.count({
      where: { user: { phoneE164: phone } },
    });
    expect(sessions).toBe(1);

    const challenge = await prisma.authChallenge.findFirstOrThrow({
      where: { phoneE164: phone },
      orderBy: { createdAt: 'desc' },
    });
    expect(challenge.consumedAt).toBeInstanceOf(Date);
  });

  it('enforces department scope against real persisted memberships and records', async () => {
    const phone = '+79990000003';
    await requestCode(phone);
    const verification = await verifyCode(phone);
    expect(verification.status).toBe(201);
    const cookie = sessionCookie(verification);

    const user = await prisma.user.findUniqueOrThrow({
      where: { phoneE164: phone },
    });
    const ownDepartment = await prisma.department.create({
      data: { name: 'Live DB own department', position: 1 },
    });
    const foreignDepartment = await prisma.department.create({
      data: { name: 'Live DB foreign department', position: 2 },
    });

    await prisma.membership.create({
      data: {
        userId: user.id,
        departmentId: ownDepartment.id,
        role: RoleType.DEPARTMENT_ADMIN,
      },
    });

    const ownEmployee = await prisma.employee.create({
      data: {
        displayName: 'Own scoped employee',
        departmentId: ownDepartment.id,
      },
    });
    await prisma.employee.create({
      data: {
        displayName: 'Foreign scoped employee',
        departmentId: foreignDepartment.id,
      },
    });

    const manageable = await fetch(baseUrl + '/departments/manageable', {
      headers: { cookie },
    });
    expect(manageable.status).toBe(200);
    const manageableDepartments = (await manageable.json()) as Array<{ id: string }>;
    expect(manageableDepartments.map((department) => department.id)).toEqual([
      ownDepartment.id,
    ]);

    const ownEmployees = await fetch(
      baseUrl + '/employees?departmentId=' + encodeURIComponent(ownDepartment.id),
      { headers: { cookie } },
    );
    expect(ownEmployees.status).toBe(200);
    expect(await ownEmployees.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: ownEmployee.id }),
      ]),
    );

    const foreignEmployees = await fetch(
      baseUrl + '/employees?departmentId=' + encodeURIComponent(foreignDepartment.id),
      { headers: { cookie } },
    );
    expect(foreignEmployees.status).toBe(403);

    const foreignSchedule = await fetch(
      baseUrl +
        '/schedule-data/department?departmentId=' +
        encodeURIComponent(foreignDepartment.id) +
        '&year=2026&month=9',
      { headers: { cookie } },
    );
    expect(foreignSchedule.status).toBe(403);
  });

  it('loads persisted Deputy capabilities and enforces them per department', async () => {
    const phone = '+79990000033';
    await requestCode(phone);
    const verification = await verifyCode(phone);
    expect(verification.status).toBe(201);
    const cookie = sessionCookie(verification);

    const user = await prisma.user.findUniqueOrThrow({
      where: { phoneE164: phone },
    });
    const ownDepartment = await prisma.department.create({
      data: { name: 'Deputy capability department', position: 1 },
    });
    const foreignDepartment = await prisma.department.create({
      data: { name: 'Deputy foreign department', position: 2 },
    });

    const membership = await prisma.membership.create({
      data: {
        userId: user.id,
        departmentId: ownDepartment.id,
        role: RoleType.DEPUTY,
      },
    });
    await prisma.membershipPermission.create({
      data: {
        membershipId: membership.id,
        capability: PermissionCapability.SCHEDULE_READ,
      },
    });

    const current = await fetch(baseUrl + '/auth/me', {
      headers: { cookie },
    });
    expect(current.status).toBe(200);
    expect(await current.json()).toMatchObject({
      memberships: [
        expect.objectContaining({
          id: membership.id,
          role: RoleType.DEPUTY,
          departmentId: ownDepartment.id,
          permissions: [PermissionCapability.SCHEDULE_READ],
        }),
      ],
    });

    const manageable = await fetch(baseUrl + '/departments/manageable', {
      headers: { cookie },
    });
    expect(manageable.status).toBe(200);
    expect(
      ((await manageable.json()) as Array<{ id: string }>).map(
        department => department.id,
      ),
    ).toEqual([ownDepartment.id]);

    const ownSchedule = await fetch(
      baseUrl +
        '/schedule-data/department?departmentId=' +
        encodeURIComponent(ownDepartment.id) +
        '&year=2026&month=9',
      { headers: { cookie } },
    );
    expect(ownSchedule.status).toBe(200);

    const ownEmployees = await fetch(
      baseUrl + '/employees?departmentId=' + encodeURIComponent(ownDepartment.id),
      { headers: { cookie } },
    );
    expect(ownEmployees.status).toBe(403);

    const foreignSchedule = await fetch(
      baseUrl +
        '/schedule-data/department?departmentId=' +
        encodeURIComponent(foreignDepartment.id) +
        '&year=2026&month=9',
      { headers: { cookie } },
    );
    expect(foreignSchedule.status).toBe(403);
  });

  it('keeps published schedule versions immutable outside explicit retention mode', async () => {
    const department = await prisma.department.create({
      data: { name: 'Published department' },
    });
    const publisher = await prisma.user.create({
      data: { phoneE164: '+79990000991' },
    });
    const schedule = await prisma.schedule.create({
      data: { year: 2026, month: 11 },
    });
    const publication = await prisma.schedulePublication.create({
      data: {
        scheduleId: schedule.id,
        departmentId: department.id,
        version: 1,
        publishedByUserId: publisher.id,
        sourceScheduleUpdatedAt: schedule.updatedAt,
        snapshot: {
          department: {
            id: department.id,
            name: department.name,
            kind: department.kind,
          },
          employees: [],
          shifts: [],
        },
        diff: { employees: [], shifts: [] },
      },
    });

    await expect(
      prisma.schedulePublication.update({
        where: { id: publication.id },
        data: { comment: 'tampered' },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.schedulePublication.delete({
        where: { id: publication.id },
      }),
    ).rejects.toThrow();

    expect(
      await prisma.schedulePublication.findUniqueOrThrow({
        where: { id: publication.id },
      }),
    ).toMatchObject({
      id: publication.id,
      version: 1,
      comment: null,
    });
  });

  it('keeps schedule rule versions immutable outside explicit retention mode', async () => {
    const department = await prisma.department.create({
      data: { name: 'Rules department' },
    });
    const user = await prisma.user.create({
      data: { phoneE164: '+79990000992' },
    });
    const rule = await prisma.scheduleRule.create({
      data: {
        name: 'Immutable rule',
        description: 'Immutable version test',
        kind: ScheduleRuleKind.MAX_CONCURRENT_EMPLOYEES,
        scope: ScheduleRuleScope.DEPARTMENT,
        departmentId: department.id,
        severity: ScheduleRuleSeverity.HARD,
        config: { maxConcurrent: 5 },
        violationMessage: 'Too many employees',
        createdByUserId: user.id,
        updatedByUserId: user.id,
      },
    });
    const version = await prisma.scheduleRuleVersion.create({
      data: {
        ruleId: rule.id,
        version: 1,
        snapshot: {
          id: rule.id,
          version: 1,
          config: { maxConcurrent: 5 },
        },
        changedByUserId: user.id,
      },
    });

    await expect(
      prisma.scheduleRuleVersion.update({
        where: { id: version.id },
        data: { snapshot: { tampered: true } },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.scheduleRuleVersion.delete({
        where: { id: version.id },
      }),
    ).rejects.toThrow();

    expect(
      await prisma.scheduleRuleVersion.findUniqueOrThrow({
        where: { id: version.id },
      }),
    ).toMatchObject({
      version: 1,
      changedByUserId: user.id,
    });
  });

  it('keeps audit rows immutable outside explicit retention mode', async () => {
    const created = await prisma.auditLog.create({
      data: {
        actorUserId: 'audit-actor',
        action: AuditAction.SCHEDULE_CHANGED,
        entityType: AuditEntityType.SCHEDULE,
        entityId: 'schedule-audit-target',
        departmentId: 'department-a',
      },
    });

    await expect(
      prisma.auditLog.update({
        where: { id: created.id },
        data: { entityId: 'tampered' },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.auditLog.delete({
        where: { id: created.id },
      }),
    ).rejects.toThrow();

    expect(
      await prisma.auditLog.findUniqueOrThrow({ where: { id: created.id } }),
    ).toMatchObject({
      entityId: 'schedule-audit-target',
      actorUserId: 'audit-actor',
    });
  });
});
