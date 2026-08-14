import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Tooltip } from 'primereact/tooltip';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface LabelHandle {
  /** Update the displayed text and optionally store an opaque context record.
   *  When `context` is omitted, the existing context is preserved.
   *  @param text    The new display text.
   *  @param context Optional contextual data (e.g. `{ configKey, updatedAt }`). */
  setText(text: string, context?: Record<string, unknown>): void;

  /** Return the currently displayed text. */
  getText(): string;

  /** Return the context object stored by the last `setText` call,
   *  or `null` if none has been set yet. */
  getContext(): Record<string, unknown> | null;

  /** Show or hide the Label programmatically.
   *  When hidden, the component renders `null`. */
  setVisible(visible: boolean): void;

  /** Return whether the Label is currently visible. */
  getVisible(): boolean;

  /** Set hint text displayed below the main label text.
   *  Pass an empty string or `""` to hide the hint. */
  setHintText(text: string): void;

  /** Return the current hint text. */
  getHintText(): string;
}

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

interface LabelProps {
  /** Initial display text. Text ownership is a three-phase model: this prop seeds the
   *  initial mount value; the page's data-reload effect re-seeds from fresh server data
   *  (guarded — only when the incoming value differs via `getText()`); PubSub handlers
   *  apply live patches via `setText()`. After mount, text is managed internally via
   *  `setText()` — this prop is only used for the initial render. */
  text?: string;

  /** When `false`, the component renders nothing (`null`).
   *  @default true */
  visible?: boolean;

  /** Controls the font size of the display text.
   *  @default "normal" */
  size?: 'small' | 'normal' | 'large';

  /** Called to retrieve tooltip text for the Label.
   *  Return `undefined` or an empty string for no tooltip.
   *  The callback receives the Label's handle for context-aware tooltips. */
  onTooltip?: (component: LabelHandle) => string | undefined;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function LabelInner(
  props: LabelProps,
  ref: React.ForwardedRef<LabelHandle>,
) {
  const {
    text: initialText = '',
    visible: initialVisible = true,
    size = 'normal',
    onTooltip,
  } = props;

  // --- state ---------------------------------------------------------------

  const [text, setTextState] = useState(initialText);
  const [visible, setVisibleState] = useState(initialVisible);
  const [hintText, setHintTextState] = useState('');

  // --- refs (kept in sync with state so imperative methods see latest) -----

  const textRef = useRef(initialText);
  textRef.current = text;
  const contextRef = useRef<Record<string, unknown> | null>(null);
  const visibleRef = useRef(initialVisible);
  visibleRef.current = visible;
  const hintTextRef = useRef('');
  hintTextRef.current = hintText;
  const onTooltipRef = useRef(onTooltip);
  onTooltipRef.current = onTooltip;
  const containerRef = useRef<HTMLDivElement>(null);

  // --- imperative API handle -----------------------------------------------
  // Built once (memoized) and exposed via useImperativeHandle — no render-phase
  // ref mutation, so the component is render-pure under StrictMode.

  const handle = useMemo<LabelHandle>(() => ({
    setText(newText: string, context?: Record<string, unknown>) {
      textRef.current = newText;
      setTextState(newText);
      if (context !== undefined) {
        contextRef.current = context;
      }
    },

    getText() {
      return textRef.current;
    },

    getContext() {
      return contextRef.current;
    },

    setVisible(v: boolean) {
      visibleRef.current = v;
      setVisibleState(v);
    },

    getVisible() {
      return visibleRef.current;
    },

    setHintText(text: string) {
      hintTextRef.current = text;
      setHintTextState(text);
    },

    getHintText() {
      return hintTextRef.current;
    },
  }), []);

  useImperativeHandle(ref, () => handle, [handle]);

  // --- tooltip -------------------------------------------------------------

  const tooltipText = onTooltipRef.current?.(handle);

  // --- render --------------------------------------------------------------

  if (!visible) {
    return null;
  }

  const containerClass = [
    'label-container',
    size,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClass} ref={containerRef}>
      <output className="label-text" aria-live="polite">
        {text}
      </output>

      {hintText && <small className="label-hint">{hintText}</small>}

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
// Exported component (forwardRef wrapper)
// ---------------------------------------------------------------------------

const Label = forwardRef(LabelInner);

export default Label;
