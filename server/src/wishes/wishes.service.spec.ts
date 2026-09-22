import { BadRequestException, NotFoundException } from '@nestjs/common';

import { WishesService } from './wishes.service';

describe('WishesService', () => {
  const prisma = {
    department: {
      findFirst: jest.fn(),
    },
    employee: {
      findFirst: jest.fn(),
    },
    employeeWish: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };

  const authorization = {
    assertCanAdministerDepartment: jest.fn(),
  };

  const service = new WishesService(
    prisma as never,
    authorization as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.department.findFirst.mockResolvedValue({ id: 'department-a' });
    prisma.employee.findFirst.mockResolvedValue({
      id: 'employee-a',
      departmentId: 'department-a',
    });
    prisma.employeeWish.findMany.mockResolvedValue([]);
  });

  it('lists wishes only for the requested department and period', async () => {
    await service.listDepartmentWishes(
      { id: 'admin', phoneE164: '+70000000000', employee: null, memberships: [] },
      'department-a',
      2026,
      9,
    );

    expect(
      authorization.assertCanAdministerDepartment,
    ).toHaveBeenCalledWith(expect.anything(), 'department-a');
    expect(prisma.employeeWish.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          year: 2026,
          month: 9,
          employee: {
            departmentId: 'department-a',
            isActive: true,
          },
        },
      }),
    );
  });

  it('creates a trimmed day-specific wish for an active Employee', async () => {
    prisma.employeeWish.create.mockResolvedValue({
      id: 'wish-a',
      employeeId: 'employee-a',
      year: 2026,
      month: 9,
      day: 22,
      text: 'Желательно выходной',
      createdAt: new Date('2026-09-22T08:00:00.000Z'),
      updatedAt: new Date('2026-09-22T08:00:00.000Z'),
    });

    const result = await service.createWish(
      { id: 'admin', phoneE164: '+70000000000', employee: null, memberships: [] },
      {
        employeeId: 'employee-a',
        year: 2026,
        month: 9,
        day: 22,
        text: '  Желательно выходной  ',
      },
    );

    expect(
      authorization.assertCanAdministerDepartment,
    ).toHaveBeenCalledWith(expect.anything(), 'department-a');
    expect(prisma.employeeWish.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          employeeId: 'employee-a',
          year: 2026,
          month: 9,
          day: 22,
          text: 'Желательно выходной',
        },
      }),
    );
    expect(result.id).toBe('wish-a');
  });

  it('accepts a general monthly wish with day=null', async () => {
    prisma.employeeWish.create.mockResolvedValue({
      id: 'wish-a',
      employeeId: 'employee-a',
      year: 2026,
      month: 9,
      day: null,
      text: 'Не ставить поздние смены',
      createdAt: new Date('2026-09-22T08:00:00.000Z'),
      updatedAt: new Date('2026-09-22T08:00:00.000Z'),
    });

    await service.createWish(
      { id: 'admin', phoneE164: '+70000000000', employee: null, memberships: [] },
      {
        employeeId: 'employee-a',
        year: 2026,
        month: 9,
        day: null,
        text: 'Не ставить поздние смены',
      },
    );

    expect(prisma.employeeWish.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ day: null }),
      }),
    );
  });

  it('rejects a day outside the selected month', async () => {
    await expect(
      service.createWish(
        { id: 'admin', phoneE164: '+70000000000', employee: null, memberships: [] },
        {
          employeeId: 'employee-a',
          year: 2026,
          month: 2,
          day: 30,
          text: 'Выходной',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.employeeWish.create).not.toHaveBeenCalled();
  });

  it('rejects wish creation for an inactive or missing Employee', async () => {
    prisma.employee.findFirst.mockResolvedValue(null);

    await expect(
      service.createWish(
        { id: 'admin', phoneE164: '+70000000000', employee: null, memberships: [] },
        {
          employeeId: 'missing',
          year: 2026,
          month: 9,
          text: 'Выходной',
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes a wish only after checking Employee department scope', async () => {
    prisma.employeeWish.findUnique.mockResolvedValue({
      id: 'wish-a',
      employee: {
        departmentId: 'department-a',
        isActive: true,
        department: {
          isActive: true,
        },
      },
    });
    prisma.employeeWish.delete.mockResolvedValue({ id: 'wish-a' });

    const result = await service.deleteWish(
      { id: 'admin', phoneE164: '+70000000000', employee: null, memberships: [] },
      'wish-a',
    );

    expect(
      authorization.assertCanAdministerDepartment,
    ).toHaveBeenCalledWith(expect.anything(), 'department-a');
    expect(prisma.employeeWish.delete).toHaveBeenCalledWith({
      where: { id: 'wish-a' },
    });
    expect(result).toEqual({ status: 'ok', wishId: 'wish-a' });
  });
});
