import { ThemeProvider } from '@emotion/react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMySchedule, type AuthUser, type MyScheduleShift } from '../../../src/api/auth';
import {
  createShiftChangeRequest, getIncomingShiftChangeRequests, getMyShiftChangeRequests,
  getPendingShiftChangeRequests, getShiftChangeTargets, getShiftChangeTargetShift,
  respondToShiftChangeRequest, shiftChangeStatusLabel, type ShiftChangeRequest,
} from '../../../src/api/shiftChangeRequests';
import { AuthUserContext } from '../../../src/auth/AuthContext';
import { eligibleSourceShifts, ShiftRequestComposer } from '../../../src/screens/shift-requests/ShiftRequestComposer';
import { ShiftRequestsScreen } from '../../../src/screens/shift-requests/ShiftRequestsScreen';
import { getTheme } from '../../../src/theme/theme';

vi.mock('../../../src/api/auth', async importOriginal => ({ ...(await importOriginal<typeof import('../../../src/api/auth')>()), getMySchedule: vi.fn() }));
vi.mock('../../../src/api/shiftChangeRequests', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../src/api/shiftChangeRequests')>()),
  createShiftChangeRequest: vi.fn(), getIncomingShiftChangeRequests: vi.fn(),
  getMyShiftChangeRequests: vi.fn(), getPendingShiftChangeRequests: vi.fn(),
  getShiftChangeTargets: vi.fn(), getShiftChangeTargetShift: vi.fn(), respondToShiftChangeRequest: vi.fn(),
}));

const source: MyScheduleShift = { id: 'shift-a', employeeId: 'employee-a', date: '2026-09-28', code: null, startTime: '08:00', endTime: '17:00', isOff: false, updatedAt: '2026-09-01' };
const admin: AuthUser = { id: 'user-a', phoneE164: '+79990000000', employee: { id: 'employee-a', displayName: 'А', departmentId: 'dep', employmentRate: 1, scheduleMode: 'FLEXIBLE', fixedStartTime: null, fixedEndTime: null }, memberships: [{ id: 'membership', role: 'DEPARTMENT_ADMIN', departmentId: 'dep' }] };
const request: ShiftChangeRequest = { id: 'request-1', kind: 'COVER', status: 'PENDING_TARGET', requesterEmployeeId: 'employee-a', targetEmployeeId: 'employee-b', requesterEmployee: { displayName: 'А' }, targetEmployee: { displayName: 'Б' }, requesterShift: source, targetShift: null, createdAt: '2026-09-20' };

function renderWithUser(node: ReactElement, user: AuthUser = admin) {
  return render(<ThemeProvider theme={getTheme('light')}><AuthUserContext.Provider value={user}><MemoryRouter>{node}</MemoryRouter></AuthUserContext.Provider></ThemeProvider>);
}

describe('shift request UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getShiftChangeTargets).mockResolvedValue([{ id: 'employee-b', displayName: 'Б' }]);
    vi.mocked(getShiftChangeTargetShift).mockResolvedValue({ id: 'shift-b', date: '2026-09-30', startTime: '09:00', endTime: '18:00', code: null });
    vi.mocked(getMyShiftChangeRequests).mockResolvedValue([]);
    vi.mocked(getIncomingShiftChangeRequests).mockResolvedValue([]);
    vi.mocked(getPendingShiftChangeRequests).mockResolvedValue([]);
    vi.mocked(getMySchedule).mockResolvedValue({ period: { year: 2026, month: 9 }, schedule: { id: 'schedule', updatedAt: '' }, employee: { id: 'employee-a', displayName: 'А', employmentRate: 1, scheduleMode: 'FLEXIBLE', fixedStartTime: null, fixedEndTime: null, department: { id: 'dep', name: 'Отдел', kind: 'GENERAL' } }, shifts: [source] });
    vi.mocked(createShiftChangeRequest).mockResolvedValue(request);
    vi.mocked(respondToShiftChangeRequest).mockResolvedValue(request);
  });

  it('never offers OFF, synthetic or unpublished shifts as persisted source', () => {
    expect(eligibleSourceShifts([source, { ...source, id: 'off', isOff: true }, { ...source, id: 'default:employee-a:2026-09-28' }], true)).toEqual([source]);
    expect(eligibleSourceShifts([source], false)).toEqual([]);
  });

  it('creates COVER with the real source ID and no target shift', async () => {
    renderWithUser(<ShiftRequestComposer sources={[source]} onCreated={vi.fn()} />);
    await userEvent.setup().selectOptions(await screen.findByLabelText('Сотрудник'), 'employee-b');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Отправить запрос' }));
    await waitFor(() => expect(createShiftChangeRequest).toHaveBeenCalledWith({ kind: 'COVER', requesterShiftId: 'shift-a', targetEmployeeId: 'employee-b' }));
    expect(screen.getByText(/Вы отдаёте: 2026-09-28/)).toBeInTheDocument();
  });

  it('looks up just one target shift and previews SWAP before sending', async () => {
    renderWithUser(<ShiftRequestComposer sources={[source]} onCreated={vi.fn()} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Тип запроса'), 'SWAP');
    await user.selectOptions(await screen.findByLabelText('Сотрудник'), 'employee-b');
    fireEvent.change(screen.getByLabelText('Дата смены сотрудника'), { target: { value: '2026-09-30' } });
    await waitFor(() => expect(getShiftChangeTargetShift).toHaveBeenCalledWith('employee-b', '2026-09-30', 'shift-a'));
    expect(await screen.findByText(/Вы получаете: 2026-09-30/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Отправить запрос' }));
    await waitFor(() => expect(createShiftChangeRequest).toHaveBeenCalledWith({ kind: 'SWAP', requesterShiftId: 'shift-a', targetEmployeeId: 'employee-b', targetShiftId: 'shift-b' }));
  });

  it('renders Russian status labels and hides management actions from employee', async () => {
    expect(Object.values(shiftChangeStatusLabel)).toHaveLength(7);
    vi.mocked(getMyShiftChangeRequests).mockResolvedValue([request]);
    vi.mocked(getIncomingShiftChangeRequests).mockResolvedValue([request]);
    const employee = { ...admin, memberships: [] };
    renderWithUser(<ShiftRequestsScreen />, employee);
    expect(await screen.findAllByText(/Ожидает ответа сотрудника/)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Одобрить' })).not.toBeInTheDocument();
    expect(screen.queryByText('На подтверждение')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Отменить' }));
    await waitFor(() => expect(respondToShiftChangeRequest).toHaveBeenCalledWith('request-1', 'cancel'));
  });

  it('allows target accept/reject and manager approve/reject with draft notice', async () => {
    vi.mocked(getIncomingShiftChangeRequests).mockResolvedValue([request]);
    vi.mocked(getPendingShiftChangeRequests).mockResolvedValue([{ ...request, status: 'PENDING_MANAGER' }]);
    renderWithUser(<ShiftRequestsScreen />);
    const incoming = await screen.findByLabelText('Входящие');
    await userEvent.setup().click(within(incoming).getByRole('button', { name: 'Согласиться' }));
    await waitFor(() => expect(respondToShiftChangeRequest).toHaveBeenCalledWith('request-1', 'accept'));
    await userEvent.setup().click(within(incoming).getByRole('button', { name: 'Отказаться' }));
    await waitFor(() => expect(respondToShiftChangeRequest).toHaveBeenCalledWith('request-1', 'reject'));
    const pending = screen.getByLabelText('На подтверждение');
    await userEvent.setup().click(within(pending).getByRole('button', { name: 'Одобрить' }));
    await waitFor(() => expect(respondToShiftChangeRequest).toHaveBeenCalledWith('request-1', 'admin/approve'));
    expect(screen.getByText(/Чтобы оно стало официальным/)).toBeInTheDocument();
    await userEvent.setup().click(within(pending).getByRole('button', { name: 'Отклонить' }));
    await waitFor(() => expect(respondToShiftChangeRequest).toHaveBeenCalledWith('request-1', 'admin/reject'));
  });

  it('refreshes after 409 and never shows fake approval', async () => {
    vi.mocked(getPendingShiftChangeRequests).mockResolvedValue([{ ...request, status: 'PENDING_MANAGER' }]);
    vi.mocked(respondToShiftChangeRequest).mockRejectedValue(new (await import('../../../src/api/auth')).ApiError('stale', 409));
    renderWithUser(<ShiftRequestsScreen />);
    await userEvent.setup().click(within(await screen.findByLabelText('На подтверждение')).getByRole('button', { name: 'Одобрить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Смена уже изменилась');
    expect(getPendingShiftChangeRequests).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Одобрено руководителем')).not.toBeInTheDocument();
  });
});
