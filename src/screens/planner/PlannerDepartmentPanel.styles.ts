import styled from '@emotion/styled';

import { Select, TextInput } from '../../theme/styles';

export const DepartmentNameInput = styled(TextInput)({
  flex: '0 1 220px',
});

export const CompactDepartmentSelect = styled(Select)({
  minHeight: 32,
  padding: '0 8px',
});
