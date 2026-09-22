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
