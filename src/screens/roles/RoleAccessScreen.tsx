import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  createMembershipAssignment,
  deactivateMembership,
  getManageableMemberships,
  replaceMembershipPermissions,
  type MembershipAssignment,
  type PermissionCapability,
  type RoleType,
} from '../../api/memberships';
import {
  getDepartmentPlannerSchedule,
  getManageableDepartments,
  type EmployeeResponse,
  type ManageableDepartmentResponse,
} from '../../api/planner';
import { hasCapability, useAuthUser } from '../../auth/AuthContext';
import { AppSectionNav } from '../../components/navigation/AppSectionNav';
import {
  EmptyState,
  SectionCard,
  SectionContainer,
  SectionGrid,
  SectionHeader,
  SectionPage,
  SectionSubtitle,
  SectionTitle,
} from '../shared/SectionPage.styles';
import {
  AssignmentCard,
  AssignmentList,
  AssignmentMeta,
  AssignmentTitle,
  AssignmentTop,
  CapabilityCheck,
  CapabilityGrid,
  InlineHint,
  RoleActions,
  RoleButton,
  RoleFeedback,
  RoleField,
  RoleSelect,
  RoleToolbar,
  SectionHeading,
} from './RoleAccessScreen.styles';

const ROLE_LABELS: Record<RoleType, string> = {
  SUPER_ADMIN: 'Суперадминистратор',
  DEPARTMENT_ADMIN: 'Администратор отдела',
  DEPUTY: 'Заместитель',
  EMPLOYEE: 'Сотрудник',
};

const CAPABILITY_LABELS: Record<PermissionCapability, string> = {
  SCHEDULE_READ: 'Просмотр графика',
  SCHEDULE_EDIT: 'Редактирование графика',
  SCHEDULE_PUBLISH: 'Публикация графика',
  EMPLOYEE_MANAGE: 'Управление сотрудниками',
  ONBOARDING_REVIEW: 'Подтверждение регистрации',
  SHIFT_CHANGE_APPROVE: 'Подтверждение обменов',
  SCHEDULE_RULE_MANAGE: 'Управление правилами',
  AUDIT_READ: 'Просмотр журнала',
  PRIVATE_PROFILE_READ: 'Просмотр приватного профиля',
  PRIVATE_PROFILE_EDIT: 'Изменение приватного профиля',
  ROLE_MANAGE: 'Управление ролями',
};

const ALL_CAPABILITIES = Object.keys(
  CAPABILITY_LABELS,
) as PermissionCapability[];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function RoleAccessScreen() {
  const user = useAuthUser();
  const isSuperAdmin = user.memberships.some(
    membership => membership.role === 'SUPER_ADMIN',
  );

  const [departments, setDepartments] = useState<ManageableDepartmentResponse[]>(
    [],
  );
  const [scope, setScope] = useState('');
  const [candidateDepartmentId, setCandidateDepartmentId] = useState('');
  const [employees, setEmployees] = useState<EmployeeResponse[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [role, setRole] = useState<RoleType>(
    isSuperAdmin ? 'DEPARTMENT_ADMIN' : 'DEPUTY',
  );
  const [newPermissions, setNewPermissions] = useState<PermissionCapability[]>(
    [],
  );
  const [assignments, setAssignments] = useState<MembershipAssignment[]>([]);
  const [permissionDrafts, setPermissionDrafts] = useState<
    Record<string, PermissionCapability[]>
  >({});
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isError, setIsError] = useState(false);

  const manageableRoles = useMemo<RoleType[]>(
    () =>
      isSuperAdmin
        ? ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'DEPUTY', 'EMPLOYEE']
        : ['DEPUTY', 'EMPLOYEE'],
    [isSuperAdmin],
  );

  const grantableCapabilities = useMemo(() => {
    if (isSuperAdmin) return ALL_CAPABILITIES;
    const departmentAdmin = user.memberships.some(
      membership =>
        membership.role === 'DEPARTMENT_ADMIN' &&
        membership.departmentId === candidateDepartmentId,
    );
    if (departmentAdmin) return ALL_CAPABILITIES;

    const granted = new Set<PermissionCapability>();
    user.memberships.forEach(membership => {
      if (membership.departmentId !== candidateDepartmentId) return;
      (membership.permissions || []).forEach(permission => {
        if (permission in CAPABILITY_LABELS) {
          granted.add(permission as PermissionCapability);
        }
      });
    });
    return ALL_CAPABILITIES.filter(capability => granted.has(capability));
  }, [candidateDepartmentId, isSuperAdmin, user.memberships]);

  const loadAssignments = useCallback(async (nextScope: string) => {
    setBusy(true);
    try {
      const result = await getManageableMemberships(
        nextScope === 'GLOBAL' ? undefined : nextScope || undefined,
      );
      setAssignments(result);
      setPermissionDrafts(
        Object.fromEntries(
          result.map(item => [item.id, [...item.permissions]]),
        ),
      );
      setConfirmDeactivateId(null);
      setFeedback('');
      setIsError(false);
    } catch (error) {
      setAssignments([]);
      setFeedback(errorMessage(error, 'Не удалось загрузить назначения.'));
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void getManageableDepartments()
      .then(result => {
        setDepartments(result);
        const firstDepartment = result[0]?.id || '';
        setCandidateDepartmentId(firstDepartment);
        const initialScope = firstDepartment || (isSuperAdmin ? 'GLOBAL' : '');
        setScope(initialScope);
        if (initialScope) void loadAssignments(initialScope);
      })
      .catch(error => {
        setFeedback(errorMessage(error, 'Не удалось загрузить отделы.'));
        setIsError(true);
      });
  }, [isSuperAdmin, loadAssignments]);

  useEffect(() => {
    if (!candidateDepartmentId) {
      setEmployees([]);
      setEmployeeId('');
      return;
    }

    const now = new Date();
    void getDepartmentPlannerSchedule(
      candidateDepartmentId,
      now.getFullYear(),
      now.getMonth() + 1,
    )
      .then(result => {
        const linked = result.employees.filter(employee => employee.isLinked);
        setEmployees(linked);
        setEmployeeId(current =>
          linked.some(employee => employee.id === current)
            ? current
            : linked[0]?.id || '',
        );
      })
      .catch(error => {
        setEmployees([]);
        setEmployeeId('');
        setFeedback(
          errorMessage(error, 'Не удалось загрузить сотрудников отдела.'),
        );
        setIsError(true);
      });
  }, [candidateDepartmentId]);

  useEffect(() => {
    setNewPermissions(current =>
      current.filter(permission => grantableCapabilities.includes(permission)),
    );
  }, [grantableCapabilities]);

  const toggleNewPermission = (capability: PermissionCapability) => {
    setNewPermissions(current =>
      current.includes(capability)
        ? current.filter(item => item !== capability)
        : [...current, capability],
    );
  };

  const createAssignment = async () => {
    if (!employeeId) {
      setFeedback('Выберите сотрудника.');
      setIsError(true);
      return;
    }

    if (role !== 'SUPER_ADMIN' && !candidateDepartmentId) {
      setFeedback('Выберите отдел назначения.');
      setIsError(true);
      return;
    }

    setBusy(true);
    try {
      await createMembershipAssignment({
        employeeId,
        departmentId: role === 'SUPER_ADMIN' ? null : candidateDepartmentId,
        role,
        ...(role === 'DEPUTY' ? { permissions: newPermissions } : {}),
      });
      const targetScope =
        role === 'SUPER_ADMIN' ? 'GLOBAL' : candidateDepartmentId;
      setScope(targetScope);
      setNewPermissions([]);
      setFeedback('Назначение создано.');
      setIsError(false);
      await loadAssignments(targetScope);
    } catch (error) {
      setFeedback(errorMessage(error, 'Не удалось создать назначение.'));
      setIsError(true);
    } finally {
      setBusy(false);
    }
  };

  const savePermissions = async (assignment: MembershipAssignment) => {
    const permissions = permissionDrafts[assignment.id] || [];
    setBusy(true);
    try {
      const updated = await replaceMembershipPermissions(
        assignment.id,
        permissions,
        assignment.updatedAt,
      );
      setAssignments(current =>
        current.map(item => (item.id === updated.id ? updated : item)),
      );
      setPermissionDrafts(current => ({
        ...current,
        [updated.id]: [...updated.permissions],
      }));
      setFeedback('Права заместителя обновлены.');
      setIsError(false);
    } catch (error) {
      setFeedback(errorMessage(error, 'Не удалось обновить права.'));
      setIsError(true);
      if (scope) await loadAssignments(scope);
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async (assignment: MembershipAssignment) => {
    if (confirmDeactivateId !== assignment.id) {
      setConfirmDeactivateId(assignment.id);
      setFeedback('Повторно нажмите «Отключить доступ» для подтверждения.');
      setIsError(false);
      return;
    }

    setBusy(true);
    try {
      await deactivateMembership(assignment.id, assignment.updatedAt);
      setAssignments(current =>
        current.filter(item => item.id !== assignment.id),
      );
      setConfirmDeactivateId(null);
      setFeedback('Назначение отключено.');
      setIsError(false);
    } catch (error) {
      setFeedback(errorMessage(error, 'Не удалось отключить назначение.'));
      setIsError(true);
      if (scope) await loadAssignments(scope);
    } finally {
      setBusy(false);
    }
  };

  if (!hasCapability(user, 'ROLE_MANAGE')) {
    return (
      <SectionPage>
        <SectionContainer>
          <SectionHeader>
            <SectionTitle>Роли и доступ</SectionTitle>
            <AppSectionNav />
          </SectionHeader>
          <SectionCard>
            <EmptyState>Нет доступа к управлению ролями.</EmptyState>
          </SectionCard>
        </SectionContainer>
      </SectionPage>
    );
  }

  return (
    <SectionPage>
      <SectionContainer>
        <SectionHeader>
          <SectionTitle>Роли и доступ</SectionTitle>
          <SectionSubtitle>
            Назначения и явные права заместителей. Backend повторно проверяет
            каждый scope и запрещает повышение доступа выше ваших полномочий.
          </SectionSubtitle>
          <AppSectionNav />
        </SectionHeader>

        <SectionGrid>
          <SectionCard>
            <SectionHeading>Новое назначение</SectionHeading>
            <RoleToolbar>
              <RoleField>
                Отдел сотрудника
                <RoleSelect
                  value={candidateDepartmentId}
                  onChange={event =>
                    setCandidateDepartmentId(event.target.value)
                  }
                >
                  {departments.map(department => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </RoleSelect>
              </RoleField>

              <RoleField>
                Сотрудник
                <RoleSelect
                  value={employeeId}
                  onChange={event => setEmployeeId(event.target.value)}
                >
                  {employees.length === 0 && (
                    <option value="">Нет связанных сотрудников</option>
                  )}
                  {employees.map(employee => (
                    <option key={employee.id} value={employee.id}>
                      {employee.displayName}
                    </option>
                  ))}
                </RoleSelect>
              </RoleField>

              <RoleField>
                Роль
                <RoleSelect
                  value={role}
                  onChange={event => {
                    const nextRole = event.target.value as RoleType;
                    setRole(nextRole);
                    if (nextRole !== 'DEPUTY') setNewPermissions([]);
                  }}
                >
                  {manageableRoles.map(item => (
                    <option key={item} value={item}>
                      {ROLE_LABELS[item]}
                    </option>
                  ))}
                </RoleSelect>
              </RoleField>
            </RoleToolbar>

            {role === 'SUPER_ADMIN' && (
              <InlineHint>
                Суперадминистратор — глобальная роль. Выбранный отдел нужен
                только для поиска сотрудника.
              </InlineHint>
            )}

            {role === 'DEPUTY' && (
              <>
                <SectionHeading>Явные права заместителя</SectionHeading>
                <CapabilityGrid>
                  {grantableCapabilities.map(capability => (
                    <CapabilityCheck key={capability}>
                      <input
                        type="checkbox"
                        checked={newPermissions.includes(capability)}
                        onChange={() => toggleNewPermission(capability)}
                      />
                      <span>{CAPABILITY_LABELS[capability]}</span>
                    </CapabilityCheck>
                  ))}
                </CapabilityGrid>
              </>
            )}

            <RoleActions>
              <RoleButton
                type="button"
                $variant="primary"
                disabled={busy || !employeeId}
                onClick={() => void createAssignment()}
              >
                Создать назначение
              </RoleButton>
            </RoleActions>

            <RoleFeedback role={isError ? 'alert' : 'status'} $error={isError}>
              {feedback || ' '}
            </RoleFeedback>
          </SectionCard>

          <SectionCard>
            <SectionHeading>Действующие назначения</SectionHeading>
            <RoleToolbar>
              <RoleField>
                Scope
                <RoleSelect
                  value={scope}
                  onChange={event => {
                    const nextScope = event.target.value;
                    setScope(nextScope);
                    if (nextScope) void loadAssignments(nextScope);
                  }}
                >
                  {isSuperAdmin && (
                    <option value="GLOBAL">Глобальные роли</option>
                  )}
                  {departments.map(department => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </RoleSelect>
              </RoleField>
            </RoleToolbar>

            {assignments.length === 0 && !busy ? (
              <EmptyState>Активных назначений в выбранном scope нет.</EmptyState>
            ) : (
              <AssignmentList aria-label="Назначения ролей">
                {assignments.map(assignment => {
                  const draft =
                    permissionDrafts[assignment.id] || assignment.permissions;
                  const assignmentDepartment = assignment.departmentId || '';
                  const editableCapabilities =
                    isSuperAdmin ||
                    user.memberships.some(
                      membership =>
                        membership.role === 'DEPARTMENT_ADMIN' &&
                        membership.departmentId === assignmentDepartment,
                    )
                      ? ALL_CAPABILITIES
                      : ALL_CAPABILITIES.filter(capability =>
                          user.memberships.some(
                            membership =>
                              membership.departmentId === assignmentDepartment &&
                              membership.permissions?.includes(capability),
                          ),
                        );

                  return (
                    <AssignmentCard
                      key={assignment.id}
                      aria-label={
                        'Назначение ' +
                        (assignment.employee?.displayName || 'без сотрудника')
                      }
                    >
                      <AssignmentTop>
                        <div>
                          <AssignmentTitle>
                            {assignment.employee?.displayName ||
                              'Связанный сотрудник недоступен'}
                          </AssignmentTitle>
                          <AssignmentMeta>
                            {ROLE_LABELS[assignment.role]} ·{' '}
                            {assignment.departmentId
                              ? departments.find(
                                  department =>
                                    department.id === assignment.departmentId,
                                )?.name || assignment.departmentId
                              : 'Глобальный scope'}
                          </AssignmentMeta>
                        </div>

                        <RoleActions>
                          <RoleButton
                            type="button"
                            $variant={
                              confirmDeactivateId === assignment.id
                                ? 'danger'
                                : 'secondary'
                            }
                            disabled={busy}
                            onClick={() => void deactivate(assignment)}
                          >
                            {confirmDeactivateId === assignment.id
                              ? 'Подтвердить отключение'
                              : 'Отключить доступ'}
                          </RoleButton>
                        </RoleActions>
                      </AssignmentTop>

                      {assignment.role === 'DEPUTY' && (
                        <>
                          <CapabilityGrid>
                            {ALL_CAPABILITIES.map(capability => {
                              const editable =
                                editableCapabilities.includes(capability);
                              return (
                                <CapabilityCheck key={capability}>
                                  <input
                                    type="checkbox"
                                    checked={draft.includes(capability)}
                                    disabled={!editable || busy}
                                    onChange={() =>
                                      setPermissionDrafts(current => {
                                        const existing =
                                          current[assignment.id] ||
                                          assignment.permissions;
                                        return {
                                          ...current,
                                          [assignment.id]: existing.includes(
                                            capability,
                                          )
                                            ? existing.filter(
                                                item => item !== capability,
                                              )
                                            : [...existing, capability],
                                        };
                                      })
                                    }
                                  />
                                  <span>{CAPABILITY_LABELS[capability]}</span>
                                </CapabilityCheck>
                              );
                            })}
                          </CapabilityGrid>
                          <RoleActions>
                            <RoleButton
                              type="button"
                              $variant="primary"
                              disabled={busy}
                              onClick={() => void savePermissions(assignment)}
                            >
                              Сохранить права
                            </RoleButton>
                          </RoleActions>
                        </>
                      )}
                    </AssignmentCard>
                  );
                })}
              </AssignmentList>
            )}
          </SectionCard>
        </SectionGrid>
      </SectionContainer>
    </SectionPage>
  );
}
