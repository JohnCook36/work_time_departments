import {
  AuditAction,
  AuditEntityType,
  Prisma,
} from '@prisma/client';

type AuditClient = Pick<Prisma.TransactionClient, 'auditLog'>;

export interface AuditLogEntry {
  actorUserId: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  departmentId?: string | null;
}

export async function appendAuditLog(
  client: AuditClient,
  entry: AuditLogEntry,
): Promise<void> {
  await client.auditLog.create({
    data: {
      actorUserId: entry.actorUserId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      departmentId: entry.departmentId ?? null,
    },
    select: { id: true },
  });
}
