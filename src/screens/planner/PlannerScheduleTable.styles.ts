import styled from '@emotion/styled';

import {
  EmployeeRow,
  ErrorCard,
  ShiftDisplay,
} from '../../theme/styles';

export const SortableDepartmentRow = styled('tr')<{
  $transform?: string;
  $transition?: string;
  $dragging: boolean;
}>(({ $transform, $transition, $dragging }) => ({
  transform: $transform,
  transition: $transition,
  opacity: $dragging ? 0.55 : 1,
}));

export const SortableEmployeeTableRow = styled(EmployeeRow)<{
  $transform?: string;
  $transition?: string;
}>(({ $transform, $transition }) => ({
  transform: $transform,
  transition: $transition,
}));

export const FixedScheduleBadge = styled('span')({
  flex: '0 0 auto',
  padding: '2px 6px',
  borderRadius: 999,
  fontSize: 9,
  fontWeight: 800,
  opacity: 0.72,
  whiteSpace: 'nowrap',
});

export const HoursShiftDisplay = styled(ShiftDisplay)({
  flexDirection: 'column',
  gap: 1,
  lineHeight: 1.08,
  cursor: 'default',
});

export const HourLine = styled('span')({
  fontSize: 9,
});

export const HourTotal = styled('strong')({
  fontSize: 10,
});

export const ErrorPanelTitle = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontWeight: 800,
});

export const ErrorPanelList = styled('div')({
  marginTop: 8,
  display: 'grid',
  gap: 4,
  fontSize: 13,
});

export const StyledErrorCard = styled(ErrorCard)({});


export const EmployeeIdentity = styled('div')({
  display: 'grid',
  gap: 2,
  minWidth: 0,
  flex: '1 1 auto',
});

export const EmployeeScheduleMeta = styled('div')(({ theme }) => ({
  minWidth: 0,
  color: theme.colors.textMuted,
  fontSize: 10,
  lineHeight: 1.25,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}));


export const ShiftTimeLine = styled('span')({
  fontSize: 9,
  lineHeight: 1.05,
  whiteSpace: 'nowrap',
});
