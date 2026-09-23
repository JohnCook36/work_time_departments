import styled from '@emotion/styled';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { X } from 'lucide-react';

import {
  ActionButton,
  FormLabel,
  TextInput,
} from '../../theme/styles';

interface DialogActionOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface PromptDialogOptions extends DialogActionOptions {
  title: string;
  message?: string;
  label?: string;
  initialValue?: string;
  placeholder?: string;
}

interface AppDialogContextValue {
  showMessage: (
    message: string,
    options?: Omit<DialogActionOptions, 'cancelLabel'>,
  ) => Promise<void>;
  confirmAction: (
    message: string,
    options?: DialogActionOptions,
  ) => Promise<boolean>;
  promptText: (options: PromptDialogOptions) => Promise<string | null>;
}

type DialogKind = 'message' | 'confirm' | 'prompt';

interface DialogRequest {
  id: number;
  kind: DialogKind;
  title: string;
  message: string;
  label?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel: string;
  cancelLabel: string;
  resolve: (value: string | boolean | null | undefined) => void;
}

const DialogContext = createContext<AppDialogContextValue | null>(null);
let nextDialogId = 1;

const DialogOverlay = styled('div')(({ theme }) => ({
  position: 'fixed',
  inset: 0,
  zIndex: 2000,
  display: 'grid',
  placeItems: 'center',
  padding: 16,
  background: theme.colors.overlay,
}));

const DialogCard = styled('form')(({ theme }) => ({
  width: 'min(440px, 100%)',
  maxHeight: 'min(80vh, 640px)',
  overflowY: 'auto',
  padding: 20,
  border: '1px solid ' + theme.colors.border,
  borderRadius: 18,
  background: theme.colors.surfaceElevated,
  color: theme.colors.text,
  boxShadow: theme.shadows.drawer,
}));

const DialogHeader = styled('div')({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
  marginBottom: 12,
});

const DialogTitle = styled('h2')({
  margin: 0,
  fontSize: 18,
  lineHeight: 1.25,
});

const DialogCloseButton = styled('button')(({ theme }) => ({
  width: 34,
  height: 34,
  flex: '0 0 auto',
  border: '1px solid ' + theme.colors.border,
  borderRadius: 10,
  background: theme.colors.surface,
  color: theme.colors.textMuted,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
}));

const DialogMessage = styled('div')(({ theme }) => ({
  minHeight: 22,
  color: theme.colors.textMuted,
  fontSize: 13,
  lineHeight: 1.5,
  whiteSpace: 'pre-line',
}));

const DialogField = styled('div')({
  marginTop: 16,
});

const DialogInput = styled(TextInput)({
  width: '100%',
  minWidth: 0,
});

const DialogActions = styled('div')({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  marginTop: 20,
  flexWrap: 'wrap',
});

const DialogActionButton = styled(ActionButton)({
  minWidth: 112,
});

const fallbackContext: AppDialogContextValue = {
  showMessage: async (message) => {
    console.warn('App dialog provider is unavailable:', message);
  },
  confirmAction: async () => false,
  promptText: async () => null,
};

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const [promptValue, setPromptValue] = useState('');
  const active = queue[0] || null;

  const enqueue = useCallback(
    (request: Omit<DialogRequest, 'id'>) => {
      setQueue((current) => [
        ...current,
        { ...request, id: nextDialogId++ },
      ]);
    },
    [],
  );

  const showMessage = useCallback<AppDialogContextValue['showMessage']>(
    (message, options = {}) =>
      new Promise<void>((resolve) => {
        enqueue({
          kind: 'message',
          title: options.title || 'Сообщение',
          message,
          confirmLabel: options.confirmLabel || 'Понятно',
          cancelLabel: '',
          resolve: () => resolve(),
        });
      }),
    [enqueue],
  );

  const confirmAction = useCallback<AppDialogContextValue['confirmAction']>(
    (message, options = {}) =>
      new Promise<boolean>((resolve) => {
        enqueue({
          kind: 'confirm',
          title: options.title || 'Подтвердите действие',
          message,
          confirmLabel: options.confirmLabel || 'Подтвердить',
          cancelLabel: options.cancelLabel || 'Отмена',
          resolve: (value) => resolve(value === true),
        });
      }),
    [enqueue],
  );

  const promptText = useCallback<AppDialogContextValue['promptText']>(
    (options) =>
      new Promise<string | null>((resolve) => {
        enqueue({
          kind: 'prompt',
          title: options.title,
          message: options.message || '',
          label: options.label || 'Значение',
          initialValue: options.initialValue || '',
          placeholder: options.placeholder,
          confirmLabel: options.confirmLabel || 'Сохранить',
          cancelLabel: options.cancelLabel || 'Отмена',
          resolve: (value) =>
            resolve(typeof value === 'string' ? value : null),
        });
      }),
    [enqueue],
  );

  const value = useMemo(
    () => ({ showMessage, confirmAction, promptText }),
    [confirmAction, promptText, showMessage],
  );

  const settle = useCallback(
    (result: string | boolean | null | undefined) => {
      if (!active) return;
      active.resolve(result);
      setQueue((current) =>
        current[0]?.id === active.id ? current.slice(1) : current,
      );
    },
    [active],
  );

  const cancelActive = useCallback(() => {
    if (!active) return;
    if (active.kind === 'confirm') {
      settle(false);
      return;
    }
    if (active.kind === 'prompt') {
      settle(null);
      return;
    }
    settle(undefined);
  }, [active, settle]);

  useEffect(() => {
    setPromptValue(active?.kind === 'prompt' ? active.initialValue || '' : '');
  }, [active?.id, active?.initialValue, active?.kind]);

  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      cancelActive();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, cancelActive]);

  return (
    <DialogContext.Provider value={value}>
      {children}

      {active && (
        <DialogOverlay
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) cancelActive();
          }}
        >
          <DialogCard
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-dialog-title"
            onSubmit={(event) => {
              event.preventDefault();
              if (active.kind === 'prompt') {
                const nextValue = promptValue.trim();
                if (!nextValue) return;
                settle(nextValue);
                return;
              }
              if (active.kind === 'confirm') {
                settle(true);
                return;
              }
              settle(undefined);
            }}
          >
            <DialogHeader>
              <DialogTitle id="app-dialog-title">{active.title}</DialogTitle>
              <DialogCloseButton
                type="button"
                onClick={cancelActive}
                aria-label="Закрыть диалог"
              >
                <X size={17} />
              </DialogCloseButton>
            </DialogHeader>

            {active.message && (
              <DialogMessage>{active.message}</DialogMessage>
            )}

            {active.kind === 'prompt' && (
              <DialogField>
                <FormLabel htmlFor="app-dialog-input">
                  {active.label}
                </FormLabel>
                <DialogInput
                  id="app-dialog-input"
                  autoFocus
                  value={promptValue}
                  placeholder={active.placeholder}
                  onChange={(event) => setPromptValue(event.target.value)}
                />
              </DialogField>
            )}

            <DialogActions>
              {active.kind !== 'message' && (
                <DialogActionButton
                  type="button"
                  onClick={cancelActive}
                >
                  {active.cancelLabel}
                </DialogActionButton>
              )}
              <DialogActionButton
                type="submit"
                $variant={active.kind === 'confirm' ? 'danger' : 'primary'}
                disabled={
                  active.kind === 'prompt' && promptValue.trim().length === 0
                }
              >
                {active.confirmLabel}
              </DialogActionButton>
            </DialogActions>
          </DialogCard>
        </DialogOverlay>
      )}
    </DialogContext.Provider>
  );
}

export function useAppDialog(): AppDialogContextValue {
  return useContext(DialogContext) || fallbackContext;
}
