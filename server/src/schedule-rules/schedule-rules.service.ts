import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  AuditEntityType,
  DepartmentKind,
  PermissionCapability,
  Prisma,
  ScheduleRuleKind,
  ScheduleRuleScope,
  ScheduleRuleSeverity,
} from '@prisma/client';

import { appendAuditLog } from '../audit/audit-log';
import { AuthUserContext } from '../auth/auth.service';
import { AuthorizationService } from '../auth/authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  normalizeManagedRuleConfig,
  normalizeRuleScopeValue,
} from './rule-engine';

export interface ScheduleRuleMutationInput {
  name?: unknown;
  description?: unknown;
  kind?: unknown;
  scope?: unknown;
  scopeValue?: unknown;
  departmentId?: unknown;
  priority?: unknown;
  severity?: unknown;
  isActive?: unknown;
  config?: unknown;
  violationMessage?: unknown;
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(field + ' is required');
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new BadRequestException(field + ' is too long');
  }
  return normalized;
}

function enumValue<T extends string>(
  value: unknown,
  field: string,
  values: readonly T[],
): T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new BadRequestException(
      field + ' must be one of: ' + values.join(', '),
    );
  }
  return value as T;
}

function integerValue(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new BadRequestException(
      field + ' must be an integer between ' + min + ' and ' + max,
    );
  }
  return value;
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new BadRequestException(field + ' must be a boolean');
  }
  return value;
}

function expectedUpdatedAt(value: unknown): Date {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new BadRequestException('expectedUpdatedAt must be ISO date-time');
  }
  return new Date(value);
}

type RuleRow = {
  id: string;
  name: string;
  description: string;
  kind: ScheduleRuleKind;
  scope: ScheduleRuleScope;
  scopeValue: string | null;
  departmentId: string | null;
  priority: number;
  severity: ScheduleRuleSeverity;
  isActive: boolean;
  isDeleted: boolean;
  config: Prisma.JsonValue;
  violationMessage: string;
  version: number;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

function snapshotRule(rule: RuleRow) {
  return {
    id: rule.id,
    name: rule.name,
    description: rule.description,
    kind: rule.kind,
    scope: rule.scope,
    scopeValue: rule.scopeValue,
    departmentId: rule.departmentId,
    priority: rule.priority,
    severity: rule.severity,
    isActive: rule.isActive,
    isDeleted: rule.isDeleted,
    config: rule.config,
    violationMessage: rule.violationMessage,
    version: rule.version,
    createdByUserId: rule.createdByUserId,
    updatedByUserId: rule.updatedByUserId,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

function serializeRule(rule: RuleRow, editable: boolean) {
  return {
    id: rule.id,
    name: rule.name,
    description: rule.description,
    kind: rule.kind,
    scope: rule.scope,
    scopeValue: rule.scopeValue,
    departmentId: rule.departmentId,
    priority: rule.priority,
    severity: rule.severity,
    isActive: rule.isActive,
    isDeleted: rule.isDeleted,
    config: rule.config,
    violationMessage: rule.violationMessage,
    version: rule.version,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
    editable,
  };
}

const FO_PRESET_RULES = [
  {
    name: 'Стандарт FO · максимум 5 одновременно',
    description: 'Не более 5 сотрудников Front Office одновременно.',
    kind: ScheduleRuleKind.MAX_CONCURRENT_EMPLOYEES,
    config: { maxConcurrent: 5 },
    violationMessage: 'В Front Office одновременно работает больше 5 сотрудников.',
  },
  {
    name: 'Стандарт FO · 2 сотрудника к 07:00',
    description: 'К 07:00 в Front Office должны работать минимум 2 сотрудника.',
    kind: ScheduleRuleKind.MIN_STAFF_AT_TIME,
    config: { time: '07:00', minStaff: 2 },
    violationMessage: 'К 07:00 в Front Office должно быть минимум 2 сотрудника.',
  },
] as const;

function publicRuleSnapshot(value: Prisma.JsonValue): Prisma.JsonValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  const snapshot = { ...(value as Prisma.JsonObject) };
  delete snapshot.createdByUserId;
  delete snapshot.updatedByUserId;
  return snapshot;
}

@Injectable()
export class ScheduleRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  private isSuperAdmin(user: AuthUserContext): boolean {
    return this.authorization.isSuperAdmin(user);
  }

  private managedDepartmentIds(user: AuthUserContext): string[] {
    return this.authorization.departmentIdsForCapability(
      user,
      PermissionCapability.SCHEDULE_RULE_MANAGE,
    );
  }

  private assertCanManageScope(
    user: AuthUserContext,
    scope: ScheduleRuleScope,
    departmentId: string | null,
  ): void {
    if (scope === ScheduleRuleScope.DEPARTMENT) {
      if (!departmentId) {
        throw new BadRequestException(
          'departmentId is required for DEPARTMENT scope',
        );
      }
      this.authorization.assertCapability(
        user,
        PermissionCapability.SCHEDULE_RULE_MANAGE,
        departmentId,
      );
      return;
    }

    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenException(
        'Only SUPER_ADMIN can manage organization, role or shift-type rules',
      );
    }
  }

  private assertCanViewRule(user: AuthUserContext, rule: RuleRow): void {
    if (this.isSuperAdmin(user)) return;

    if (
      rule.scope === ScheduleRuleScope.DEPARTMENT &&
      rule.departmentId &&
      this.managedDepartmentIds(user).includes(rule.departmentId)
    ) {
      return;
    }

    if (
      rule.scope === ScheduleRuleScope.ORGANIZATION ||
      rule.scope === ScheduleRuleScope.ROLE ||
      rule.scope === ScheduleRuleScope.SHIFT_TYPE
    ) {
      if (this.managedDepartmentIds(user).length > 0) return;
    }

    throw new ForbiddenException('You do not have access to this rule');
  }

  private canEditRule(user: AuthUserContext, rule: RuleRow): boolean {
    if (this.isSuperAdmin(user)) return true;
    return (
      rule.scope === ScheduleRuleScope.DEPARTMENT &&
      !!rule.departmentId &&
      this.authorization.hasCapability(
        user,
        PermissionCapability.SCHEDULE_RULE_MANAGE,
        rule.departmentId,
      )
    );
  }

  private normalizeCreateInput(input: ScheduleRuleMutationInput) {
    const name = requiredText(input.name, 'name', 120);
    const description = requiredText(input.description, 'description', 4000);
    const kind = enumValue(
      input.kind,
      'kind',
      Object.values(ScheduleRuleKind),
    );
    const scope = enumValue(
      input.scope,
      'scope',
      Object.values(ScheduleRuleScope),
    );
    const departmentId =
      scope === ScheduleRuleScope.DEPARTMENT
        ? requiredText(input.departmentId, 'departmentId', 200)
        : null;

    let scopeValue: string | null;
    try {
      scopeValue = normalizeRuleScopeValue(scope, input.scopeValue);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid scopeValue',
      );
    }

    let config: Record<string, string | number>;
    try {
      config = normalizeManagedRuleConfig(kind, input.config);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid rule config',
      );
    }

    return {
      name,
      description,
      kind,
      scope,
      scopeValue,
      departmentId,
      priority:
        input.priority == null
          ? 100
          : integerValue(input.priority, 'priority', 0, 1000),
      severity:
        input.severity == null
          ? ScheduleRuleSeverity.HARD
          : enumValue(
              input.severity,
              'severity',
              Object.values(ScheduleRuleSeverity),
            ),
      isActive:
        input.isActive == null
          ? true
          : booleanValue(input.isActive, 'isActive'),
      config,
      violationMessage: requiredText(
        input.violationMessage,
        'violationMessage',
        500,
      ),
    };
  }

  private normalizeUpdateInput(
    current: RuleRow,
    input: ScheduleRuleMutationInput,
  ) {
    return this.normalizeCreateInput({
      name: input.name ?? current.name,
      description: input.description ?? current.description,
      kind: input.kind ?? current.kind,
      scope: input.scope ?? current.scope,
      scopeValue:
        input.scopeValue !== undefined
          ? input.scopeValue
          : current.scopeValue,
      departmentId:
        input.departmentId !== undefined
          ? input.departmentId
          : current.departmentId,
      priority: input.priority ?? current.priority,
      severity: input.severity ?? current.severity,
      isActive:
        input.isActive !== undefined ? input.isActive : current.isActive,
      config: input.config ?? current.config,
      violationMessage:
        input.violationMessage ?? current.violationMessage,
    });
  }

  private async loadCurrentActor(
    tx: Prisma.TransactionClient,
    user: AuthUserContext,
  ): Promise<AuthUserContext> {
    const current = await tx.user.findUnique({
      where: { id: user.id },
      select: {
        isActive: true,
        memberships: {
          where: { isActive: true },
          select: {
            id: true,
            role: true,
            departmentId: true,
            permissions: {
              select: { capability: true },
            },
          },
        },
      },
    });

    if (!current?.isActive) {
      throw new ForbiddenException('Manager account is inactive');
    }

    return {
      ...user,
      memberships: current.memberships.map(membership => ({
        id: membership.id,
        role: membership.role,
        departmentId: membership.departmentId,
        permissions: membership.permissions.map(
          permission => permission.capability,
        ),
      })),
    };
  }

  private async assertDepartmentExists(departmentId: string | null) {
    if (!departmentId) return;
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, isActive: true },
      select: { id: true },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }
  }

  async listManageable(user: AuthUserContext) {
    const superAdmin = this.isSuperAdmin(user);
    const departmentIds = this.managedDepartmentIds(user);
    if (!superAdmin && departmentIds.length === 0) {
      throw new ForbiddenException('Rule management access is required');
    }

    const rules = await this.prisma.scheduleRule.findMany({
      where: {
        isDeleted: false,
        ...(superAdmin
          ? {}
          : {
              OR: [
                {
                  scope: ScheduleRuleScope.DEPARTMENT,
                  departmentId: { in: departmentIds },
                },
                { scope: ScheduleRuleScope.ORGANIZATION },
                { scope: ScheduleRuleScope.ROLE },
                { scope: ScheduleRuleScope.SHIFT_TYPE },
              ],
            }),
      },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
    });

    return rules.map((rule) =>
      serializeRule(rule as RuleRow, this.canEditRule(user, rule as RuleRow)),
    );
  }

  async applyFoPreset(user: AuthUserContext, departmentId: string) {
    const normalizedDepartmentId = requiredText(
      departmentId,
      'departmentId',
      200,
    );
    this.authorization.assertCapability(
      user,
      PermissionCapability.SCHEDULE_RULE_MANAGE,
      normalizedDepartmentId,
    );

    const department = await this.prisma.department.findFirst({
      where: { id: normalizedDepartmentId, isActive: true },
      select: { id: true, kind: true },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }
    if (department.kind !== DepartmentKind.FO) {
      throw new BadRequestException(
        'FO preset is available only for Front Office departments',
      );
    }

    return this.prisma.$transaction(async tx => {
      const currentUser = await this.loadCurrentActor(tx, user);
      this.authorization.assertCapability(
        currentUser,
        PermissionCapability.SCHEDULE_RULE_MANAGE,
        normalizedDepartmentId,
      );

      const lockKey = 'schedule-rule:fo-preset:' + normalizedDepartmentId;
      await tx.$queryRaw<Array<{ locked: number }>>`
        SELECT 1::int AS locked
        FROM (
          SELECT pg_advisory_xact_lock(hashtext(${lockKey}))
        ) AS fo_preset_lock
      `;

      const existing = await tx.scheduleRule.findMany({
        where: {
          departmentId: normalizedDepartmentId,
          scope: ScheduleRuleScope.DEPARTMENT,
          isDeleted: false,
          name: { in: FO_PRESET_RULES.map(rule => rule.name) },
        },
      });
      const existingNames = new Set(existing.map(rule => rule.name));
      const created: ReturnType<typeof serializeRule>[] = [];

      for (const preset of FO_PRESET_RULES) {
        if (existingNames.has(preset.name)) continue;

        const rule = (await tx.scheduleRule.create({
          data: {
            name: preset.name,
            description: preset.description,
            kind: preset.kind,
            scope: ScheduleRuleScope.DEPARTMENT,
            scopeValue: null,
            departmentId: normalizedDepartmentId,
            priority: 900,
            severity: ScheduleRuleSeverity.HARD,
            isActive: true,
            config: preset.config as unknown as Prisma.InputJsonValue,
            violationMessage: preset.violationMessage,
            createdByUserId: user.id,
            updatedByUserId: user.id,
          },
        })) as RuleRow;

        await tx.scheduleRuleVersion.create({
          data: {
            ruleId: rule.id,
            version: rule.version,
            snapshot: snapshotRule(rule) as unknown as Prisma.InputJsonValue,
            changedByUserId: user.id,
          },
        });
        await appendAuditLog(tx, {
          actorUserId: user.id,
          action: AuditAction.SCHEDULE_RULE_CREATED,
          entityType: AuditEntityType.SCHEDULE_RULE,
          entityId: rule.id,
          departmentId: normalizedDepartmentId,
        });

        created.push(serializeRule(rule, true));
      }

      return {
        status: 'ok' as const,
        departmentId: normalizedDepartmentId,
        created: created.length,
        existing: FO_PRESET_RULES.length - created.length,
        rules: created,
      };
    });
  }

  async createRule(
    user: AuthUserContext,
    input: ScheduleRuleMutationInput,
  ) {
    const normalized = this.normalizeCreateInput(input);
    this.assertCanManageScope(
      user,
      normalized.scope,
      normalized.departmentId,
    );
    await this.assertDepartmentExists(normalized.departmentId);

    return this.prisma.$transaction(async (tx) => {
      const currentUser = await this.loadCurrentActor(tx, user);
      this.assertCanManageScope(
        currentUser,
        normalized.scope,
        normalized.departmentId,
      );

      const rule = (await tx.scheduleRule.create({
        data: {
          ...normalized,
          config: normalized.config as Prisma.InputJsonValue,
          createdByUserId: user.id,
          updatedByUserId: user.id,
        },
      })) as RuleRow;

      await tx.scheduleRuleVersion.create({
        data: {
          ruleId: rule.id,
          version: rule.version,
          snapshot: snapshotRule(rule) as unknown as Prisma.InputJsonValue,
          changedByUserId: user.id,
        },
      });

      await appendAuditLog(tx, {
        actorUserId: user.id,
        action: AuditAction.SCHEDULE_RULE_CREATED,
        entityType: AuditEntityType.SCHEDULE_RULE,
        entityId: rule.id,
        departmentId: rule.departmentId,
      });

      return serializeRule(rule, true);
    });
  }

  async updateRule(
    user: AuthUserContext,
    ruleId: string,
    input: ScheduleRuleMutationInput & { expectedUpdatedAt?: unknown },
  ) {
    const current = (await this.prisma.scheduleRule.findFirst({
      where: { id: ruleId, isDeleted: false },
    })) as RuleRow | null;
    if (!current) throw new NotFoundException('Schedule rule not found');

    if (!this.canEditRule(user, current)) {
      throw new ForbiddenException('You do not have permission to edit this rule');
    }

    const normalized = this.normalizeUpdateInput(current, input);
    this.assertCanManageScope(
      user,
      normalized.scope,
      normalized.departmentId,
    );
    await this.assertDepartmentExists(normalized.departmentId);
    const expected = expectedUpdatedAt(input.expectedUpdatedAt);

    return this.prisma.$transaction(async (tx) => {
      const currentUser = await this.loadCurrentActor(tx, user);
      if (!this.canEditRule(currentUser, current)) {
        throw new ForbiddenException(
          'You do not have permission to edit this rule',
        );
      }
      this.assertCanManageScope(
        currentUser,
        normalized.scope,
        normalized.departmentId,
      );

      const updated = await tx.scheduleRule.updateMany({
        where: {
          id: ruleId,
          isDeleted: false,
          updatedAt: expected,
        },
        data: {
          ...normalized,
          config: normalized.config as Prisma.InputJsonValue,
          version: { increment: 1 },
          updatedByUserId: user.id,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'Schedule rule changed concurrently; refresh and retry',
        );
      }

      const rule = (await tx.scheduleRule.findUnique({
        where: { id: ruleId },
      })) as RuleRow;

      await tx.scheduleRuleVersion.create({
        data: {
          ruleId: rule.id,
          version: rule.version,
          snapshot: snapshotRule(rule) as unknown as Prisma.InputJsonValue,
          changedByUserId: user.id,
        },
      });

      await appendAuditLog(tx, {
        actorUserId: user.id,
        action: AuditAction.SCHEDULE_RULE_UPDATED,
        entityType: AuditEntityType.SCHEDULE_RULE,
        entityId: rule.id,
        departmentId: rule.departmentId,
      });

      return serializeRule(rule, true);
    });
  }

  async deleteRule(
    user: AuthUserContext,
    ruleId: string,
    expectedUpdatedAtValue: unknown,
  ) {
    const current = (await this.prisma.scheduleRule.findFirst({
      where: { id: ruleId, isDeleted: false },
    })) as RuleRow | null;
    if (!current) throw new NotFoundException('Schedule rule not found');

    if (!this.canEditRule(user, current)) {
      throw new ForbiddenException('You do not have permission to delete this rule');
    }

    const expected = expectedUpdatedAt(expectedUpdatedAtValue);

    return this.prisma.$transaction(async (tx) => {
      const currentUser = await this.loadCurrentActor(tx, user);
      if (!this.canEditRule(currentUser, current)) {
        throw new ForbiddenException(
          'You do not have permission to delete this rule',
        );
      }

      const updated = await tx.scheduleRule.updateMany({
        where: {
          id: ruleId,
          isDeleted: false,
          updatedAt: expected,
        },
        data: {
          isDeleted: true,
          isActive: false,
          version: { increment: 1 },
          updatedByUserId: user.id,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'Schedule rule changed concurrently; refresh and retry',
        );
      }

      const rule = (await tx.scheduleRule.findUnique({
        where: { id: ruleId },
      })) as RuleRow;

      await tx.scheduleRuleVersion.create({
        data: {
          ruleId: rule.id,
          version: rule.version,
          snapshot: snapshotRule(rule) as unknown as Prisma.InputJsonValue,
          changedByUserId: user.id,
        },
      });

      await appendAuditLog(tx, {
        actorUserId: user.id,
        action: AuditAction.SCHEDULE_RULE_DELETED,
        entityType: AuditEntityType.SCHEDULE_RULE,
        entityId: rule.id,
        departmentId: rule.departmentId,
      });

      return { status: 'ok' as const, ruleId };
    });
  }

  async getHistory(user: AuthUserContext, ruleId: string) {
    const rule = (await this.prisma.scheduleRule.findUnique({
      where: { id: ruleId },
    })) as RuleRow | null;
    if (!rule) throw new NotFoundException('Schedule rule not found');
    this.assertCanViewRule(user, rule);

    const versions = await this.prisma.scheduleRuleVersion.findMany({
      where: { ruleId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        snapshot: true,
        changedBy: {
          select: {
            employee: {
              select: { displayName: true },
            },
          },
        },
        createdAt: true,
      },
    });

    return versions.map((version) => ({
      id: version.id,
      version: version.version,
      snapshot: publicRuleSnapshot(version.snapshot),
      changedByLabel:
        version.changedBy.employee?.displayName ?? 'Администратор',
      createdAt: version.createdAt.toISOString(),
    }));
  }
}
