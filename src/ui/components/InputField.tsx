import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Tooltip } from 'primereact/tooltip';
import type { InputFormatter } from './InputField/formatters/types';
import { currencyFormatter } from './InputField/formatters/CurrencyFormatter';
import { percentageFormatter } from './InputField/formatters/PercentageFormatter';
import { digitsFormatter } from './InputField/formatters/DigitsFormatter';
import { ipv4Formatter } from './InputField/formatters/IPv4Formatter';
import { uuidFormatter } from './InputField/formatters/UUIDFormatter';

export const formatterRegistry = new Map<string, InputFormatter>();
formatterRegistry.set('currency', currencyFormatter);
formatterRegistry.set('percentage', percentageFormatter);
formatterRegistry.set('digits', digitsFormatter);
formatterRegistry.set('ipv4', ipv4Formatter);
formatterRegistry.set('uuid', uuidFormatter);

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface InputFieldHandle {
  /** Set the confirmed/original value with an optional context object
   *  (e.g. `{ updatedAt }` for optimistic locking).
   *  If the current displayed value differs from the new original, sets
   *  dirty=true internally.
   *  @param value  The confirmed value to treat as the original.
   *  @param context Optional contextual data (defaults to `{}`). */
  setOriginalValue(value: string, context?: Record<string, unknown>): void;

  /** Return the currently displayed (potentially edited) value. */
  getCurrentValue(): string;

  /** Return the context object stored by the last `setOriginalValue` call,
   *  or `null` if none has been set yet. */
  getContext(): Record<string, unknown> | null;

  /** True when the current displayed value differs from the original. */
  compareWithOriginal(): boolean;

  /** Set hint text displayed below the input. Pass empty string to hide. */
  setHintText(text: string): void;

  /** Enable the Save button. */
  enableSaveButton(): void;

  /** Disable the Save button. */
  disableSaveButton(): void;

  /** Enable the Restore button. */
  enableRestoreButton(): void;

  /** Disable the Restore button. */
  disableRestoreButton(): void;

  /** Reset displayed value back to the original value, clear dirty flag. */
  resetToOriginal(): void;

  /** Return the current dirty (concurrent-modification) status. */
  getDirty(): boolean;

  /** Set the dirty status externally (e.g. via SSE/PubSub callback). */
  setDirty(status: boolean): void;

  /** Set the active input masking/formatting function. */
  setFormatter(formatter: InputFormatter): void;
}

interface InputFieldProps {
  /** When false, input is readOnly (single-line) or disabled (multi-line). */
  editable?: boolean;

  /** When false, the component renders nothing. */
  visible?: boolean;

  /** When false and multiLine=false, shows password masked. When true (default), shows plain text. */
  passwordVisible?: boolean;

  /** When true, renders InputTextarea instead of InputText. */
  multiLine?: boolean;

  /** Whether Save/Restore buttons can appear at all. */
  showButtons?: boolean;

  /** Whether the Save button is enabled. */
  saveButtonEnabled?: boolean;

  /** Whether the Restore button is enabled. */
  restoreButtonEnabled?: boolean;

  /** Placeholder text passed to the PrimeReact InputText/InputTextarea. */
  placeholder?: string;

  /** CSS class for the Save button icon, default "pi pi-save". */
  saveButtonIcon?: string;

  /** CSS class for the Restore button icon, default "pi pi-undo". */
  restoreButtonIcon?: string;

  /** Called when the input receives focus. */
  onFocus?: (component: InputFieldHandle) => void;

  /** Called when the input loses focus. */
  onBlur?: (component: InputFieldHandle) => void;

  /** Called when the current value changes (after formatting). */
  onChange?: (component: InputFieldHandle) => void;

  /** Called whenever the internal dirty status transitions. */
  onDirty?: (component: InputFieldHandle) => void;

  /** Called on Save button click or on blur when value differs from original.
   *  When `disableAfterSave` is true, a third `done` callback is passed
   *  that the caller must invoke to re-enable the input. */
  onSave?: (component: InputFieldHandle, source: 'button' | 'blur', done?: () => void) => void;

  /** When true, the component becomes disabled while an async onSave is in
   *  progress and re-enables when the `done` callback (third arg to onSave) is called. */
  disableAfterSave?: boolean;

  /** Called to retrieve tooltip text. Return undefined/empty for no tooltip. */
  onTooltip?: (component: InputFieldHandle) => string | undefined;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const InputField = forwardRef<InputFieldHandle, InputFieldProps>(
  function InputField(props, ref) {
    const {
      editable = true,
      visible = true,
      passwordVisible = true,
      multiLine = false,
      showButtons = true,
      saveButtonEnabled: initialSaveEnabled = true,
      restoreButtonEnabled: initialRestoreEnabled = true,
      placeholder,
      saveButtonIcon = 'pi pi-save',
      restoreButtonIcon = 'pi pi-undo',
      onFocus,
      onBlur,
      onChange,
      onDirty,
      onSave,
      onTooltip,
      disableAfterSave = false,
    } = props;

    // --- state -----------------------------------------------------------

    const [currentValue, setCurrentValue] = useState('');
    const [dirty, setDirtyState] = useState(false);
    const [focused, setFocused] = useState(false);
    const [hintText, setHintTextState] = useState('');
    const [saveBtnInternalEnabled, setSaveBtnInternalEnabled] =
      useState(initialSaveEnabled);
    const [restoreBtnInternalEnabled, setRestoreBtnInternalEnabled] =
      useState(initialRestoreEnabled);
    const [afterSaveDisabled, setAfterSaveDisabled] = useState(false);

    // --- refs (kept in sync with state so imperative methods see latest) ---

    const saveButtonUsedRef = useRef(false);
    const originalValueRef = useRef('');
    const contextRef = useRef<Record<string, unknown> | null>(null);
    const formatterRef = useRef<InputFormatter | null>(null);
    const currentValueRef = useRef(currentValue);
    currentValueRef.current = currentValue;
    const dirtyRef = useRef(dirty);
    dirtyRef.current = dirty;
    const hintTextRef = useRef(hintText);
    hintTextRef.current = hintText;
    const saveBtnEnabledRef = useRef(saveBtnInternalEnabled);
    saveBtnEnabledRef.current = saveBtnInternalEnabled;
    const restoreBtnEnabledRef = useRef(restoreBtnInternalEnabled);
    restoreBtnEnabledRef.current = restoreBtnInternalEnabled;
    const afterSaveDisabledRef = useRef(false);
    afterSaveDisabledRef.current = afterSaveDisabled;
    const disableAfterSaveRef = useRef(disableAfterSave);
    disableAfterSaveRef.current = disableAfterSave;
    const onDirtyRef = useRef(onDirty);
    onDirtyRef.current = onDirty;
    const inputRef = useRef<HTMLElement>(null);

    // --- dirty transition helper -----------------------------------------

    const updateDirty = useCallback((newDirty: boolean) => {
      const prev = dirtyRef.current;
      if (prev !== newDirty) {
        dirtyRef.current = newDirty;
        setDirtyState(newDirty);
        onDirtyRef.current?.(handleRef.current);
      }
    }, []);

    // --- imperative API handle -------------------------------------------

    const handleRef = useRef<InputFieldHandle>(null!);

    handleRef.current = {
      setOriginalValue(value: string, context: Record<string, unknown> = {}) {
        originalValueRef.current = value;
        contextRef.current = context;
        currentValueRef.current = value;
        setCurrentValue(value);
        updateDirty(false);
      },

      getContext() {
        return contextRef.current;
      },

      getCurrentValue() {
        return currentValueRef.current;
      },

      compareWithOriginal() {
        return currentValueRef.current !== originalValueRef.current;
      },

      setHintText(text: string) {
        hintTextRef.current = text;
        setHintTextState(text);
      },

      enableSaveButton() {
        saveBtnEnabledRef.current = true;
        setSaveBtnInternalEnabled(true);
      },

      disableSaveButton() {
        saveBtnEnabledRef.current = false;
        setSaveBtnInternalEnabled(false);
      },

      enableRestoreButton() {
        restoreBtnEnabledRef.current = true;
        setRestoreBtnInternalEnabled(true);
      },

      disableRestoreButton() {
        restoreBtnEnabledRef.current = false;
        setRestoreBtnInternalEnabled(false);
      },

      resetToOriginal() {
        currentValueRef.current = originalValueRef.current;
        setCurrentValue(originalValueRef.current);
        updateDirty(false);
        hintTextRef.current = '';
        setHintTextState('');
      },

      getDirty() {
        return dirtyRef.current;
      },

      setDirty(status: boolean) {
        updateDirty(status);
      },

      setFormatter(formatter: InputFormatter) {
        formatterRef.current = formatter;
      },
    };

    useImperativeHandle(ref, () => handleRef.current, []);

    // --- event handlers --------------------------------------------------

    const handleFocus = useCallback(() => {
      setFocused(true);
      onFocus?.(handleRef.current);
    }, [onFocus]);

    const handleBlur = useCallback(() => {
      setFocused(false);
      onBlur?.(handleRef.current);

      // If the Save button was used, skip auto-save to avoid double execution
      if (saveButtonUsedRef.current) {
        saveButtonUsedRef.current = false;
        return;
      }

      // Auto-save on blur when value changed and not dirty
      if (
        currentValueRef.current !== originalValueRef.current &&
        !dirtyRef.current
      ) {
        if (disableAfterSaveRef.current) {
          afterSaveDisabledRef.current = true;
          setAfterSaveDisabled(true);
          onSave?.(handleRef.current, 'blur', () => {
            afterSaveDisabledRef.current = false;
            setAfterSaveDisabled(false);
          });
        } else {
          onSave?.(handleRef.current, 'blur');
        }
      }
    }, [onBlur, onSave]);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const rawValue = e.target.value;
        let newValue = rawValue;

        if (formatterRef.current) {
          newValue = formatterRef.current(
            rawValue,
            handleRef.current,
            e.nativeEvent as InputEvent,
          );
        }

        currentValueRef.current = newValue;
        setCurrentValue(newValue);
        onChange?.(handleRef.current);
      },
      [onChange],
    );

    const handleSaveClick = useCallback(() => {
      saveButtonUsedRef.current = true;
      if (disableAfterSaveRef.current) {
        afterSaveDisabledRef.current = true;
        setAfterSaveDisabled(true);
        onSave?.(handleRef.current, 'button', () => {
          afterSaveDisabledRef.current = false;
          setAfterSaveDisabled(false);
        });
      } else {
        onSave?.(handleRef.current, 'button');
      }
    }, [onSave]);

    const handleRestoreClick = useCallback(() => {
      handleRef.current.resetToOriginal();
    }, []);

    // --- derived values --------------------------------------------------

    const isDirty = currentValueRef.current !== originalValueRef.current;

    const showActionButtons = showButtons && focused && isDirty;

    // Save button is hidden when dirty (concurrent modification).
    const showSaveButton = showActionButtons && !dirty;

    // Restore button is visible when the button row is visible.
    const showRestoreButton = showActionButtons;

    const saveDisabled = dirty || !saveBtnInternalEnabled;
    const restoreDisabled = !restoreBtnInternalEnabled;

    // --- tooltip ---------------------------------------------------------

    const tooltipText = onTooltip?.(handleRef.current);

    // --- render ----------------------------------------------------------

    if (!visible) {
      return null;
    }

    const inputType =
      !multiLine && !passwordVisible ? 'password' : 'text';

    return (
      <div className="inputfield-container">
        <div className="inputfield-input-row">
          {multiLine ? (
            <InputTextarea
              ref={inputRef as React.Ref<HTMLTextAreaElement>}
              value={currentValue}
              disabled={!editable || afterSaveDisabled}
              placeholder={placeholder}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onChange={handleChange}
              rows={3}
              autoResize
            />
          ) : (
            <InputText
              ref={inputRef as React.Ref<HTMLInputElement>}
              value={currentValue}
              type={inputType}
              readOnly={!editable || afterSaveDisabled}
              placeholder={placeholder}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onChange={handleChange}
            />
          )}

          {showSaveButton && (
            <Button
              icon={saveButtonIcon}
              disabled={saveDisabled || afterSaveDisabled}
              onMouseDown={handleSaveClick}
              aria-label="Save"
            />
          )}

          {showRestoreButton && (
            <Button
              icon={restoreButtonIcon}
              disabled={restoreDisabled || afterSaveDisabled}
              onMouseDown={handleRestoreClick}
              aria-label="Restore"
            />
          )}
        </div>

        {hintText && <small className="inputfield-hint">{hintText}</small>}

        {tooltipText && (
          <Tooltip
            target={inputRef as React.RefObject<HTMLElement>}
            content={tooltipText}
          />
        )}
      </div>
    );
  },
);

export default InputField;
