import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject, SchemaObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { SESSION_COOKIE_NAME } from '../../src/auth/auth.utils';
import { setupOpenApi } from '../../src/openapi';
import { PrismaService } from '../../src/prisma/prisma.service';

const { version } = require('../../package.json') as { version: string };

describe('OpenAPI documentation', () => {
  let app: INestApplication;
  let document: OpenAPIObject;
  let url: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue({}).compile();
    app = moduleRef.createNestApplication();
    document = setupOpenApi(app);
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });
  afterAll(async () => { await app?.close(); });

  it('generates versioned documentation with the canonical session cookie', () => {
    expect(document.openapi).toMatch(/^3\./);
    expect(document.info).toMatchObject({ title: 'Work time departments API', version });
    expect(document.components?.securitySchemes?.session).toMatchObject({
      type: 'apiKey', in: 'cookie', name: SESSION_COOKIE_NAME,
    });
    for (const [path, method] of [['/auth/request-code', 'post'], ['/auth/verify-code', 'post'], ['/health', 'get']]) {
      expect(document.paths[path][method as 'get']?.security ?? []).toEqual([]);
    }
    expect(document.paths['/employees'].post?.security).toEqual(
      expect.arrayContaining([{ session: [] }, { sessionBearer: [] }]),
    );
  });

  it.each([
    ['/health', 'get'], ['/auth/request-code', 'post'], ['/auth/verify-code', 'post'],
    ['/auth/me', 'get'], ['/auth/logout', 'post'],
    ['/onboarding/registration-request', 'post'], ['/onboarding/admin/{requestId}/approve', 'post'],
    ['/departments/manageable', 'get'], ['/departments', 'post'], ['/departments/reorder', 'patch'],
    ['/departments/{departmentId}/deactivate', 'patch'], ['/departments/{departmentId}', 'patch'],
    ['/employees', 'post'], ['/employees', 'get'], ['/employees/{employeeId}', 'patch'],
    ['/employees/{employeeId}/deactivate', 'patch'], ['/employees/reorder', 'patch'],
    ['/schedule-data/department', 'get'], ['/schedule-data/me', 'get'],
    ['/schedule-data/department/entries', 'patch'], ['/schedule-data/planner/entries', 'patch'],
    ['/shift-change-requests', 'post'], ['/shift-change-requests/mine', 'get'],
    ['/shift-change-requests/{id}/accept', 'post'], ['/shift-change-requests/{id}/admin/approve', 'post'],
    ['/wishes/department', 'get'], ['/wishes', 'post'], ['/wishes/{wishId}', 'delete'],
  ])('discovers %s %s from the real controllers', (path, method) => {
    const operation = document.paths[path]?.[method as 'get'];
    expect(operation?.summary).toBeTruthy();
    expect(operation?.tags?.length).toBeGreaterThan(0);
    expect(Object.values(operation!.responses).some(response =>
      response && 'content' in response && response.content?.['application/json']?.schema,
    )).toBe(true);
  });

  it('preserves required create fields and optimistic/nullable mutation semantics', () => {
    const schemas = document.components!.schemas! as Record<string, SchemaObject>;
    expect(document.paths['/employees'].post?.requestBody).toMatchObject({
      content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateEmployeeDto' } } },
    });
    expect(schemas.CreateEmployeeDto.required).toEqual(expect.arrayContaining(['displayName', 'departmentId']));
    expect(schemas.UpdateEmployeeDto.required).toEqual(['expectedUpdatedAt']);
    expect(schemas.DeactivateEmployeeDto.required).toEqual(['expectedUpdatedAt']);
    expect(schemas.UpdateDepartmentDto.required).toEqual(['expectedUpdatedAt']);
    expect(schemas.ScheduleCellChangeDto.required).toEqual(expect.arrayContaining(['employeeId', 'day', 'type']));
    expect(schemas.ScheduleCellChangeDto.required).not.toContain('expectedUpdatedAt');
    expect(schemas.ScheduleCellChangeDto.properties?.expectedUpdatedAt).toMatchObject({ nullable: true });
    expect(document.paths['/schedule-data/planner/entries'].patch?.requestBody).toMatchObject({
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ApplyPlannerChangesDto' } } },
    });
    expect(schemas.ApplyPlannerChangesDto.properties?.changes).toMatchObject({
      type: 'array', items: { $ref: '#/components/schemas/ScheduleCellChangeDto' },
    });
    expect(schemas.CreateWishDto.properties?.day).toMatchObject({ nullable: true });
    expect(schemas.CreateWishDto.required).not.toContain('day');
    expect(document.paths['/shift-change-requests/{id}/admin/approve'].post?.summary).toContain('does not mutate Shift');
  });

  it('serves Swagger UI, its assets and the non-empty raw JSON over HTTP', async () => {
    const ui = await fetch(url + '/docs');
    expect(ui.status).toBe(200);
    expect(ui.headers.get('content-type')).toContain('text/html');
    expect(await ui.text()).toContain('swagger-ui');
    const script = await fetch(url + '/docs/swagger-ui-init.js');
    expect(script.status).toBe(200);
    expect(await script.text()).toContain('Work time departments API');
    const json = await fetch(url + '/docs/openapi.json');
    expect(json.status).toBe(200);
    const served = await json.json();
    expect(served).toEqual(document);
    expect(Object.keys(served.paths).length).toBeGreaterThan(25);
  });

  it('does not expose session internals or OTP examples, and keeps guards active', async () => {
    expect(JSON.stringify(document)).not.toMatch(/tokenHash|codeHash|AUTH_OTP_PEPPER|AUTH_DEV_OTP_CODE|DATABASE_URL|postgresql:\/\//);
    const schemas = document.components!.schemas! as Record<string, SchemaObject>;
    expect(schemas.VerifyCodeDto.properties?.code).toMatchObject({ writeOnly: true });
    expect(schemas.VerifyCodeDto.properties?.code).not.toHaveProperty('example');
    for (const path of ['/employees?departmentId=example', '/auth/me', '/schedule-data/me?year=2026&month=9']) {
      expect((await fetch(url + path)).status).toBe(401);
    }
  });
});
