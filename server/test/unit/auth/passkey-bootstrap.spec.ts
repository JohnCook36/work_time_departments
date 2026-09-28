import {
  assertPasskeyBootstrapInput,
} from '../../../src/auth/passkey-bootstrap.cli';

describe('Passkey bootstrap safety', () => {
  it('requires an explicit confirmation and employee id', () => {
    expect(() =>
      assertPasskeyBootstrapInput({
        confirmation: 'INITIAL_PASSKEY_BOOTSTRAP',
        employeeId: 'employee-1',
      }),
    ).not.toThrow();

    expect(() =>
      assertPasskeyBootstrapInput({
        employeeId: 'employee-1',
      }),
    ).toThrow(/AUTH_BOOTSTRAP_CONFIRM/);

    expect(() =>
      assertPasskeyBootstrapInput({
        confirmation: 'INITIAL_PASSKEY_BOOTSTRAP',
      }),
    ).toThrow(/Employee id/);
  });
});
