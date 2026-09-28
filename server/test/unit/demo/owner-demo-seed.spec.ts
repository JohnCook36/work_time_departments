import {
  assertDemoSeedEnvironment,
  DEMO_SEED_CONFIRMATION,
} from '../../../src/demo/owner-demo-seed';

describe('owner demo seed safety', () => {
  const demoUrl =
    'postgresql://demo:demo@127.0.0.1:5432/work_time_departments_demo';

  it('accepts only an explicit non-production demo/test database', () => {
    expect(() =>
      assertDemoSeedEnvironment({
        databaseUrl: demoUrl,
        nodeEnv: 'development',
        confirmation: DEMO_SEED_CONFIRMATION,
      }),
    ).not.toThrow();

    expect(() =>
      assertDemoSeedEnvironment({
        databaseUrl:
          'postgresql://demo:demo@127.0.0.1:5432/work_time_departments_test',
        nodeEnv: 'test',
        confirmation: DEMO_SEED_CONFIRMATION,
      }),
    ).not.toThrow();
  });

  it('fails closed for production, missing confirmation or ordinary databases', () => {
    expect(() =>
      assertDemoSeedEnvironment({
        databaseUrl: demoUrl,
        nodeEnv: 'production',
        confirmation: DEMO_SEED_CONFIRMATION,
      }),
    ).toThrow(/forbidden/);

    expect(() =>
      assertDemoSeedEnvironment({
        databaseUrl: demoUrl,
        nodeEnv: 'development',
      }),
    ).toThrow(/DEMO_SEED_CONFIRM/);

    expect(() =>
      assertDemoSeedEnvironment({
        databaseUrl:
          'postgresql://demo:demo@127.0.0.1:5432/work_time_departments',
        nodeEnv: 'development',
        confirmation: DEMO_SEED_CONFIRMATION,
      }),
    ).toThrow(/demo or test/);

    expect(() =>
      assertDemoSeedEnvironment({
        databaseUrl:
          'postgresql://demo:demo@127.0.0.1:5432/contest_production',
        nodeEnv: 'development',
        confirmation: DEMO_SEED_CONFIRMATION,
      }),
    ).toThrow(/database-name segment/);
  });
});
