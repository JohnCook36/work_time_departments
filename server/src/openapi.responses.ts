import type { SchemaObject } from '@nestjs/swagger';
import { DepartmentKind, EmployeeScheduleMode, OnboardingRequestStatus, OnboardingRequestType, RoleType, ScheduleRuleKind, ScheduleRuleScope, ScheduleRuleSeverity, ShiftChangeRequestEventType, ShiftChangeRequestKind, ShiftChangeRequestStatus } from '@prisma/client';

// Wire response shapes selected/serialized by the services, never database records or fixtures.
const text: SchemaObject = { type: 'string' };
const integer: SchemaObject = { type: 'integer' };
const boolean: SchemaObject = { type: 'boolean' };
const timestamp: SchemaObject = { type: 'string', format: 'date-time' };
const enumeration = (values: Record<string, string>): SchemaObject => ({ type: 'string', enum: Object.values(values) });
const nullable = (schema: SchemaObject): SchemaObject => ({ ...schema, nullable: true });
export const arrayOf = (items: SchemaObject): SchemaObject => ({ type: 'array', items });
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({ type: 'object', properties, required: Object.keys(properties) });

export const okResponse = object({ status: { type: 'string', enum: ['ok'] } });
export const reorderResponse = object({ ...okResponse.properties, reordered: integer });
export const departmentDeletedResponse = object({ ...okResponse.properties, departmentId: text });
export const employeeDeletedResponse = object({ ...okResponse.properties, employeeId: text });
export const wishDeletedResponse = object({ ...okResponse.properties, wishId: text });
export const departmentSummaryResponse = object({ id: text, name: text, kind: enumeration(DepartmentKind) });
export const manageableDepartmentResponse = object({ ...departmentSummaryResponse.properties, position: integer, updatedAt: timestamp });
export const departmentResponse = object({ ...manageableDepartmentResponse.properties, isActive: boolean, createdAt: timestamp });
export const employeeSummaryResponse = object({ id: text, displayName: text, departmentId: text });
const workPattern = {
  employmentRate: { type: 'number', enum: [1, 0.75, 0.5] } as SchemaObject,
  scheduleMode: enumeration(EmployeeScheduleMode),
  fixedStartTime: nullable(text), fixedEndTime: nullable(text),
};
export const employeeResponse = object({ ...employeeSummaryResponse.properties, ...workPattern, position: integer, isActive: boolean, isLinked: boolean, updatedAt: timestamp });
export const currentUserResponse = object({
  id: text, phoneE164: text,
  employee: nullable(object({ ...employeeSummaryResponse.properties, departmentName: text, ...workPattern })),
  memberships: arrayOf(object({ id: text, role: enumeration(RoleType), departmentId: nullable(text) })),
});
export const codeSentResponse = object({ status: { type: 'string', enum: ['sent'] }, expiresInSeconds: integer });
export const verifyCodeResponse = object({ expiresAt: timestamp, user: object({ id: text, phoneE164: text, onboardingRequired: boolean }) });
export const onboardingResponse = object({
  id: text, type: enumeration(OnboardingRequestType), status: enumeration(OnboardingRequestStatus),
  departmentId: text, employeeId: nullable(text), requestedDisplayName: nullable(text),
  reviewedAt: nullable(timestamp), createdAt: timestamp, updatedAt: timestamp,
});
export const onboardingStatusResponse = nullable(onboardingResponse);
export const onboardingPendingResponse = object({ ...onboardingResponse.properties,
  employee: nullable(object({ id: text, displayName: text })),
});
export const onboardingApprovedResponse = object({ request: onboardingResponse, employee: employeeSummaryResponse });
const scheduleVersion = object({ id: text, updatedAt: timestamp });
const period = object({ year: integer, month: integer });
const shifts = arrayOf(object({ id: text, employeeId: text, date: { type: 'string', format: 'date' }, code: nullable(text), startTime: nullable(text), endTime: nullable(text), isOff: boolean, updatedAt: timestamp }));
export const departmentScheduleResponse = object({
  period, schedule: nullable(scheduleVersion), department: departmentSummaryResponse,
  employees: arrayOf(object({ id: text, displayName: text, ...workPattern, position: integer, updatedAt: timestamp })), shifts,
});
export const personalScheduleResponse = object({
  period, schedule: nullable(scheduleVersion),
  employee: object({ id: text, displayName: text, ...workPattern, department: departmentSummaryResponse }), shifts,
});
export const scheduleAppliedResponse = object({ ...okResponse.properties, applied: integer, schedule: nullable(scheduleVersion) });

const jsonObject: SchemaObject = { type: 'object', additionalProperties: true };
export const schedulePublicationResponse = object({
  id: text,
  scheduleId: text,
  departmentId: text,
  version: integer,
  publishedByUserId: text,
  sourceScheduleUpdatedAt: timestamp,
  comment: nullable(text),
  rulesVersion: {
    ...nullable(text),
    description:
      'Server-owned ruleset identifier. Legacy publications may contain null.',
  },
  rulesSnapshot: {
    ...nullable(jsonObject),
    description:
      'Immutable managed-rules snapshot used for this publication. Legacy publications may contain null.',
  },
  snapshot: jsonObject,
  diff: jsonObject,
  createdAt: timestamp,
});
export const schedulePublicationListResponse = arrayOf(schedulePublicationResponse);
export const schedulePublicationValidationResponse = object({
  departmentId: text,
  period,
  rulesVersion: text,
  canPublish: boolean,
  violations: arrayOf(object({
    severity: { type: 'string', enum: ['hard', 'soft'] },
    code: text,
    message: text,
    employeeId: nullable(text),
    shiftId: nullable(text),
    date: nullable({ type: 'string', format: 'date' }),
  })),
});

export const scheduleRuleResponse = object({
  id: text,
  name: text,
  description: text,
  kind: enumeration(ScheduleRuleKind),
  scope: enumeration(ScheduleRuleScope),
  scopeValue: nullable(text),
  departmentId: nullable(text),
  priority: integer,
  severity: enumeration(ScheduleRuleSeverity),
  isActive: boolean,
  isDeleted: boolean,
  config: jsonObject,
  violationMessage: text,
  version: integer,
  createdByUserId: text,
  updatedByUserId: text,
  createdAt: timestamp,
  updatedAt: timestamp,
  editable: boolean,
});
export const scheduleRuleDeletedResponse = object({
  status: { type: 'string', enum: ['ok'] },
  ruleId: text,
});
export const scheduleRuleHistoryResponse = arrayOf(object({
  id: text,
  version: integer,
  snapshot: jsonObject,
  changedByUserId: text,
  createdAt: timestamp,
}));

export const wishResponse = object({ id: text, employeeId: text, year: integer, month: integer, day: nullable(integer), text, createdAt: timestamp, updatedAt: timestamp });
export const shiftChangeResponse = object({
  id: text, kind: enumeration(ShiftChangeRequestKind), status: enumeration(ShiftChangeRequestStatus),
  requesterEmployeeId: text, requesterDepartmentId: text,
  targetEmployeeId: text, targetDepartmentId: text,
  requesterShiftId: text, targetShiftId: nullable(text), requesterShiftUpdatedAt: timestamp, targetShiftUpdatedAt: nullable(timestamp),
  requesterEmployee: object({ displayName: text }), targetEmployee: object({ displayName: text }),
  requesterShift: object({ date: timestamp, startTime: nullable(text), endTime: nullable(text), code: nullable(text), isOff: boolean }),
  targetShift: nullable(object({ date: timestamp, startTime: nullable(text), endTime: nullable(text), code: nullable(text), isOff: boolean })),
  resolvedAt: nullable(timestamp), createdAt: timestamp, updatedAt: timestamp,
  events: arrayOf(object({ id: text, eventType: enumeration(ShiftChangeRequestEventType),
    metadata: { nullable: true, description: 'Optional JSON audit metadata.', oneOf: [{ type: 'object', additionalProperties: true }, { type: 'array', items: {} }, { type: 'string' }, { type: 'number' }, { type: 'boolean' }] }, createdAt: timestamp })),
});
export const shiftChangeTargetResponse = object({ id: text, displayName: text });
export const shiftChangeTargetShiftResponse = object({
  id: text, date: { type: 'string', format: 'date' }, startTime: text, endTime: text, code: nullable(text),
});
