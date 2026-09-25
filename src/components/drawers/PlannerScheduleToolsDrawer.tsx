import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileSpreadsheet,
  FileUp,
  History,
  Printer,
  Send,
  Trash2,
  X,
} from 'lucide-react';

import {
  getDepartmentSchedulePublication,
  getDepartmentSchedulePublications,
  publishDepartmentSchedule,
  SchedulePublicationEmployeeSnapshot,
  SchedulePublicationResponse,
  SchedulePublicationShiftSnapshot,
  SchedulePublicationValidationResponse,
  validateDepartmentSchedule,
} from '../../api/planner';
import { Department, Employee } from '../../domain/models';
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
  FullWidthInput,
  FullWidthSelect,
  DrawerSection,
  DrawerSectionTitle,
  HiddenFileInput,
  PublicationDiffChange,
  PublicationDiffItem,
  PublicationDiffList,
  PublicationFeedback,
  PublicationHistoryItem,
  PublicationHistoryList,
  PublicationHistoryMeta,
  PublicationVersionDetail,
  ValidationBadge,
  ValidationGroupTitle,
  ValidationItem,
  ValidationResultPanel,
} from './styles';

interface PrintRange {
  key: string;
  label: string;
}

function formatPublicationShift(
  shift: SchedulePublicationShiftSnapshot | null,
): string {
  if (!shift) return 'нет смены';
  if (shift.isOff) return 'OFF';

  const time =
    (shift.startTime || '—') + '–' + (shift.endTime || '—');
  return shift.code ? shift.code + ' · ' + time : time;
}

function formatPublicationEmployee(
  employee: SchedulePublicationEmployeeSnapshot | null,
): string {
  if (!employee) return 'нет сотрудника';

  const pattern =
    employee.scheduleMode === 'FIXED_WEEKDAYS' &&
    employee.fixedStartTime &&
    employee.fixedEndTime
      ? '5/2 ' + employee.fixedStartTime + '–' + employee.fixedEndTime
      : employee.scheduleMode;

  return (
    employee.displayName +
    ' · ставка ' +
    employee.employmentRate +
    ' · ' +
    pattern
  );
}

function publicationEmployeeName(
  publication: SchedulePublicationResponse,
  employeeId: string,
): string {
  const current = publication.snapshot.employees.find(
    employee => employee.id === employeeId,
  );
  if (current) return current.displayName;

  for (const change of publication.diff.employees) {
    const candidate =
      change.after?.id === employeeId
        ? change.after
        : change.before?.id === employeeId
          ? change.before
          : null;
    if (candidate) return candidate.displayName;
  }

  return employeeId;
}

interface PlannerScheduleToolsDrawerProps {
  departments: Department[];
  employees: Employee[];
  year: number;
  monthIndex: number;
  publicationReadEnabled: boolean;
  canPublishSchedule: boolean;
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
  canSaveFixedWeekdays: boolean;
  isSavingFixedWeekdays: boolean;
  onSaveFixedWeekdays: () => void;
  isApplyingBulkSchedule: boolean;
  onFillOffAll: () => void;
  onClearAll: () => void;
  onNavigateToValidationIssue: (employeeId: string, date: string) => void;
  onManageRules: () => void;
  onClose: () => void;
}

export function PlannerScheduleToolsDrawer({
  departments,
  employees,
  year,
  monthIndex,
  publicationReadEnabled,
  canPublishSchedule,
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
  canSaveFixedWeekdays,
  isSavingFixedWeekdays,
  onSaveFixedWeekdays,
  isApplyingBulkSchedule,
  onFillOffAll,
  onClearAll,
  onNavigateToValidationIssue,
  onManageRules,
  onClose,
}: PlannerScheduleToolsDrawerProps) {
  const excelFileInputRef = useRef<HTMLInputElement | null>(null);
  const [publicationDepartmentId, setPublicationDepartmentId] = useState(
    departments[0]?.id ?? '',
  );
  const [publicationComment, setPublicationComment] = useState('');
  const [publicationHistory, setPublicationHistory] = useState<
    SchedulePublicationResponse[]
  >([]);
  const [publicationBusy, setPublicationBusy] = useState(false);
  const [publicationFeedback, setPublicationFeedback] = useState('');
  const [selectedPublication, setSelectedPublication] =
    useState<SchedulePublicationResponse | null>(null);
  const [validationResult, setValidationResult] =
    useState<SchedulePublicationValidationResponse | null>(null);

  useEffect(() => {
    if (
      publicationDepartmentId &&
      departments.some(
        (department) => department.id === publicationDepartmentId,
      )
    ) {
      return;
    }

    setPublicationDepartmentId(departments[0]?.id ?? '');
  }, [departments, publicationDepartmentId]);

  useEffect(() => {
    setValidationResult(null);
  }, [publicationDepartmentId, year, monthIndex]);

  const loadPublicationHistory = useCallback(async () => {
    if (!publicationReadEnabled || !publicationDepartmentId) {
      setPublicationHistory([]);
      setSelectedPublication(null);
      return;
    }

    setPublicationBusy(true);
    try {
      const history = await getDepartmentSchedulePublications(
        publicationDepartmentId,
        year,
        monthIndex + 1,
      );
      setPublicationHistory(history);
      setSelectedPublication(null);
      setPublicationFeedback('');
    } catch (error) {
      setPublicationHistory([]);
      setSelectedPublication(null);
      setPublicationFeedback(
        error instanceof Error
          ? 'Не удалось загрузить историю: ' + error.message
          : 'Не удалось загрузить историю публикаций.',
      );
    } finally {
      setPublicationBusy(false);
    }
  }, [
    monthIndex,
    publicationDepartmentId,
    publicationReadEnabled,
    year,
  ]);

  useEffect(() => {
    void loadPublicationHistory();
  }, [loadPublicationHistory]);

  const handleValidate = async () => {
    if (
      !publicationReadEnabled ||
      !publicationDepartmentId ||
      publicationBusy
    ) {
      return;
    }

    setPublicationBusy(true);
    setPublicationFeedback('');

    try {
      const result = await validateDepartmentSchedule(
        publicationDepartmentId,
        year,
        monthIndex + 1,
      );
      setValidationResult(result);
      setPublicationFeedback(
        result.canPublish
          ? 'Проверка пройдена: жёстких нарушений нет.'
          : 'Публикация заблокирована: исправьте жёсткие нарушения.',
      );
    } catch (error) {
      setValidationResult(null);
      setPublicationFeedback(
        error instanceof Error
          ? 'Не удалось проверить график: ' + error.message
          : 'Не удалось проверить график.',
      );
    } finally {
      setPublicationBusy(false);
    }
  };

  const handlePublish = async () => {
    if (
      !canPublishSchedule ||
      !publicationDepartmentId ||
      publicationBusy
    ) {
      return;
    }

    setPublicationBusy(true);
    setPublicationFeedback('');

    try {
      const validation = await validateDepartmentSchedule(
        publicationDepartmentId,
        year,
        monthIndex + 1,
      );
      setValidationResult(validation);

      if (!validation.canPublish) {
        setPublicationFeedback(
          'Публикация заблокирована: исправьте жёсткие нарушения.',
        );
        return;
      }

      const publication = await publishDepartmentSchedule(
        publicationDepartmentId,
        year,
        monthIndex + 1,
        publicationComment,
      );
      const history = await getDepartmentSchedulePublications(
        publicationDepartmentId,
        year,
        monthIndex + 1,
      );
      setPublicationHistory(history);
      setPublicationComment('');
      setPublicationFeedback(
        'Опубликована версия v' + publication.version + '.',
      );
    } catch (error) {
      setPublicationFeedback(
        error instanceof Error
          ? 'Не удалось опубликовать: ' + error.message
          : 'Не удалось опубликовать график.',
      );
    } finally {
      setPublicationBusy(false);
    }
  };

  const openPublicationVersion = async (version: number) => {
    if (
      !publicationReadEnabled ||
      !publicationDepartmentId ||
      publicationBusy
    ) {
      return;
    }

    setPublicationBusy(true);
    setPublicationFeedback('');

    try {
      const publication = await getDepartmentSchedulePublication(
        publicationDepartmentId,
        year,
        monthIndex + 1,
        version,
      );
      setSelectedPublication(publication);
    } catch (error) {
      setSelectedPublication(null);
      setPublicationFeedback(
        error instanceof Error
          ? 'Не удалось открыть версию: ' + error.message
          : 'Не удалось открыть опубликованную версию.',
      );
    } finally {
      setPublicationBusy(false);
    }
  };

  return (
    <DrawerOverlay onMouseDown={onClose}>
      <CompactDrawer onMouseDown={(event) => event.stopPropagation()}>
        <DrawerHeader>
          <div>
            <DrawerTitle>Управление графиком</DrawerTitle>
            <DrawerSubtitle>
              Публикация, история версий, импорт, экспорт, печать и массовые
              действия вынесены из основной панели.
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

          <FullWidthActionButton
            type="button"
            onClick={onSaveFixedWeekdays}
            disabled={!canSaveFixedWeekdays || isSavingFixedWeekdays}
          >
            {isSavingFixedWeekdays ? 'Сохраняю график 5/2…' : 'Сохранить график 5/2'}
          </FullWidthActionButton>

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

        <DrawerSection>
          <DrawerSectionTitle>Правила графика</DrawerSectionTitle>
          <FullWidthActionButton
            type="button"
            onClick={onManageRules}
            disabled={!publicationReadEnabled}
          >
            Управление правилами
          </FullWidthActionButton>
          <PublicationHistoryMeta>
            Создание, приоритет, hard/soft, область действия и история версий.
          </PublicationHistoryMeta>
        </DrawerSection>

        <DrawerSection>
          <DrawerSectionTitle>Публикация и версии</DrawerSectionTitle>

          <FormGroup>
            <FormLabel htmlFor="publication-department">Отдел</FormLabel>
            <FullWidthSelect
              id="publication-department"
              value={publicationDepartmentId}
              disabled={
                !publicationReadEnabled ||
                publicationBusy ||
                departments.length === 0
              }
              onChange={(event) =>
                setPublicationDepartmentId(event.target.value)
              }
            >
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </FullWidthSelect>
          </FormGroup>

          <FormGroup>
            <FormLabel htmlFor="publication-comment">
              Комментарий к версии
            </FormLabel>
            <FullWidthInput
              id="publication-comment"
              value={publicationComment}
              maxLength={500}
              disabled={!canPublishSchedule || publicationBusy}
              placeholder="Например: график утверждён на месяц"
              onChange={(event) =>
                setPublicationComment(event.target.value)
              }
            />
          </FormGroup>

          <DrawerButtonGrid>
            <ActionButton
              type="button"
              onClick={() => void handleValidate()}
              disabled={
                !publicationReadEnabled ||
                publicationBusy ||
                !publicationDepartmentId
              }
            >
              Проверить график
            </ActionButton>

            <ActionButton
              type="button"
              $variant="primary"
              onClick={() => void handlePublish()}
              disabled={
                !canPublishSchedule ||
                publicationBusy ||
                !publicationDepartmentId ||
                validationResult?.canPublish === false
              }
            >
              <Send size={16} />
              {publicationBusy ? 'Обновляю…' : 'Опубликовать версию'}
            </ActionButton>
          </DrawerButtonGrid>

          <ValidationResultPanel aria-label="Результат проверки графика">
            {!validationResult ? (
              <PublicationHistoryMeta>
                Нажмите «Проверить график», чтобы увидеть ошибки и предупреждения
                до публикации.
              </PublicationHistoryMeta>
            ) : (
              <>
                <PublicationHistoryMeta>
                  Версия правил: {validationResult.rulesVersion}
                </PublicationHistoryMeta>

                <ValidationGroupTitle>
                  Жёсткие нарушения ·{' '}
                  {
                    validationResult.violations.filter(
                      (violation) => violation.severity === 'hard',
                    ).length
                  }
                </ValidationGroupTitle>

                {validationResult.violations.filter(
                  (violation) => violation.severity === 'hard',
                ).length === 0 ? (
                  <PublicationHistoryMeta>
                    Жёстких нарушений нет.
                  </PublicationHistoryMeta>
                ) : (
                  validationResult.violations
                    .filter((violation) => violation.severity === 'hard')
                    .map((violation, index) => {
                      const employee = employees.find(
                        (item) => item.id === violation.employeeId,
                      );
                      return (
                        <ValidationItem
                          key={'hard-' + violation.code + '-' + index}
                        >
                          <div>
                            <ValidationBadge $severity="hard">
                              Ошибка
                            </ValidationBadge>{' '}
                            {violation.message}
                          </div>
                          <PublicationHistoryMeta>
                            {employee?.name ||
                              violation.employeeId ||
                              'График отдела'}
                            {violation.date ? ' · ' + violation.date : ''}
                          </PublicationHistoryMeta>
                          {violation.employeeId && violation.date && (
                            <ActionButton
                              type="button"
                              onClick={() => {
                                onNavigateToValidationIssue(
                                  violation.employeeId!,
                                  violation.date!,
                                );
                                onClose();
                              }}
                            >
                              Перейти к ячейке
                            </ActionButton>
                          )}
                        </ValidationItem>
                      );
                    })
                )}

                <ValidationGroupTitle>
                  Предупреждения ·{' '}
                  {
                    validationResult.violations.filter(
                      (violation) => violation.severity === 'soft',
                    ).length
                  }
                </ValidationGroupTitle>

                {validationResult.violations.filter(
                  (violation) => violation.severity === 'soft',
                ).length === 0 ? (
                  <PublicationHistoryMeta>
                    Предупреждений нет.
                  </PublicationHistoryMeta>
                ) : (
                  validationResult.violations
                    .filter((violation) => violation.severity === 'soft')
                    .map((violation, index) => {
                      const employee = employees.find(
                        (item) => item.id === violation.employeeId,
                      );
                      return (
                        <ValidationItem
                          key={'soft-' + violation.code + '-' + index}
                        >
                          <div>
                            <ValidationBadge $severity="soft">
                              Предупреждение
                            </ValidationBadge>{' '}
                            {violation.message}
                          </div>
                          <PublicationHistoryMeta>
                            {employee?.name ||
                              violation.employeeId ||
                              'График отдела'}
                            {violation.date ? ' · ' + violation.date : ''}
                          </PublicationHistoryMeta>
                          {violation.employeeId && violation.date && (
                            <ActionButton
                              type="button"
                              onClick={() => {
                                onNavigateToValidationIssue(
                                  violation.employeeId!,
                                  violation.date!,
                                );
                                onClose();
                              }}
                            >
                              Перейти к ячейке
                            </ActionButton>
                          )}
                        </ValidationItem>
                      );
                    })
                )}
              </>
            )}
          </ValidationResultPanel>

          <PublicationFeedback aria-live="polite">
            {publicationFeedback ||
              (!publicationReadEnabled
                ? 'История публикаций доступна в серверном режиме.'
                : ' ')}
          </PublicationFeedback>

          <DrawerSectionTitle>
            <History size={15} aria-hidden="true" /> История версий
          </DrawerSectionTitle>

          <PublicationHistoryList>
            {publicationHistory.length === 0 ? (
              <PublicationHistoryMeta>
                {publicationBusy
                  ? 'Загружаю историю…'
                  : 'Опубликованных версий пока нет.'}
              </PublicationHistoryMeta>
            ) : (
              publicationHistory.map((publication) => (
                <PublicationHistoryItem key={publication.id}>
                  <strong>
                    v{publication.version} ·{' '}
                    {new Date(publication.createdAt).toLocaleString('ru-RU')}
                  </strong>
                  <PublicationHistoryMeta>
                    Автор: {publication.publishedByLabel}
                  </PublicationHistoryMeta>
                  <PublicationHistoryMeta>
                    Изменения: смен {publication.diff.shifts.length},
                    сотрудников {publication.diff.employees.length}
                  </PublicationHistoryMeta>
                  <PublicationHistoryMeta>
                    {publication.comment || 'Без комментария'}
                  </PublicationHistoryMeta>
                  <ActionButton
                    type="button"
                    onClick={() =>
                      void openPublicationVersion(publication.version)
                    }
                    disabled={publicationBusy}
                  >
                    Открыть v{publication.version}
                  </ActionButton>
                </PublicationHistoryItem>
              ))
            )}
          </PublicationHistoryList>

          <DrawerSectionTitle>Открытая версия</DrawerSectionTitle>
          <PublicationVersionDetail>
            {selectedPublication ? (
              <>
                <strong>
                  v{selectedPublication.version} ·{' '}
                  {selectedPublication.snapshot.department.name}
                </strong>
                <PublicationHistoryMeta>
                  Сотрудников: {selectedPublication.snapshot.employees.length} ·
                  смен: {selectedPublication.snapshot.shifts.length}
                </PublicationHistoryMeta>
                <PublicationHistoryMeta>
                  Комментарий: {selectedPublication.comment || 'без комментария'}
                </PublicationHistoryMeta>

                <strong>Изменения смен</strong>
                {selectedPublication.diff.shifts.length === 0 ? (
                  <PublicationHistoryMeta>
                    Изменений смен относительно предыдущей версии нет.
                  </PublicationHistoryMeta>
                ) : (
                  <PublicationDiffList>
                    {selectedPublication.diff.shifts.map((change) => {
                      const shift = change.after ?? change.before;
                      const employeeId = shift?.employeeId ?? change.key.split(':')[0];
                      const date = shift?.date ?? change.key.split(':').slice(1).join(':');

                      return (
                        <PublicationDiffItem key={change.key}>
                          <strong>
                            {publicationEmployeeName(
                              selectedPublication,
                              employeeId,
                            )}{' '}
                            · {date}
                          </strong>
                          <PublicationDiffChange>
                            Было: {formatPublicationShift(change.before)}
                          </PublicationDiffChange>
                          <PublicationDiffChange>
                            Стало: {formatPublicationShift(change.after)}
                          </PublicationDiffChange>
                        </PublicationDiffItem>
                      );
                    })}
                  </PublicationDiffList>
                )}

                <strong>Изменения сотрудников</strong>
                {selectedPublication.diff.employees.length === 0 ? (
                  <PublicationHistoryMeta>
                    Данные сотрудников относительно предыдущей версии не менялись.
                  </PublicationHistoryMeta>
                ) : (
                  <PublicationDiffList>
                    {selectedPublication.diff.employees.map((change) => (
                      <PublicationDiffItem key={change.key}>
                        <strong>
                          {(change.after ?? change.before)?.displayName ??
                            change.key}
                        </strong>
                        <PublicationDiffChange>
                          Было: {formatPublicationEmployee(change.before)}
                        </PublicationDiffChange>
                        <PublicationDiffChange>
                          Стало: {formatPublicationEmployee(change.after)}
                        </PublicationDiffChange>
                      </PublicationDiffItem>
                    ))}
                  </PublicationDiffList>
                )}

                <strong>Снимок версии</strong>
                {selectedPublication.snapshot.shifts.length === 0 ? (
                  <PublicationHistoryMeta>
                    В этой версии сохранённых смен нет.
                  </PublicationHistoryMeta>
                ) : (
                  selectedPublication.snapshot.shifts.map((shift) => (
                    <PublicationHistoryMeta key={shift.id}>
                      {shift.date} ·{' '}
                      {publicationEmployeeName(
                        selectedPublication,
                        shift.employeeId,
                      )}{' '}
                      · {formatPublicationShift(shift)}
                    </PublicationHistoryMeta>
                  ))
                )}
              </>
            ) : (
              <PublicationHistoryMeta>
                Выберите версию в истории, чтобы открыть сохранённый снимок.
              </PublicationHistoryMeta>
            )}
          </PublicationVersionDetail>
        </DrawerSection>
      </CompactDrawer>
    </DrawerOverlay>
  );
}
