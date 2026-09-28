import { PrismaClient, ShiftChangeRequestStatus } from '@prisma/client';

import {
  assertDemoSeedEnvironment,
  DEMO_DEPARTMENT_NAME,
  DEMO_SEED_CONFIRMATION,
  seedOwnerDemo,
} from '../../src/demo/owner-demo-seed';

const describeLive =
  process.env.LIVE_DATABASE_TESTS === '1' ? describe : describe.skip;

describeLive('live PostgreSQL owner demo seed', () => {
  let prisma: PrismaClient;

  async function clearDatabase() {
    await prisma.$executeRawUnsafe(`
      DO $$ DECLARE row RECORD;
      BEGIN
        FOR row IN
          SELECT tablename
          FROM pg_tables
          WHERE schemaname = 'public'
            AND tablename <> '_prisma_migrations'
        LOOP
          EXECUTE format('TRUNCATE TABLE %I CASCADE', row.tablename);
        END LOOP;
      END $$;
    `);
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (
      !url.includes('work_time_departments_test') ||
      (!url.includes('localhost') && !url.includes('127.0.0.1'))
    ) {
      throw new Error(
        'Live demo seed test requires the dedicated local test database',
      );
    }
    process.env.BUSINESS_TIME_ZONE = 'Europe/Moscow';
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  beforeEach(clearDatabase);

  afterAll(async () => {
    if (prisma) {
      await clearDatabase();
      await prisma.$disconnect();
    }
  });

  it('creates an idempotent synthetic management scenario', async () => {
    assertDemoSeedEnvironment({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnv: 'test',
      confirmation: DEMO_SEED_CONFIRMATION,
    });

    const now = new Date('2026-09-28T12:00:00.000Z');
    const first = await prisma.$transaction(tx =>
      seedOwnerDemo(tx, {
        now,
        timeZone: 'Europe/Moscow',
      }),
    );
    const second = await prisma.$transaction(tx =>
      seedOwnerDemo(tx, {
        now,
        timeZone: 'Europe/Moscow',
      }),
    );

    expect(second.departmentId).toBe(first.departmentId);
    expect(second.publicationId).toBe(first.publicationId);
    expect(await prisma.department.count({
      where: { name: DEMO_DEPARTMENT_NAME },
    })).toBe(1);
    expect(await prisma.employee.count({
      where: { departmentId: first.departmentId },
    })).toBe(4);
    expect(await prisma.schedulePublication.count({
      where: {
        departmentId: first.departmentId,
        comment: 'Synthetic owner demo dataset',
      },
    })).toBe(1);
    expect(await prisma.workSession.count({
      where: { departmentId: first.departmentId },
    })).toBe(2);
    expect(await prisma.absence.count({
      where: {
        employee: { departmentId: first.departmentId },
        canceledAt: null,
      },
    })).toBe(1);
    expect(await prisma.shiftChangeRequest.count({
      where: {
        requesterDepartmentId: first.departmentId,
        status: ShiftChangeRequestStatus.PENDING_MANAGER,
      },
    })).toBe(1);
  });
});
