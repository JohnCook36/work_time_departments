import { AlertTriangle, CheckCircle2, FileSpreadsheet, X } from 'lucide-react';
import { ExcelImportPreview } from '../../services/excel/importExcel';
import {
  ActionButton,
  Drawer,
  DrawerHeader,
  DrawerOverlay,
  DrawerSubtitle,
  DrawerTitle,
  IconButton,
  TinyText,
} from '../../theme/styles';
import {
  ApplyImportButton,
  ImportAlertTitle,
  ImportBox,
  ImportContent,
  ImportHint,
  ImportStatsGrid,
  ImportTitleRow,
  InvalidDetail,
  InvalidItem,
  InvalidList,
  InvalidValue,
  NameTag,
  NameTags,
  OverwriteCheckbox,
  OverwriteHelp,
  OverwriteLabel,
  SuccessBox,
  SuccessIconSlot,
  WarningItem,
} from './ExcelImportDrawer.styles';

interface ExcelImportDrawerProps {
  preview: ExcelImportPreview;
  conflictCount: number;
  overwriteExisting: boolean;
  onOverwriteChange: (value: boolean) => void;
  onApply: () => void;
  onClose: () => void;
  busy?: boolean;
}

export function ExcelImportDrawer({
  preview,
  conflictCount,
  overwriteExisting,
  onOverwriteChange,
  onApply,
  onClose,
  busy = false,
}: ExcelImportDrawerProps) {
  const matchedEntries = preview.entries.filter(
    (entry) => entry.employeeId !== null
  ).length;

  return (
    <DrawerOverlay onMouseDown={onClose}>
      <Drawer onMouseDown={(event) => event.stopPropagation()}>
        <DrawerHeader>
          <div>
            <DrawerTitle>Импорт графика из Excel</DrawerTitle>
            <DrawerSubtitle>
              {preview.fileName} • лист «{preview.sheetName}»
            </DrawerSubtitle>
          </div>
          <IconButton type="button" onClick={onClose} title="Закрыть" disabled={busy}>
            <X size={18} />
          </IconButton>
        </DrawerHeader>

        <ImportContent>
          <ImportBox>
            <ImportTitleRow>
              <FileSpreadsheet size={18} />
              <strong>Предпросмотр импорта</strong>
            </ImportTitleRow>

            <ImportStatsGrid>
              <TinyText>Совпало сотрудников</TinyText>
              <strong>{preview.matchedEmployees.length}</strong>

              <TinyText>Распознано смен</TinyText>
              <strong>{matchedEntries}</strong>

              <TinyText>Дней в файле</TinyText>
              <strong>
                {preview.detectedDays.length
                  ? preview.detectedDays[0] +
                    '–' +
                    preview.detectedDays[preview.detectedDays.length - 1]
                  : '—'}
              </strong>

              <TinyText>Некорректных смен</TinyText>
              <strong>{preview.invalidCells.length}</strong>

              <TinyText>Конфликтов с текущим графиком</TinyText>
              <strong>{conflictCount}</strong>
            </ImportStatsGrid>
          </ImportBox>

          {preview.unknownEmployees.length > 0 && (
            <ImportBox $tone="warning">
              <ImportAlertTitle>
                <AlertTriangle size={17} />
                Не найдены в текущем графике
              </ImportAlertTitle>

              <ImportHint>
                Эти строки будут пропущены. Сотрудники автоматически не создаются.
              </ImportHint>

              <NameTags>
                {preview.unknownEmployees.map((name) => (
                  <NameTag key={name}>
                    {name}
                  </NameTag>
                ))}
              </NameTags>
            </ImportBox>
          )}

          {preview.ambiguousEmployees.length > 0 && (
            <ImportBox $tone="warning">
              <ImportAlertTitle>
                <AlertTriangle size={17} />
                Неоднозначное совпадение сотрудников
              </ImportAlertTitle>

              <ImportHint>
                В текущем графике найдено несколько сотрудников с одинаковым именем.
                Такие строки будут пропущены до ручного уточнения.
              </ImportHint>

              <NameTags>
                {preview.ambiguousEmployees.map((name) => (
                  <NameTag key={name}>
                    {name}
                  </NameTag>
                ))}
              </NameTags>
            </ImportBox>
          )}

          {preview.invalidCells.length > 0 && (
            <ImportBox $tone="danger">
              <ImportAlertTitle>
                <AlertTriangle size={17} />
                Некорректные смены
              </ImportAlertTitle>

              <ImportHint>
                Эти ячейки не будут импортированы. Показаны первые 12 ошибок.
              </ImportHint>

              <InvalidList>
                {preview.invalidCells.slice(0, 12).map((item, index) => (
                  <InvalidItem key={item.employeeName + '-' + item.day + '-' + index}>
                    <strong>{item.employeeName}</strong> · день {item.day}
                    <InvalidValue>
                      Значение: {item.scheduleValue || item.actualTimeValue || 'пусто'}
                    </InvalidValue>
                    <InvalidDetail>{item.reason}</InvalidDetail>
                  </InvalidItem>
                ))}
              </InvalidList>
            </ImportBox>
          )}

          {preview.warnings.map((warning) => (
            <WarningItem key={warning}>
              {warning}
            </WarningItem>
          ))}

          <OverwriteLabel
          >
            <OverwriteCheckbox
              type="checkbox"
              checked={overwriteExisting}
              disabled={busy}
              onChange={(event) => onOverwriteChange(event.target.checked)}
            />
            <span>
              <strong>Перезаписывать заполненные ячейки</strong>
              <OverwriteHelp>
                По умолчанию существующие смены защищены и импорт заполняет только
                пустые ячейки.
              </OverwriteHelp>
            </span>
          </OverwriteLabel>

          <SuccessBox $tone="success">
            <SuccessIconSlot><CheckCircle2 size={17} /></SuccessIconSlot>
            <TinyText>
              Импорт будет применён к месяцу, который сейчас открыт в приложении.
            </TinyText>
          </SuccessBox>
        </ImportContent>

        <ApplyImportButton
          type="button"
          $variant="primary"
          onClick={onApply}
          disabled={matchedEntries === 0 || busy}
        >
          {busy ? 'Применяю…' : 'Применить импорт'}
        </ApplyImportButton>
      </Drawer>
    </DrawerOverlay>
  );
}
