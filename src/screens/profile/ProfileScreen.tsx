import { AppSectionNav } from '../../components/navigation/AppSectionNav';
import { useAuthUser } from '../../auth/AuthContext';
import {
  DataLabel,
  DataRow,
  DataValue,
  SectionCard,
  SectionContainer,
  SectionGrid,
  SectionHeader,
  SectionPage,
  SectionSubtitle,
  SectionTitle,
} from '../shared/SectionPage.styles';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Суперадминистратор',
  DEPARTMENT_ADMIN: 'Администратор отдела',
  DEPUTY: 'Заместитель',
  EMPLOYEE: 'Сотрудник',
};

export function ProfileScreen() {
  const user = useAuthUser();
  const employee = user.employee;

  const roles = user.memberships
    .map((membership) => ROLE_LABELS[membership.role] || membership.role)
    .join(', ');

  const scheduleLabel =
    employee?.scheduleMode === 'FIXED_WEEKDAYS' &&
    employee.fixedStartTime &&
    employee.fixedEndTime
      ? '5/2 · ' + employee.fixedStartTime + '–' + employee.fixedEndTime
      : 'Плавающий график';

  return (
    <SectionPage>
      <SectionContainer>
        <SectionHeader>
          <SectionTitle>Профиль</SectionTitle>
          <SectionSubtitle>
            Данные текущего авторизованного аккаунта и связанного сотрудника.
          </SectionSubtitle>
          <AppSectionNav />
        </SectionHeader>

        <SectionCard>
          <SectionGrid>
            <DataRow>
              <DataLabel>Сотрудник</DataLabel>
              <DataValue>{employee?.displayName || 'Профиль сотрудника не связан'}</DataValue>
            </DataRow>

            <DataRow>
              <DataLabel>Телефон</DataLabel>
              <DataValue>{user.phoneE164}</DataValue>
            </DataRow>

            <DataRow>
              <DataLabel>Роль</DataLabel>
              <DataValue>{roles || 'Не назначена'}</DataValue>
            </DataRow>

            {employee && (
              <>
                <DataRow>
                  <DataLabel>Ставка</DataLabel>
                  <DataValue>{employee.employmentRate}</DataValue>
                </DataRow>

                <DataRow>
                  <DataLabel>Режим графика</DataLabel>
                  <DataValue>{scheduleLabel}</DataValue>
                </DataRow>

                <DataRow>
                  <DataLabel>Отдел</DataLabel>
                  <DataValue>{employee.departmentName || 'Не указан'}</DataValue>
                </DataRow>
              </>
            )}
          </SectionGrid>
        </SectionCard>
      </SectionContainer>
    </SectionPage>
  );
}
