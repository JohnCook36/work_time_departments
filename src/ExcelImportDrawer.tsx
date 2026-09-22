import { AlertTriangle, CheckCircle2, FileSpreadsheet, X } from 'lucide-react';
import { ExcelImportPreview } from './importExcel';
import {
  ActionButton,
  Drawer,
  DrawerHeader,
  DrawerOverlay,
  DrawerSubtitle,
  DrawerTitle,
  IconButton,
  TinyText,
} from './styles';

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

        <div
          style={{
            display: 'grid',
            gap: 10,
            marginTop: 12,
          }}
        >
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              border: '1px solid rgba(148,163,184,.28)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileSpreadsheet size={18} />
              <strong>Предпросмотр импорта</strong>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                marginTop: 12,
              }}
            >
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
            </div>
          </div>

          {preview.unknownEmployees.length > 0 && (
            <div
              style={{
                padding: 12,
                borderRadius: 12,
                border: '1px solid rgba(245,158,11,.35)',
                background: 'rgba(245,158,11,.08)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  fontWeight: 800,
                }}
              >
                <AlertTriangle size={17} />
                Не найдены в текущем графике
              </div>

              <TinyText style={{ marginTop: 7 }}>
                Эти строки будут пропущены. Сотрудники автоматически не создаются.
              </TinyText>

              <div
                style={{
                  marginTop: 8,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                }}
              >
                {preview.unknownEmployees.map((name) => (
                  <span
                    key={name}
                    style={{
                      padding: '4px 7px',
                      borderRadius: 8,
                      background: 'rgba(148,163,184,.14)',
                      fontSize: 11,
                    }}
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {preview.ambiguousEmployees.length > 0 && (
            <div
              style={{
                padding: 12,
                borderRadius: 12,
                border: '1px solid rgba(245,158,11,.35)',
                background: 'rgba(245,158,11,.08)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  fontWeight: 800,
                }}
              >
                <AlertTriangle size={17} />
                Неоднозначное совпадение сотрудников
              </div>

              <TinyText style={{ marginTop: 7 }}>
                В текущем графике найдено несколько сотрудников с одинаковым именем.
                Такие строки будут пропущены до ручного уточнения.
              </TinyText>

              <div
                style={{
                  marginTop: 8,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                }}
              >
                {preview.ambiguousEmployees.map((name) => (
                  <span
                    key={name}
                    style={{
                      padding: '4px 7px',
                      borderRadius: 8,
                      background: 'rgba(148,163,184,.14)',
                      fontSize: 11,
                    }}
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {preview.invalidCells.length > 0 && (
            <div
              style={{
                padding: 12,
                borderRadius: 12,
                border: '1px solid rgba(220,38,38,.32)',
                background: 'rgba(220,38,38,.06)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  fontWeight: 800,
                }}
              >
                <AlertTriangle size={17} />
                Некорректные смены
              </div>

              <TinyText style={{ marginTop: 7 }}>
                Эти ячейки не будут импортированы. Показаны первые 12 ошибок.
              </TinyText>

              <div
                style={{
                  marginTop: 8,
                  display: 'grid',
                  gap: 6,
                  maxHeight: 210,
                  overflowY: 'auto',
                }}
              >
                {preview.invalidCells.slice(0, 12).map((item, index) => (
                  <div
                    key={item.employeeName + '-' + item.day + '-' + index}
                    style={{
                      padding: '7px 8px',
                      borderRadius: 8,
                      background: 'rgba(148,163,184,.10)',
                      fontSize: 11,
                    }}
                  >
                    <strong>{item.employeeName}</strong> · день {item.day}
                    <div style={{ marginTop: 3, opacity: 0.8 }}>
                      Значение: {item.scheduleValue || item.actualTimeValue || 'пусто'}
                    </div>
                    <div style={{ marginTop: 3 }}>{item.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {preview.warnings.map((warning) => (
            <div
              key={warning}
              style={{
                padding: 10,
                borderRadius: 10,
                border: '1px solid rgba(245,158,11,.28)',
                fontSize: 12,
              }}
            >
              {warning}
            </div>
          ))}

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: 12,
              borderRadius: 12,
              border: '1px solid rgba(148,163,184,.28)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={overwriteExisting}
              disabled={busy}
              onChange={(event) => onOverwriteChange(event.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              <strong>Перезаписывать заполненные ячейки</strong>
              <TinyText style={{ display: 'block', marginTop: 4 }}>
                По умолчанию существующие смены защищены и импорт заполняет только
                пустые ячейки.
              </TinyText>
            </span>
          </label>

          <div
            style={{
              padding: 12,
              borderRadius: 12,
              border: '1px solid rgba(34,197,94,.28)',
              background: 'rgba(34,197,94,.06)',
              display: 'flex',
              gap: 8,
            }}
          >
            <CheckCircle2 size={17} style={{ flex: '0 0 auto' }} />
            <TinyText>
              Импорт будет применён к месяцу, который сейчас открыт в приложении.
            </TinyText>
          </div>
        </div>

        <ActionButton
          type="button"
          $variant="primary"
          onClick={onApply}
          disabled={matchedEntries === 0 || busy}
          style={{ width: '100%', marginTop: 18 }}
        >
          {busy ? 'Применяю…' : 'Применить импорт'}
        </ActionButton>
      </Drawer>
    </DrawerOverlay>
  );
}
