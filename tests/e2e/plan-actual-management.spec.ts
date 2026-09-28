import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`plan actual route is usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('**/auth/me', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'manager',
        phoneE164: '+79990000000',
        employee: null,
        memberships: [{ id: 'membership', role: 'DEPARTMENT_ADMIN', departmentId: 'department-a', permissions: [] }],
      }),
    }));
    await page.route('**/management/plan-actual?**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        period: { year: 2026, month: 9 },
        businessTimeZone: 'Europe/Moscow',
        payableAvailable: false,
        rows: [{
          departmentId: 'department-a',
          departmentName: 'Front Office',
          publicationId: 'publication-1',
          publicationVersion: 4,
          shiftId: 'shift-1',
          employeeId: 'employee-1',
          displayName: 'Иванов И.И.',
          date: '2026-09-26',
          code: null,
          startTime: '08:00',
          endTime: '17:00',
          workSessionId: 'session-1',
          status: 'COMPLETED',
          plannedStartAt: '2026-09-26T05:00:00.000Z',
          plannedEndAt: '2026-09-26T14:00:00.000Z',
          actualCheckInAt: '2026-09-26T05:15:00.000Z',
          actualCheckOutAt: '2026-09-26T13:30:00.000Z',
          plannedMinutes: 540,
          plannedDayMinutes: 540,
          plannedNightMinutes: 0,
          actualMinutes: 495,
          actualDayMinutes: 495,
          actualNightMinutes: 0,
          deltaMinutes: -45,
          latenessMinutes: 15,
          earlyLeaveMinutes: 30,
          overtimeMinutes: 0,
          undertimeMinutes: 45,
          payableAvailable: false,
        }],
        unplannedSessions: [],
      }),
    }));

    await page.goto('http://127.0.0.1:4174/plan-actual');
    await expect(page.getByRole('heading', { name: 'План / факт' })).toBeVisible();
    await expect(page.getByText('Иванов И.И.')).toBeVisible();
    await expect(page.getByText('Ранний уход')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
