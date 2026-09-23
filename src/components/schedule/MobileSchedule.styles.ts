import styled from '@emotion/styled';

import { MobileEmployeeCard } from '../../theme/styles';

export const MobileDays = styled('div')({
  display: 'grid',
  gap: 6,
});

export const SortableMobileEmployeeCard = styled(MobileEmployeeCard)<{
  $transform?: string;
  $transition?: string;
}>(({ $transform, $transition }) => ({
  transform: $transform,
  transition: $transition,
}));
