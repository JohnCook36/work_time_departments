import { useRef } from 'react';
import {
  FileSpreadsheet,
  FileUp,
  Printer,
  Trash2,
  X,
} from 'lucide-react';

import {
  ActionButton,
  DrawerHeader,
  DrawerOverlay,
  DrawerSubtitle,
  DrawerTitle,
  FormGroup,
  FormLabel,
  IconButton,
  Select,
} from '../../theme/styles';
import {
  CompactDrawer,
  DrawerButtonGrid,
  FullWidthActionButton,
  DrawerSection,
  DrawerSectionTitle,
  HiddenFileInput,
} from './styles';

interface PrintRange {
  key: string;
  label: string;
}

interface PlannerScheduleToolsDrawerProps {
  canImportExcel: boolean;
  isImportingExcel: boolean;
  isApplyingExcelImport: boolean;
  onExcelFile: (file: File | null) => void;
  excelRangeKey: string;
  onExcelRangeChange: (value: string) => void;
  isExportingExcel: boolean;
  onExportExcel: () => void;
  printRangeKey: string;
  onPrintRangeChange: (value: string) => void;
  printCalendarWeekRanges: PrintRange[];
  isPreparingPrint: boolean;
  onPrint: () => void;
  canBulkEditSchedule: boolean;
  isApplyingBulkSchedule: boolean;
  onFillOffAll: () => void;
  onClearAll: () => void;
  onClose: () => void;
}

export function PlannerScheduleToolsDrawer({
  canImportExcel,
  isImportingExcel,
  isApplyingExcelImport,
  onExcelFile,
  excelRangeKey,
  onExcelRangeChange,
  isExportingExcel,
  onExportExcel,
  printRangeKey,
  onPrintRangeChange,
  printCalendarWeekRanges,
  isPreparingPrint,
  onPrint,
  canBulkEditSchedule,
  isApplyingBulkSchedule,
  onFillOffAll,
  onClearAll,
  onClose,
}: PlannerScheduleToolsDrawerProps) {
  const excelFileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <DrawerOverlay onMouseDown={onClose}>
      <CompactDrawer onMouseDown={(event) => event.stopPropagation()}>
        <DrawerHeader>
          <div>
            <DrawerTitle>Управление графиком</DrawerTitle>
            <DrawerSubtitle>
              Импорт, экспорт, печать и массовые действия вынесены из основной
              панели.
            </DrawerSubtitle>
          </div>

          <IconButton type="button" onClick={onClose} title="Закрыть">
            <X size={18} />
          </IconButton>
        </DrawerHeader>

        <DrawerSection>
          <DrawerSectionTitle>Excel</DrawerSectionTitle>

          <FormGroup>
            <FormLabel htmlFor="excel-range">Период экспорта</FormLabel>
            <Select
              id="excel-range"
              value={excelRangeKey}
              disabled={isExportingExcel}
              onChange={(event) => onExcelRangeChange(event.target.value)}
            >
              <option value="month">Весь месяц</option>
              {printCalendarWeekRanges.map((range) => (
                <option key={range.key} value={range.key}>{range.label}</option>
              ))}
            </Select>
          </FormGroup>

          <HiddenFileInput
            ref={excelFileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              onExcelFile(event.target.files?.[0] || null);
              event.currentTarget.value = '';
            }}
          />

          <DrawerButtonGrid>
            <ActionButton
              type="button"
              onClick={() => excelFileInputRef.current?.click()}
              disabled={
                !canImportExcel || isImportingExcel || isApplyingExcelImport
              }
            >
              <FileUp size={16} />
              {isImportingExcel ? 'Читаю…' : 'Импорт Excel'}
            </ActionButton>

            <ActionButton
              type="button"
              $variant="accent"
              onClick={onExportExcel}
              disabled={isExportingExcel}
            >
              <FileSpreadsheet size={16} />
              {isExportingExcel ? 'Формирую…' : 'Экспорт Excel'}
            </ActionButton>
          </DrawerButtonGrid>
        </DrawerSection>

        <DrawerSection>
          <DrawerSectionTitle>Печать</DrawerSectionTitle>

          <FormGroup>
            <FormLabel>Период</FormLabel>
            <Select
              value={printRangeKey}
              disabled={isPreparingPrint}
              onChange={(event) => onPrintRangeChange(event.target.value)}
            >
              <option value="month">Весь месяц</option>
              {printCalendarWeekRanges.map((range) => (
                <option key={range.key} value={range.key}>
                  Неделя {range.label}
                </option>
              ))}
            </Select>
          </FormGroup>

          <FullWidthActionButton
            type="button"
            onClick={onPrint}
            disabled={isPreparingPrint}
          >
            <Printer size={16} />
            {isPreparingPrint ? 'Готовлю…' : 'Печать'}
          </FullWidthActionButton>
        </DrawerSection>

        <DrawerSection>
          <DrawerSectionTitle>Массовые действия</DrawerSectionTitle>

          <DrawerButtonGrid>
            <ActionButton
              type="button"
              onClick={onFillOffAll}
              disabled={!canBulkEditSchedule}
            >
              {isApplyingBulkSchedule ? 'Применяю…' : 'OFF всем'}
            </ActionButton>

            <ActionButton
              type="button"
              $variant="danger"
              onClick={onClearAll}
              disabled={!canBulkEditSchedule}
            >
              <Trash2 size={15} />
              {isApplyingBulkSchedule ? 'Применяю…' : 'Очистить месяц'}
            </ActionButton>
          </DrawerButtonGrid>
        </DrawerSection>
      </CompactDrawer>
    </DrawerOverlay>
  );
}
