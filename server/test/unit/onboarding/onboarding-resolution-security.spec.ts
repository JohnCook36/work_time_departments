import { ConflictException } from '@nestjs/common';
import {
  AuditAction,
  AuditEntityType,
  OnboardingRequestStatus,
  OnboardingRequestType,
  RoleType,
} from '@prisma/client';

import { AuthUserContext } from '../../../src/auth/auth.service';
import { AuthorizationService } from '../../../src/auth/authorization.service';
import { OnboardingService } from '../../../src/onboarding/onboarding.service';

const admin: AuthUserContext = {
  id: 'admin-user',
  phoneE164: '+79990000001',
  employee: null,
  memberships: [
    {
      id: 'admin-membership',
      role: RoleType.DEPARTMENT_ADMIN,
      departmentId: 'department-a',
    },
  ],
};

function pendingLinkRequest() {
  return {
    id: 'request-1',
    userId: 'requester-user',
    type: OnboardingRequestType.LINK_EXISTING,
    status: OnboardingRequestStatus.PENDING,
    departmentId: 'department-a',
    employeeId: 'employee-1',
    requestedDisplayName: null,
    reviewedByUserId: null,
    reviewedAt: null,
    createdAt: new Date('2026-09-24T10:00:00.000Z'),
    updatedAt: new Date('2026-09-24T10:00:00.000Z'),
  };
}

function createPrismaMock() {
  const tx = {
    onboardingRequest: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    department: {
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    employee: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    membership: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const prisma = {
    onboardingRequest: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };

  return { prisma, tx };
}

describe('OnboardingService atomic resolution and stale scope protection', () => {
  it('rejects approval when the target employee moved out of the request department', async () => {
    const { prisma, tx } = createPrismaMock();
    const request = pendingLinkRequest();

    prisma.onboardingRequest.findUnique.mockResolvedValue(request);
    tx.onboardingRequest.updateMany.mockResolvedValue({ count: 1 });
    tx.department.findFirst.mockResolvedValue({ id: 'department-a' });
    tx.user.findUnique.mockResolvedValue({
      id: 'requester-user',
      isActive: true,
      employee: null,
    });
    tx.employee.findUnique.mockResolvedValue({
      id: 'employee-1',
      displayName: 'Moved employee',
      departmentId: 'department-b',
      userId: null,
      isActive: true,
    });

    const service = new OnboardingService(
      prisma as never,
      new AuthorizationService(),
    );

    await expect(service.approve(admin, request.id)).rejects.toThrow(
      'Employee profile moved to another department',
    );

    expect(tx.employee.updateMany).not.toHaveBeenCalled();
    expect(tx.membership.create).not.toHaveBeenCalled();
  });

  it('does not let concurrent approvals claim the same employee twice', async () => {
    const { prisma, tx } = createPrismaMock();
    const request = pendingLinkRequest();

    prisma.onboardingRequest.findUnique.mockResolvedValue(request);
    tx.onboardingRequest.updateMany.mockResolvedValue({ count: 1 });
    tx.department.findFirst.mockResolvedValue({ id: 'department-a' });
    tx.user.findUnique.mockResolvedValue({
      id: 'requester-user',
      isActive: true,
      employee: null,
    });
    tx.employee.findUnique.mockResolvedValue({
      id: 'employee-1',
      displayName: 'Target employee',
      departmentId: 'department-a',
      userId: null,
      isActive: true,
    });
    tx.employee.updateMany.mockResolvedValue({ count: 0 });

    const service = new OnboardingService(
      prisma as never,
      new AuthorizationService(),
    );

    await expect(service.approve(admin, request.id)).rejects.toThrow(
      'Employee profile changed during approval',
    );

    expect(tx.employee.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'employee-1',
        userId: null,
        isActive: true,
        departmentId: 'department-a',
      },
      data: { userId: 'requester-user' },
    });
    expect(tx.membership.create).not.toHaveBeenCalled();
  });

  it('claims a pending request atomically before approval side effects', async () => {
    const { prisma, tx } = createPrismaMock();
    const request = pendingLinkRequest();

    prisma.onboardingRequest.findUnique.mockResolvedValue(request);
    tx.onboardingRequest.updateMany.mockResolvedValue({ count: 0 });

    const service = new OnboardingService(
      prisma as never,
      new AuthorizationService(),
    );

    await expect(service.approve(admin, request.id)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(tx.onboardingRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: request.id,
          status: OnboardingRequestStatus.PENDING,
        },
        data: expect.objectContaining({
          status: OnboardingRequestStatus.APPROVED,
          reviewedByUserId: admin.id,
          reviewedAt: expect.any(Date),
        }),
      }),
    );
    expect(tx.department.findFirst).not.toHaveBeenCalled();
    expect(tx.user.findUnique).not.toHaveBeenCalled();
  });

  it('writes an audit event when approval succeeds', async () => {
    const { prisma, tx } = createPrismaMock();
    const request = pendingLinkRequest();
    const approved = {
      ...request,
      status: OnboardingRequestStatus.APPROVED,
      reviewedByUserId: admin.id,
      reviewedAt: new Date('2026-09-24T10:05:00.000Z'),
    };

    prisma.onboardingRequest.findUnique.mockResolvedValue(request);
    tx.onboardingRequest.updateMany.mockResolvedValue({ count: 1 });
    tx.department.findFirst.mockResolvedValue({ id: 'department-a' });
    tx.user.findUnique.mockResolvedValue({
      id: 'requester-user',
      isActive: true,
      employee: null,
    });
    tx.employee.findUnique
      .mockResolvedValueOnce({
        id: 'employee-1',
        displayName: 'Target employee',
        departmentId: 'department-a',
        userId: null,
        isActive: true,
      })
      .mockResolvedValueOnce({
        id: 'employee-1',
        displayName: 'Target employee',
        departmentId: 'department-a',
      });
    tx.employee.updateMany.mockResolvedValue({ count: 1 });
    tx.membership.findFirst.mockResolvedValue({ id: 'membership-1' });
    tx.onboardingRequest.findUnique.mockResolvedValue(approved);

    const service = new OnboardingService(
      prisma as never,
      new AuthorizationService(),
    );

    await service.approve(admin, request.id);

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: admin.id,
        action: AuditAction.ONBOARDING_APPROVED,
        entityType: AuditEntityType.ONBOARDING_REQUEST,
        entityId: request.id,
        departmentId: request.departmentId,
      },
      select: { id: true },
    });
  });

  it('writes an audit event when rejection succeeds', async () => {
    const { prisma, tx } = createPrismaMock();
    const request = pendingLinkRequest();
    const rejectedRequest = {
      ...request,
      status: OnboardingRequestStatus.REJECTED,
      reviewedByUserId: admin.id,
      reviewedAt: new Date('2026-09-24T10:05:00.000Z'),
    };

    prisma.onboardingRequest.findUnique.mockResolvedValue(request);
    tx.onboardingRequest.updateMany.mockResolvedValue({ count: 1 });
    tx.onboardingRequest.findUnique.mockResolvedValue(rejectedRequest);

    const service = new OnboardingService(
      prisma as never,
      new AuthorizationService(),
    );

    await service.reject(admin, request.id);

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: admin.id,
        action: AuditAction.ONBOARDING_REJECTED,
        entityType: AuditEntityType.ONBOARDING_REQUEST,
        entityId: request.id,
        departmentId: request.departmentId,
      },
      select: { id: true },
    });
  });

  it('does not let cancel overwrite a request resolved concurrently', async () => {
    const { prisma } = createPrismaMock();
    const request = pendingLinkRequest();

    prisma.onboardingRequest.findFirst.mockResolvedValue(request);
    prisma.onboardingRequest.updateMany.mockResolvedValue({ count: 0 });

    const service = new OnboardingService(
      prisma as never,
      new AuthorizationService(),
    );

    await expect(
      service.cancelMyPendingRequest({
        id: request.userId,
        phoneE164: '+79990000002',
        employee: null,
        memberships: [],
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.onboardingRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: request.id,
        userId: request.userId,
        status: OnboardingRequestStatus.PENDING,
      },
      data: { status: OnboardingRequestStatus.CANCELED },
    });
  });

  it('does not let reject overwrite a request resolved concurrently', async () => {
    const { prisma, tx } = createPrismaMock();
    const request = pendingLinkRequest();

    prisma.onboardingRequest.findUnique.mockResolvedValue(request);
    tx.onboardingRequest.updateMany.mockResolvedValue({ count: 0 });

    const service = new OnboardingService(
      prisma as never,
      new AuthorizationService(),
    );

    await expect(service.reject(admin, request.id)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(tx.onboardingRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: request.id,
          status: OnboardingRequestStatus.PENDING,
        },
        data: expect.objectContaining({
          status: OnboardingRequestStatus.REJECTED,
          reviewedByUserId: admin.id,
          reviewedAt: expect.any(Date),
        }),
      }),
    );
  });
});
