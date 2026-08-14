import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { InputSwitch } from 'primereact/inputswitch';
import { Checkbox } from 'primereact/checkbox';
import type { CheckboxChangeEvent } from 'primereact/checkbox';
import { TriStateCheckbox } from 'primereact/tristatecheckbox';
import type { TriStateCheckboxChangeEvent } from 'primereact/tristatecheckbox';
import { Tooltip } from 'primereact/tooltip';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ToggleHandle<T> {
  /** Set the confirmed value with an optional opaque context record.
   *  If the current displayed value differs from the new confirmed value,
   *  sets dirty=true internally.
   *  @param value   The confirmed value to treat as original.
   *  @param context Optional contextual data (e.g. `{ configKey, updatedAt }`). */
  setValue(value: T, context?: Record<string, unknown>): void;

  /** Return the currently displayed value. */
  getValue(): T;

  /** Return the context object stored by the last `setValue` call,
   *  or `null` if none has been set yet. */
  getContext(): Record<string, unknown> | null;

  /** Revert the displayed value to the last confirmed value,
   *  clear the dirty flag, clear hint text, and re-enable the toggle. */
  revertValue(): void;

  /** Enable or disable the toggle programmatically. */
  setDisabled(disabled: boolean): void;

  /** Return whether the toggle is currently disabled. */
  getDisabled(): boolean;

  /** Return the current dirty (concurrent-modification) status. */
  getDirty(): boolean;

  /** Set the dirty status externally (e.g. via SSE/PubSub callback). */
  setDirty(status: boolean): void;

  /** Set hint text displayed below the toggle control.
   *  Pass empty string or `""` to hide the hint. */
  setHintText(text: string): void;

  /** Replace the options array at runtime. Re-evaluates truncation and
   *  auto-append logic. If the current displayed value is not in the new
   *  options set, resets to the first option's value. */
  setOptions(options: ToggleOption<T>[]): void;

  /** Return the effective options array after auto-append and truncation. */
  getOptions(): ToggleOption<T>[];
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type ToggleOption<T> = { value: T; label: string };

interface ToggleProps<T> {
  /** Selects the visual presentation variant. */
  variant: 'toggle' | 'checkbox' | 'pill';

  /** Initial value. After mount, state is managed internally via `setValue()`. */
  value?: T;

  /** The single source of truth for all labeling and state cardinality. */
  options: ToggleOption<T>[];

  /** When true, the toggle is non-interactive (grayed out). */
  disabled?: boolean;

  /** When false, the component renders nothing. */
  visible?: boolean;

  /** Controls the physical size of the control. */
  size?: 'small' | 'normal';

  /** Called when the user toggles the control.
   *  Retrieve the new value via `component.getValue()`. */
  onChange?: (component: ToggleHandle<T>) => void;

  /** Called whenever the component's internal dirty status changes. */
  onDirty?: (component: ToggleHandle<T>) => void;

  /** Called to retrieve tooltip text. Return undefined/empty for no tooltip. */
  onTooltip?: (component: ToggleHandle<T>) => string | undefined;
}

// ---------------------------------------------------------------------------
// Options processing helpers
// ---------------------------------------------------------------------------

/**
 * Process the raw options array: auto-append a negation when only 1 option
 * is provided, then truncate based on the variant's max option count.
 */
function processOptions<T>(
  rawOptions: ToggleOption<T>[],
  variant: 'toggle' | 'checkbox' | 'pill',
): ToggleOption<T>[] {
  let effective = [...rawOptions];

  // Auto-append negation for single-option convenience
  if (effective.length === 1) {
    const original = optionAt(effective, 0);
    const notLabel = `Not ${original.label}`;

    if (typeof original.value === 'boolean') {
      // Boolean: use logical negation
      effective.push({
        value: (!original.value) as unknown as T,
        label: notLabel,
      });
    } else {
      // Non-boolean: use null as the complement value
      effective.push({
        value: null as unknown as T,
        label: notLabel,
      });
    }
  }

  // Truncate based on variant max
  if (variant === 'toggle' && effective.length > 2) {
    effective = effective.slice(0, 2);
  } else if (variant === 'checkbox' && effective.length > 3) {
    effective = effective.slice(0, 3);
  }
  // Pill: no truncation (unlimited)

  return effective;
}

/** Return the option at the given index, failing with a descriptive error when
 *  the options array is empty or the index is out of bounds. */
function optionAt<T>(options: ToggleOption<T>[], index: number): ToggleOption<T> {
    const option = options[index];
    if (!option) throw new Error("Toggle: option index out of bounds or empty options array");
    return option;
}

/** Find the index of a value within the effective options array.
 *  Returns 0 if the value is not found (safe default). */
function findOptionIndex<T>(
  options: ToggleOption<T>[],
  value: T,
): number {
  const idx = options.findIndex((opt) => opt.value === value);
  return idx >= 0 ? idx : 0;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ToggleInner<T>(
  props: ToggleProps<T>,
  ref: React.ForwardedRef<ToggleHandle<T>>,
) {
  const {
    variant,
    value: initialValueProp,
    options: rawOptions,
    disabled: initialDisabled = false,
    visible = true,
    size = 'normal',
    onChange,
    onDirty,
    onTooltip,
  } = props;

  // --- compute effective options on mount / when setOptions is called -------

  const effectiveOptionsRef = useRef<ToggleOption<T>[]>(
    processOptions(rawOptions, variant),
  );

  // --- initial value resolution --------------------------------------------

  const initialValueRef = useRef<T>(
    (() => {
      const opts = effectiveOptionsRef.current;
      if (initialValueProp !== undefined) {
        const idx = findOptionIndex(opts, initialValueProp);
        return optionAt(opts, idx).value;
      }
      return optionAt(opts, 0).value;
    })(),
  );

  // --- state ---------------------------------------------------------------

  const [currentValue, setCurrentValue] = useState<T>(initialValueRef.current);
  const [dirty, setDirtyState] = useState(false);
  const [disabled, setDisabledState] = useState(initialDisabled);
  const [hintText, setHintTextState] = useState('');

  // --- refs (kept in sync with state so imperative methods see latest) -----

  const confirmedValueRef = useRef<T>(initialValueRef.current);
  const contextRef = useRef<Record<string, unknown> | null>(null);
  const currentValueRef = useRef<T>(currentValue);
  currentValueRef.current = currentValue;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const hintTextRef = useRef(hintText);
  hintTextRef.current = hintText;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onDirtyRef = useRef(onDirty);
  onDirtyRef.current = onDirty;
  const onTooltipRef = useRef(onTooltip);
  onTooltipRef.current = onTooltip;
  const containerRef = useRef<HTMLDivElement>(null);

  // --- dirty transition helper ---------------------------------------------
  // Returns true when the dirty state actually changed; the onDirty callback is
  // invoked by the handle (which has access to `handle`) to avoid a declaration cycle.

  const applyDirty = useCallback((newDirty: boolean): boolean => {
    const prev = dirtyRef.current;
    if (prev !== newDirty) {
      dirtyRef.current = newDirty;
      setDirtyState(newDirty);
      return true;
    }
    return false;
  }, []);

  // --- derive active option ------------------------------------------------

  const getActiveIndex = useCallback((): number => {
    return findOptionIndex(effectiveOptionsRef.current, currentValueRef.current);
  }, []);

  const getActiveLabel = useCallback((): string => {
    const idx = getActiveIndex();
    return optionAt(effectiveOptionsRef.current, idx).label;
  }, [getActiveIndex]);

  // --- cycle to next option ------------------------------------------------

  const cycleValue = useCallback(() => {
    const opts = effectiveOptionsRef.current;
    const currentIdx = getActiveIndex();
    const nextIdx = (currentIdx + 1) % opts.length;
    const nextValue = optionAt(opts, nextIdx).value;
    currentValueRef.current = nextValue;
    setCurrentValue(nextValue);
    onChangeRef.current?.(handle);
  }, [getActiveIndex]);

  // --- imperative API handle -----------------------------------------------
  // Built once (memoized) and exposed via useImperativeHandle — no render-phase
  // ref mutation, so the component is render-pure under StrictMode.

  const handle = useMemo<ToggleHandle<T>>(() => ({
    setValue(value: T, context: Record<string, unknown> = {}) {
      confirmedValueRef.current = value;
      contextRef.current = context;

      // If current displayed value differs from new confirmed value,
      // set dirty = true (concurrent modification detected).
      if (currentValueRef.current !== value) {
        if (applyDirty(true)) onDirtyRef.current?.(handle);
      }

      currentValueRef.current = value;
      setCurrentValue(value);
    },

    getValue() {
      return currentValueRef.current;
    },

    getContext() {
      return contextRef.current;
    },

    revertValue() {
      currentValueRef.current = confirmedValueRef.current;
      setCurrentValue(confirmedValueRef.current);
      if (applyDirty(false)) onDirtyRef.current?.(handle);
      hintTextRef.current = '';
      setHintTextState('');
      disabledRef.current = false;
      setDisabledState(false);
    },

    setDisabled(d: boolean) {
      disabledRef.current = d;
      setDisabledState(d);
    },

    getDisabled() {
      return disabledRef.current;
    },

    getDirty() {
      return dirtyRef.current;
    },

    setDirty(status: boolean) {
      if (applyDirty(status)) onDirtyRef.current?.(handle);
    },

    setHintText(text: string) {
      hintTextRef.current = text;
      setHintTextState(text);
    },

    setOptions(newOptions: ToggleOption<T>[]) {
      const processed = processOptions(newOptions, variant);
      effectiveOptionsRef.current = processed;

      // If the current displayed value is not in the new options set,
      // reset to the first option's value.
      const idx = findOptionIndex(processed, currentValueRef.current);
      if (optionAt(processed, idx).value !== currentValueRef.current) {
        currentValueRef.current = optionAt(processed, 0).value;
        setCurrentValue(optionAt(processed, 0).value);
      }
    },

    getOptions() {
      return [...effectiveOptionsRef.current];
    },
  }), [applyDirty]);

  useImperativeHandle(ref, () => handle, [handle]);

  // --- event handlers ------------------------------------------------------

  const handleToggleSwitchChange = useCallback(
    (e: { value: boolean }) => {
      if (disabledRef.current) return;
      // InputSwitch always has 2 options; map boolean to index
      const opts = effectiveOptionsRef.current;
      const targetIdx = e.value ? 0 : 1;
      const nextValue = optionAt(opts, targetIdx).value;
      currentValueRef.current = nextValue;
      setCurrentValue(nextValue);
      onChangeRef.current?.(handle);
    },
    [],
  );

  const handleCheckboxChange = useCallback(
    (e: CheckboxChangeEvent) => {
      if (disabledRef.current) return;
      // Bi-state checkbox: checked=true → index 0, checked=false → index 1
      const opts = effectiveOptionsRef.current;
      const targetIdx = e.checked ? 0 : 1;
      const nextValue = optionAt(opts, targetIdx).value;
      currentValueRef.current = nextValue;
      setCurrentValue(nextValue);
      onChangeRef.current?.(handle);
    },
    [],
  );

  const handleTriStateCheckboxChange = useCallback(
    (e: TriStateCheckboxChangeEvent) => {
      if (disabledRef.current) return;
      // Tri-state: true → index 0, false → index 1, null/undefined → index 2
      const opts = effectiveOptionsRef.current;
      let targetIdx: number;
      if (e.value === true) {
        targetIdx = 0;
      } else if (e.value === false) {
        targetIdx = 1;
      } else {
        targetIdx = 2; // null/undefined → indeterminate/third state
      }

      const nextValue = optionAt(opts, targetIdx).value;
      currentValueRef.current = nextValue;
      setCurrentValue(nextValue);
      onChangeRef.current?.(handle);
    },
    [],
  );

  const handlePillClick = useCallback(() => {
    if (disabledRef.current) return;

    // Advance to the next option first (updates currentValueRef + state).
    const opts = effectiveOptionsRef.current;
    const currentIdx = findOptionIndex(opts, currentValueRef.current);
    const nextIdx = (currentIdx + 1) % opts.length;
    const nextValue = optionAt(opts, nextIdx).value;
    currentValueRef.current = nextValue;
    setCurrentValue(nextValue);

    onChangeRef.current?.(handle);
  }, []);

  // --- derived values for PrimeReact bindings ------------------------------

  const activeIndex = getActiveIndex();

  // --- tooltip -------------------------------------------------------------

  const tooltipText = onTooltipRef.current?.(handle);

  // --- render --------------------------------------------------------------

  if (!visible) {
    return null;
  }

  const isDisabled = disabled;

  const containerClass = [
    'toggle-container',
    variant,
    size,
    dirty ? 'dirty' : '',
    isDisabled ? 'disabled' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const activeLabel = getActiveLabel();

  return (
    <div className={containerClass} ref={containerRef}>
      {variant === 'toggle' && (
        <div className="toggle-toggle-row">
          <InputSwitch
            checked={activeIndex === 0}
            disabled={isDisabled}
            onChange={handleToggleSwitchChange}
          />
          <span className="toggle-label">{activeLabel}</span>
        </div>
      )}

      {variant === 'checkbox' && effectiveOptionsRef.current.length === 2 && (
        <div className="toggle-checkbox-row">
          <Checkbox
            checked={activeIndex === 0}
            disabled={isDisabled}
            onChange={handleCheckboxChange}
          />
          <span className="toggle-label">{activeLabel}</span>
        </div>
      )}

      {variant === 'checkbox' && effectiveOptionsRef.current.length === 3 && (
        <div className="toggle-checkbox-row">
          <TriStateCheckbox
            value={
              activeIndex === 0
                ? true
                : activeIndex === 1
                  ? false
                  : null
            }
            disabled={isDisabled}
            onChange={handleTriStateCheckboxChange}
          />
          <span className="toggle-label">{activeLabel}</span>
        </div>
      )}

      {variant === 'pill' && (
        <button
          type="button"
          className={`toggle-pill-button${activeIndex === 0 ? ' toggle-pill-default' : ' toggle-pill-active'}`}
          disabled={isDisabled}
          aria-pressed={
            effectiveOptionsRef.current.length === 2
              ? activeIndex === 0
              : undefined
          }
          aria-label={activeLabel}
          onClick={handlePillClick}
          tabIndex={isDisabled ? -1 : 0}
        >
          {activeLabel}
        </button>
      )}

      {hintText && <small className="toggle-hint">{hintText}</small>}

      {tooltipText && (
        <Tooltip
          target={containerRef as React.RefObject<HTMLElement>}
          content={tooltipText}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported component (generic forwardRef wrapper)
// ---------------------------------------------------------------------------

const Toggle = forwardRef(ToggleInner) as <T>(
  props: ToggleProps<T> & { ref?: React.ForwardedRef<ToggleHandle<T>> },
) => ReturnType<typeof ToggleInner>;

export default Toggle;
