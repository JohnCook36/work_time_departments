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
  columnGap: 10,
  rowGap: 0,
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
  gridTemplateRows: '40px 16px',
  gap: 4,
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
  minHeight: 16,
  color: theme.colors.danger,
  fontSize: 11,
  lineHeight: '16px',
  paddingLeft: 2,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}));

export const EmployeeFormStatus = styled('div')(({ theme }) => ({
  width: '100%',
  minHeight: 16,
  color: theme.colors.danger,
  fontSize: 11,
  lineHeight: '16px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}));
