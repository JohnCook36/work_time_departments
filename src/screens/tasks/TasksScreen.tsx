import { AppSectionNav } from '../../components/navigation/AppSectionNav';
import {
  EmptyState,
  SectionCard,
  SectionContainer,
  SectionHeader,
  SectionPage,
  SectionSubtitle,
  SectionTitle,
} from '../shared/SectionPage.styles';

export function TasksScreen() {
  return (
    <SectionPage>
      <SectionContainer>
        <SectionHeader>
          <SectionTitle>Задачи</SectionTitle>
          <SectionSubtitle>
            Персональные рабочие задачи сотрудника.
          </SectionSubtitle>
          <AppSectionNav />
        </SectionHeader>

        <SectionCard>
          <EmptyState>
            Backend-модель задач и назначений ещё не интегрирована. Страница уже
            выделена как самостоятельный route, но не показывает выдуманные или
            локальные задачи до появления канонического server-backed API.
          </EmptyState>
        </SectionCard>
      </SectionContainer>
    </SectionPage>
  );
}
