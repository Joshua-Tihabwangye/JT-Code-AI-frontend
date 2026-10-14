import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ChatComposer } from './ChatComposer';
import '../../i18n/config';

const PLACEHOLDER = 'Message JT-Code…';

// The composer measures wrapped height on a hidden mirror textarea (never the
// controlled field), so the simulated layout height goes on the mirror.
function setScrollHeight(field: HTMLElement, value: number) {
  const mirror = field.parentElement?.querySelector<HTMLTextAreaElement>('.composer__field-mirror');
  Object.defineProperty(mirror ?? field, 'scrollHeight', {
    configurable: true,
    get: () => value,
  });
}

function renderComposer(props: Partial<React.ComponentProps<typeof ChatComposer>> = {}) {
  const onSubmit = props.onSubmit ?? vi.fn();
  const utils = render(
    <ChatComposer placeholder={PLACEHOLDER} onSubmit={onSubmit} {...props} />
  );
  return { ...utils, onSubmit };
}

describe('ChatComposer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it('renders with the expected placeholder', () => {
    renderComposer();
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeInTheDocument();
  });

  it('starts compact (no expanded class) when empty', () => {
    const { container } = renderComposer();
    const form = container.querySelector('form.composer')!;
    expect(form).not.toHaveClass('composer--expanded');
  });

  it('starts compact for a single character', () => {
    const { container } = renderComposer();
    const textarea = screen.getByPlaceholderText(PLACEHOLDER);
    setScrollHeight(textarea, 24);
    fireEvent.change(textarea, { target: { value: 'a' } });
    expect(container.querySelector('form.composer')).not.toHaveClass('composer--expanded');
  });

  it('stays compact for a normal one-line prompt', () => {
    const { container } = renderComposer();
    const textarea = screen.getByPlaceholderText(PLACEHOLDER);
    setScrollHeight(textarea, 24);
    fireEvent.change(textarea, { target: { value: 'Build me a React dashboard' } });
    expect(container.querySelector('form.composer')).not.toHaveClass('composer--expanded');
  });

  it('expands when text wraps to multiple visual lines', () => {
    const { container } = renderComposer();
    const textarea = screen.getByPlaceholderText(PLACEHOLDER);
    // Simulate a wrapped, multi-line measured height.
    setScrollHeight(textarea, 96);
    fireEvent.change(textarea, {
      target: { value: 'Build me a React dashboard with authentication, billing and workspace management.' },
    });
    expect(container.querySelector('form.composer')).toHaveClass('composer--expanded');
  });

  it('expands for explicit newlines (Shift+Enter)', () => {
    const { container } = renderComposer();
    const textarea = screen.getByPlaceholderText(PLACEHOLDER);
    setScrollHeight(textarea, 72);
    fireEvent.change(textarea, { target: { value: 'line one\nline two\nline three' } });
    expect(container.querySelector('form.composer')).toHaveClass('composer--expanded');
  });

  it('expands for a very long unbroken string', () => {
    const { container } = renderComposer();
    const textarea = screen.getByPlaceholderText(PLACEHOLDER);
    setScrollHeight(textarea, 120);
    fireEvent.change(textarea, { target: { value: 'h'.repeat(300) } });
    expect(container.querySelector('form.composer')).toHaveClass('composer--expanded');
  });

  it('shrinks back to compact after deleting multiline content', () => {
    const { container } = renderComposer();
    const textarea = screen.getByPlaceholderText(PLACEHOLDER);

    setScrollHeight(textarea, 120);
    fireEvent.change(textarea, { target: { value: 'a'.repeat(400) } });
    expect(container.querySelector('form.composer')).toHaveClass('composer--expanded');

    setScrollHeight(textarea, 24);
    fireEvent.change(textarea, { target: { value: 'short' } });
    expect(container.querySelector('form.composer')).not.toHaveClass('composer--expanded');
  });

  it('returns to compact when cleared back to empty', () => {
    const { container } = renderComposer();
    const textarea = screen.getByPlaceholderText(PLACEHOLDER);

    setScrollHeight(textarea, 96);
    fireEvent.change(textarea, { target: { value: 'multiple\nlines\nof\ntext' } });
    expect(container.querySelector('form.composer')).toHaveClass('composer--expanded');

    setScrollHeight(textarea, 24);
    fireEvent.change(textarea, { target: { value: '' } });
    expect(container.querySelector('form.composer')).not.toHaveClass('composer--expanded');
  });

  it('keeps the + button on the left and the actions (send) on the right', () => {
    const { container } = renderComposer();
    const form = container.querySelector('form.composer')!;
    const plus = form.querySelector('.composer__plus')!;
    const actions = form.querySelector('.composer__actions')!;
    const send = actions.querySelector('button.send')!;
    // jsdom has no layout; assert DOM order within the form.
    const children = Array.from(form.children);
    expect(children.indexOf(plus)).toBeLessThan(children.indexOf(actions));
    expect(actions.contains(send)).toBe(true);
  });

  it('disables send when empty and enables it with text', () => {
    const { container } = renderComposer();
    const textarea = screen.getByPlaceholderText(PLACEHOLDER);
    const send = container.querySelector('button.send') as HTMLButtonElement;
    expect(send).toBeDisabled();

    fireEvent.change(textarea, { target: { value: 'hello' } });
    expect(send).not.toBeDisabled();
  });

  it('submits the trimmed text on send click', () => {
    const onSubmit = vi.fn();
    const { container } = renderComposer({ onSubmit });
    const textarea = screen.getByPlaceholderText(PLACEHOLDER);
    fireEvent.change(textarea, { target: { value: '  say hi  ' } });
    fireEvent.click(container.querySelector('button.send')!);
    expect(onSubmit).toHaveBeenCalledWith('say hi', []);
  });

  it('clears the input after submitting', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = renderComposer({ onSubmit });
    const textarea = screen.getByPlaceholderText(PLACEHOLDER);
    fireEvent.change(textarea, { target: { value: 'hello world' } });
    fireEvent.click(container.querySelector('button.send')!);
    // value is cleared synchronously via setState
    expect((textarea as HTMLTextAreaElement).value).toBe('');
  });

  it('submits on Enter but not on Shift+Enter', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = renderComposer({ onSubmit });
    const textarea = screen.getByPlaceholderText(PLACEHOLDER);
    fireEvent.change(textarea, { target: { value: 'send me' } });

    // Stub requestSubmit so it routes through the form submit handler in jsdom.
    const form = container.querySelector('form.composer') as HTMLFormElement;
    const requestSubmit = vi.fn((_ev?: Event) => {
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      Object.defineProperty(submitEvent, 'preventDefault', { value: () => {} });
      form.dispatchEvent(submitEvent);
    });
    form.requestSubmit = requestSubmit as unknown as HTMLFormElement["requestSubmit"];

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(onSubmit).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not submit while IME composition is active', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = renderComposer({ onSubmit });
    const textarea = screen.getByPlaceholderText(PLACEHOLDER);
    fireEvent.change(textarea, { target: { value: 'こ' } });

    const form = container.querySelector('form.composer') as HTMLFormElement;
    form.requestSubmit = vi.fn((_ev?: Event) => {
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(submitEvent);
    }) as unknown as HTMLFormElement["requestSubmit"];

    fireEvent.keyDown(textarea, {
      key: 'Enter',
      shiftKey: false,
      isComposing: true,
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('opens the attach menu from the + button', () => {
    renderComposer();
    const plus = document.querySelector('.composer__plus')!;
    fireEvent.click(plus);
    expect(screen.getByText(/attach a document/i)).toBeInTheDocument();
    expect(screen.getByText(/attach an image/i)).toBeInTheDocument();
  });

  it('opens the model selector menu', () => {
    renderComposer();
    const trigger = document.querySelector('.composer__model-trigger')!;
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').length).toBeGreaterThan(0);
  });

  it('renders a microphone button', () => {
    renderComposer();
    expect(screen.getByTitle(/voice input/i)).toBeInTheDocument();
  });

  it('does not submit when disabled', () => {
    const onSubmit = vi.fn();
    const { container } = renderComposer({ onSubmit, disabled: true });
    const textarea = screen.getByPlaceholderText(/Message JT-Code/i);
    const send = container.querySelector('button.send') as HTMLButtonElement;
    fireEvent.change(textarea, { target: { value: 'hi' } });
    expect(send).toBeDisabled();
  });
});
