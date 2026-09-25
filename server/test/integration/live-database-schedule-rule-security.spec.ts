import { ForbiddenException, type INestApplication } from '@nestjs/common';
import {
  RoleType,
  ScheduleRuleKind,
  ScheduleRuleScope,
  ScheduleRuleSeverity,
} from '@prisma/client';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ScheduleRulesService } from '../../src/schedule-rules/schedule-rules.service';

const describeLive =
  process.env.LIVE_DATABASE_TESTS === '1' ? describe : describe.skip;

describeLive('live PostgreSQL schedule-rule authorization', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rules: ScheduleRulesService;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL ?? '';
    if (
      !databaseUrl.includes('work_time_departments_test') ||
      (!databaseUrl.includes('localhost') &&
        !databaseUrl.includes('127.0.0.1'))
    ) {
      throw new Error(
        'Live database tests require a dedicated local work_time_departments_test database',
      );
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    prisma = app.get(PrismaService);
    rules = app.get(ScheduleRulesService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects rule mutation after the manager membership is revoked', async () => {
    const department = await prisma.department.create({
      data: { name: 'Rule security scope test' },
    });
    const manager = await prisma.user.create({
      data: { phoneE164: '+79990000884' },
    });
    const membership = await prisma.membership.create({
      data: {
        userId: manager.id,
        departmentId: department.id,
        role: RoleType.DEPARTMENT_ADMIN,
      },
    });
    const rule = await prisma.scheduleRule.create({
      data: {
        name: 'Scope protected rule',
        description: 'Security regression',
        kind: ScheduleRuleKind.MAX_CONCURRENT_EMPLOYEES,
        scope: ScheduleRuleScope.DEPARTMENT,
        departmentId: department.id,
        severity: ScheduleRuleSeverity.HARD,
        config: { maxConcurrent: 5 },
        violationMessage: 'Violation',
        createdByUserId: manager.id,
        updatedByUserId: manager.id,
      },
    });

    try {
      const staleManager = {
        id: manager.id,
        phoneE164: manager.phoneE164,
        employee: null,
        memberships: [
          {
            id: membership.id,
            role: RoleType.DEPARTMENT_ADMIN,
            departmentId: department.id,
          },
        ],
      };

      await prisma.membership.update({
        where: { id: membership.id },
        data: { isActive: false },
      });

      await expect(
        rules.updateRule(staleManager, rule.id, {
          name: 'Should not apply',
          expectedUpdatedAt: rule.updatedAt.toISOString(),
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(
        await prisma.scheduleRule.findUniqueOrThrow({
          where: { id: rule.id },
        }),
      ).toMatchObject({
        name: 'Scope protected rule',
        version: 1,
      });
    } finally {
      await prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe(
          "SET LOCAL app.schedule_rule_retention_mode = 'on'",
        );
        await tx.scheduleRuleVersion.deleteMany({
          where: { ruleId: rule.id },
        });
        await tx.scheduleRule.delete({
          where: { id: rule.id },
        });
      });
      await prisma.membership.delete({ where: { id: membership.id } });
      await prisma.user.delete({ where: { id: manager.id } });
      await prisma.department.delete({ where: { id: department.id } });
    }
  });
});
