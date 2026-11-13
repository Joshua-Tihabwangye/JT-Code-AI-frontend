import { useState, useRef, useEffect, useCallback, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Plus, Send, Paperclip, Image as ImageIcon, FileText, X, ChevronDown, Mic } from 'lucide-react';

interface Props {
  disabled?: boolean;
  onSubmit: (text: string, attachments: File[]) => Promise<void>;
  placeholder?: string;
}

const MIN_TEXTAREA_HEIGHT = 24;
const MAX_TEXTAREA_HEIGHT = 320;

const MODELS = [
  { id: 'jt-code', label: 'JT-Code' },
  { id: 'jt-code-pro', label: 'JT-Code Pro' },
  { id: 'jt-code-mini', label: 'JT-Code Mini' },
];

export function ChatComposer({ disabled = false, onSubmit, placeholder }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [model, setModel] = useState(MODELS[0]?.id ?? 'jt-code');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const plusRef = useRef<HTMLButtonElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Height, scrolling and layout of the field, measured together and only stored when they change
  // (separate setters per keystroke chained enough synchronous renders to hit React's update limit).
  const [layout, setLayout] = useState<{ height: number; overflow: 'hidden' | 'auto'; expanded: boolean }>({
    height: MIN_TEXTAREA_HEIGHT,
    overflow: 'hidden',
    expanded: false,
  });
  const { height: fieldHeight, overflow: fieldOverflow, expanded } = layout;

  const resolvedPlaceholder = placeholder ?? t('composer.defaultPlaceholder');

  // Measure the real rendered content height and derive the visual state.
  // Expansion is driven by the measured textarea height (visual line count),
  // never by newline characters alone — wrapped text must also expand it.
  //
  // We measure against a hidden MIRROR textarea (never the controlled React
  // node) and drive the live textarea height through React state. This avoids
  // imperatively mutating the controlled <textarea>, which desyncs React's
  // value tracker and triggers an infinite onChange/render loop.
  const resize = useCallback(() => {
    const source = textareaRef.current;
    const mirror = mirrorRef.current;
    const form = formRef.current;
    if (!source || !mirror || !form) return;

    const style = window.getComputedStyle(source);
    // Mirror the relevant box/text metrics so wrapping matches exactly.
    mirror.style.font = style.font;
    mirror.style.lineHeight = style.lineHeight;
    mirror.style.padding = style.padding;
    mirror.style.border = style.border;
    mirror.style.letterSpacing = style.letterSpacing;
    mirror.style.textTransform = style.textTransform;
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.value = source.value;
    const measureAt = (width: number) => {
      mirror.style.width = `${Math.max(width, 40)}px`;
      return mirror.scrollHeight;
    };

    // Two widths: inline (between the plus and the controls) decides whether the text needs more than one
    // line; expanded, the field spans the whole composer above the controls. Deciding on the inline width
    // keeps the layout stable (text that only fits the wide field does not flip back to one line).
    const formStyle = window.getComputedStyle(form);
    const gap = parseFloat(formStyle.columnGap) || 0;
    const fullWidth = form.clientWidth - (parseFloat(formStyle.paddingLeft) || 0) - (parseFloat(formStyle.paddingRight) || 0);
    const inlineWidth = fullWidth - (plusRef.current?.offsetWidth ?? 0) - (actionsRef.current?.offsetWidth ?? 0) - gap * 2;

    const parsedLineHeight = parseFloat(style.lineHeight);
    const lineHeight = Number.isFinite(parsedLineHeight) ? parsedLineHeight : 20;
    const parsedPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const padding = Number.isFinite(parsedPadding) ? parsedPadding : 0;
    const inlineLines = Math.round(Math.max(measureAt(inlineWidth) - padding, 0) / lineHeight);
    const nextExpanded = inlineLines > 1;

    const measured = nextExpanded ? measureAt(fullWidth) : measureAt(inlineWidth);
    const next = {
      height: Math.min(Math.max(measured, MIN_TEXTAREA_HEIGHT), MAX_TEXTAREA_HEIGHT),
      overflow: measured > MAX_TEXTAREA_HEIGHT ? ('auto' as const) : ('hidden' as const),
      expanded: nextExpanded,
    };
    setLayout((prev) => (prev.height === next.height && prev.overflow === next.overflow && prev.expanded === next.expanded ? prev : next));
  }, []);

  // Re-measure whenever the value changes (typing, paste, controlled clear).
  // Measured on the next frame, outside the keystroke's synchronous update.
  useEffect(() => {
    const frame = requestAnimationFrame(() => resize());
    return () => cancelAnimationFrame(frame);
  }, [text, resize]);

  // Re-measure on real viewport/container width changes.
  // NOTE: We deliberately avoid a ResizeObserver here. Toggling the
  // `expanded` state changes the textarea's grid placement, which nudges its
  // rendered width by sub-pixels and would make a ResizeObserver re-fire
  // resize() in a loop (expanded -> width change -> resize -> expanded ...).
  // A window resize listener only fires for genuine viewport changes.
  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => resize());
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, [resize]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || disabled) return;
    const files = attachments;
    setText('');
    setAttachments([]);
    await onSubmit(value, files);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter submits, Shift+Enter inserts a newline, respect IME composition.
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function handleAttach(type: 'document' | 'image') {
    setShowAttachMenu(false);
    if (type === 'document') documentInputRef.current?.click();
    else imageInputRef.current?.click();
  }

  function onFilesSelected(files: FileList | null) {
    if (!files) return;
    setAttachments((prev) => [...prev, ...Array.from(files)]);
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  // Close menus when clicking outside the composer.
  useEffect(() => {
    function handleClickOutside(event: Event) {
      const target = event.target as Element;
      if (target.closest('.composer')) return;
      setShowAttachMenu(false);
      setShowModelMenu(false);
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const activeModel = MODELS.find((m) => m.id === model)?.label ?? model;
  const canSend = !disabled && text.trim().length > 0;

  return (
    <form
      ref={formRef}
      className={clsx('composer', expanded && 'composer--expanded')}
      onSubmit={(event) => void submit(event)}
    >
      {/* Plus / attach — always on the left */}
      <button
        ref={plusRef}
        type="button"
        className="composer__plus icon"
        title={t('composer.attach')}
        onClick={() => {
          setShowModelMenu(false);
          setShowAttachMenu((v) => !v);
        }}
      >
        <Plus size={18} />
      </button>

      {/* Flexible center textarea */}
      <textarea
        ref={textareaRef}
        id="jt-code-prompt"
        className="composer__field"
        style={{ height: fieldHeight, overflowY: fieldOverflow }}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={resolvedPlaceholder}
        rows={1}
        disabled={disabled}
      />

      {/* Hidden mirror used only to measure wrapped height (never rendered) */}
      <textarea
        ref={mirrorRef}
        aria-hidden="true"
        tabIndex={-1}
        className="composer__field composer__field-mirror"
        readOnly
        rows={1}
      />

      {/* Right side controls: model → microphone → send */}
      <div ref={actionsRef} className="composer__actions">
        <div className="composer__model">
          <button
            type="button"
            className="composer__model-trigger"
            title={activeModel}
            onClick={() => {
              setShowAttachMenu(false);
              setShowModelMenu((v) => !v);
            }}
          >
            <span>{activeModel}</span>
            <ChevronDown size={14} className={clsx('transition-transform duration-150', showModelMenu && 'rotate-180')} />
          </button>
          {showModelMenu && (
            <div className="composer__model-menu" role="menu">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="menuitem"
                  className={clsx('composer__model-item', m.id === model && 'is-active')}
                  onClick={() => {
                    setModel(m.id);
                    setShowModelMenu(false);
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="icon" type="button" title={t('composer.voiceInput')}>
          <Mic size={18} />
        </button>

        <button
          type="submit"
          className="send"
          disabled={!canSend}
          title={t('composer.sendMessage')}
        >
          <Send size={16} />
        </button>
      </div>

      {/* Attach menu */}
      {showAttachMenu && (
        <div className="attach-menu">
          <button type="button" onClick={() => handleAttach('document')}>
            <Paperclip size={14} /> {t('composer.attachDocument')}
          </button>
          <button type="button" onClick={() => handleAttach('image')}>
            <ImageIcon size={14} /> {t('composer.attachImage')}
          </button>
        </div>
      )}

      <input
        ref={documentInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.md,.csv"
        multiple
        className="sr-only"
        onChange={(e) => onFilesSelected(e.target.files)}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => onFilesSelected(e.target.files)}
      />

      {attachments.length > 0 && (
        <div className="composer__attachments">
          {attachments.map((file, index) => (
            <span
              key={`${file.name}-${index}`}
              className="composer__attachment"
            >
              {file.type.startsWith('image/') ? <ImageIcon size={12} /> : <FileText size={12} />}
              <span className="truncate max-w-[140px]">{file.name}</span>
              <button
                type="button"
                onClick={() => removeAttachment(index)}
                aria-label={t('composer.removeAttachment', { name: file.name })}
                className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </form>
  );
}