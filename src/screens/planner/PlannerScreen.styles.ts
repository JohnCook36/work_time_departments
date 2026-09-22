import styled from '@emotion/styled';

import { Card, Muted } from '../../theme/styles';

export const EmployeeSelfServiceCard = styled(Card)({
  marginTop: 14,
  padding: 22,
});

export const EmployeeSelfServiceText = styled(Muted)({
  marginTop: 6,
});

export const PoweredByLine = styled('div')({
  marginTop: 6,
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
});
