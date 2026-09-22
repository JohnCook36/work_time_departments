import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const schema = readFileSync(
  join(__dirname, '../../../prisma/schema.prisma'),
  'utf8',
);

function block(kind: 'model' | 'enum', name: string): string {
  const match = schema.match(
    new RegExp(`${kind}\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`),
  );

  if (!match) throw new Error(`${kind} ${name} is missing from schema.prisma`);
  return match[1];
}

describe('Prisma schema invariants', () => {
  it('keeps schedules and employee shifts unique within their business keys', () => {
    expect(block('model', 'Schedule')).toContain('@@unique([year, month])');
    expect(block('model', 'Shift')).toContain(
      '@@unique([scheduleId, employeeId, date])',
    );
  });

  it('defines an optional one-to-one User to Employee link', () => {
    const user = block('model', 'User');
    const employee = block('model', 'Employee');

    expect(user).toMatch(/employee\s+Employee\?/);
    expect(employee).toMatch(/userId\s+String\?\s+@unique/);
    expect(employee).toMatch(/user\s+User\?.+onDelete:\s*SetNull/);
  });

  it('scopes memberships through indexed user and optional department relations', () => {
    const membership = block('model', 'Membership');
    const department = block('model', 'Department');

    expect(membership).toMatch(/userId\s+String/);
    expect(membership).toMatch(/departmentId\s+String\?/);
    expect(membership).toMatch(/user\s+User.+onDelete:\s*Cascade/);
    expect(membership).toMatch(/department\s+Department\?.+onDelete:\s*Cascade/);
    expect(membership).toContain('@@index([userId])');
    expect(membership).toContain('@@index([departmentId])');
    expect(department).toMatch(/memberships\s+Membership\[\]/);
  });

  it('locks the current RoleType contract', () => {
    const roles = block('enum', 'RoleType')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    expect(roles).toEqual([
      'SUPER_ADMIN',
      'DEPARTMENT_ADMIN',
      'DEPUTY',
      'EMPLOYEE',
    ]);
    expect(block('model', 'Membership')).toMatch(/role\s+RoleType/);
  });

  it('keeps employmentRate on Employee with a full-time default', () => {
    expect(block('model', 'Employee')).toMatch(
      /employmentRate\s+Float\s+@default\(1\)/,
    );
  });

  it('keeps department ordering, activity defaults and inverse relations', () => {
    const department = block('model', 'Department');

    expect(department).toMatch(/kind\s+DepartmentKind\s+@default\(GENERAL\)/);
    expect(department).toMatch(/position\s+Int\s+@default\(0\)/);
    expect(department).toMatch(/isActive\s+Boolean\s+@default\(true\)/);
    expect(department).toMatch(/employees\s+Employee\[\]/);
    expect(department).toMatch(/memberships\s+Membership\[\]/);
  });

  it('keeps authenticated users unique by phone and active by default', () => {
    const user = block('model', 'User');

    expect(user).toMatch(/phoneE164\s+String\s+@unique\s+@db\.VarChar\(32\)/);
    expect(user).toMatch(/isActive\s+Boolean\s+@default\(true\)/);
    expect(user).toMatch(/memberships\s+Membership\[\]/);
  });

  it('keeps membership activity and role lookup contracts', () => {
    const membership = block('model', 'Membership');

    expect(membership).toMatch(/isActive\s+Boolean\s+@default\(true\)/);
    expect(membership).toContain('@@index([role])');
  });

  it('keeps shift ownership restrictive and its calendar date database-native', () => {
    const shift = block('model', 'Shift');

    expect(shift).toMatch(/date\s+DateTime\s+@db\.Date/);
    expect(shift).toMatch(/schedule\s+Schedule.+onDelete:\s*Cascade/);
    expect(shift).toMatch(/employee\s+Employee.+onDelete:\s*Restrict/);
  });

  it('retains indexes used by department, schedule and wish lookups', () => {
    expect(block('model', 'Employee')).toContain('@@index([departmentId])');
    expect(block('model', 'Shift')).toContain('@@index([employeeId])');
    expect(block('model', 'Shift')).toContain('@@index([scheduleId])');
    expect(block('model', 'EmployeeWish')).toContain('@@index([employeeId])');
  });
});
