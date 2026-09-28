import { businessDateText, publishedShiftInterval } from '../../../src/hours/business-time';
import { comparePlanActual } from '../../../src/hours/plan-actual';

describe('plan actual comparison', () => {
  beforeEach(() => {
    process.env.BUSINESS_TIME_ZONE = 'Europe/Moscow';
  });

  it('resolves the canonical business date independently of caller timezone', () => {
    expect(
      businessDateText(
        new Date('2026-09-28T21:30:00.000Z'),
        'Europe/Moscow',
      ),
    ).toBe('2026-09-29');
  });

  it('keeps overnight shifts on one interval', () => {
    const shift = publishedShiftInterval('2026-09-28', '20:00', '08:00');
    expect(shift.startAt.toISOString()).toBe('2026-09-28T17:00:00.000Z');
    expect(shift.endAt.toISOString()).toBe('2026-09-29T05:00:00.000Z');
  });

  it('derives attendance deviations without payable assumptions', () => {
    const shift = publishedShiftInterval('2026-09-28', '08:00', '17:00');
    expect(comparePlanActual(shift.startAt, shift.endAt, {
      checkInAt: new Date('2026-09-28T05:15:00.000Z'),
      checkOutAt: new Date('2026-09-28T13:30:00.000Z'),
    })).toMatchObject({
      status: 'COMPLETED',
      latenessMinutes: 15,
      earlyLeaveMinutes: 30,
      payableAvailable: false,
    });
  });
});
