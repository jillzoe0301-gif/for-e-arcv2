import { ChangeEvent, ClipboardEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';

type Props = {
  value: string;
  onCommit: (keyword: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
  id?: string;
};

export function SearchInput({ value, onCommit, placeholder, debounceMs = 300, className = '', id }: Props) {
  const [inputText, setInputText] = useState(value);
  const composingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setInputText(value);
  }, [value]);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  function commit(nextValue: string, immediate = false) {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (immediate) {
      onCommit(nextValue);
      return;
    }
    timerRef.current = window.setTimeout(() => onCommit(nextValue), debounceMs);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = event.currentTarget.value;
    setInputText(nextValue);
    if (composingRef.current || (event.nativeEvent as InputEvent).isComposing) return;
    commit(nextValue);
  }

  function handleCompositionStart() {
    composingRef.current = true;
  }

  function handleCompositionUpdate() {
    // 中文注音組字期間不搜尋、不 render、不重設 input.value。
  }

  function handleCompositionEnd(event: React.CompositionEvent<HTMLInputElement>) {
    composingRef.current = false;
    const nextValue = event.currentTarget.value;
    setInputText(nextValue);
    commit(nextValue, true);
  }

  function handlePaste(_event: ClipboardEvent<HTMLInputElement>) {
    composingRef.current = false;
    window.setTimeout(() => {
      const nextValue = inputRef.current?.value ?? '';
      setInputText(nextValue);
      commit(nextValue, true);
    }, 0);
  }

  function handleBlur() {
    composingRef.current = false;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      composingRef.current = false;
      commit(event.currentTarget.value, true);
    }
  }

  function clear() {
    composingRef.current = false;
    setInputText('');
    onCommit('');
    inputRef.current?.focus();
  }

  return (
    <div className={`search-input ${className}`}>
      <input
        id={id}
        ref={inputRef}
        value={inputText}
        placeholder={placeholder}
        onChange={handleChange}
        onCompositionStart={handleCompositionStart}
        onCompositionUpdate={handleCompositionUpdate}
        onCompositionEnd={handleCompositionEnd}
        onPaste={handlePaste}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {inputText ? <button type="button" className="search-clear" onClick={clear}>清除</button> : null}
    </div>
  );
}
