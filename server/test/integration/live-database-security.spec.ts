import type { INestApplication } from '@nestjs/common';
import { RoleType } from '@prisma/client';
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
});
