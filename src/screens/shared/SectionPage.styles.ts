import styled from '@emotion/styled';

import { Card, Container, Page } from '../../theme/styles';

export const SectionPage = styled(Page)({
  display: 'grid',
  placeItems: 'start center',
});

export const SectionContainer = styled(Container)({
  maxWidth: 920,
});

export const SectionHeader = styled('header')({
  display: 'grid',
  gap: 12,
  marginBottom: 16,
});

export const SectionTitle = styled('h1')(({ theme }) => ({
  margin: 0,
  color: theme.colors.text,
  fontSize: 24,
  lineHeight: 1.2,
  '@media (max-width: 720px)': {
    fontSize: 20,
  },
}));

export const SectionSubtitle = styled('p')(({ theme }) => ({
  margin: 0,
  color: theme.colors.textMuted,
  fontSize: 13,
  lineHeight: 1.5,
}));

export const SectionCard = styled(Card)({
  padding: 18,
});

export const SectionGrid = styled('div')({
  display: 'grid',
  gap: 12,
});

export const DataRow = styled('div')(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(130px, 180px) 1fr',
  gap: 12,
  padding: '10px 0',
  borderBottom: '1px solid ' + theme.colors.border,
  ':last-of-type': {
    borderBottom: 0,
  },
  '@media (max-width: 620px)': {
    gridTemplateColumns: '1fr',
    gap: 4,
  },
}));

export const DataLabel = styled('div')(({ theme }) => ({
  color: theme.colors.textMuted,
  fontSize: 12,
  fontWeight: 800,
}));

export const DataValue = styled('div')(({ theme }) => ({
  color: theme.colors.text,
  fontSize: 14,
  fontWeight: 700,
  overflowWrap: 'anywhere',
}));

export const EmptyState = styled('div')(({ theme }) => ({
  padding: '28px 18px',
  borderRadius: 14,
  border: '1px dashed ' + theme.colors.border,
  color: theme.colors.textMuted,
  textAlign: 'center',
  fontSize: 13,
  lineHeight: 1.55,
}));
