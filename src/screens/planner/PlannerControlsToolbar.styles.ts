import styled from '@emotion/styled';

import { Select, TextInput } from '../../theme/styles';

export const FixedTimeInput = styled(TextInput)({
  width: 118,
});

export const HiddenFileInput = styled('input')({
  display: 'none',
});

export const PrintRangeSelect = styled(Select)({
  minWidth: 150,
});


export const EmployeeForm = styled('form')({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  flexWrap: 'wrap',
  flex: '1 1 auto',
  '@media (max-width: 760px)': {
    display: 'grid',
    gridTemplateColumns: '1fr',
    width: '100%',
  },
});

export const EmployeeNameField = styled('div')({
  display: 'grid',
  gap: 5,
  flex: '1 1 240px',
  minWidth: 220,
  '@media (max-width: 760px)': {
    minWidth: 0,
    width: '100%',
  },
});

export const EmployeeNameInput = styled(TextInput)({
  width: '100%',
  minWidth: 0,
});

export const EmployeeFieldError = styled('div')(({ theme }) => ({
  color: theme.colors.danger,
  fontSize: 11,
  lineHeight: 1.3,
  paddingLeft: 2,
}));

export const EmployeeFormStatus = styled('div')(({ theme }) => ({
  width: '100%',
  color: theme.colors.danger,
  fontSize: 11,
  lineHeight: 1.3,
}));
