import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

export interface GlassSelectOption {
  value: string;
  label: string;
}

export function GlassSelect({ id, value, options, onChange, ariaLabel, placeholder = '请选择', disabled = false }: { id?: string; value: string; options: GlassSelectOption[]; onChange: (value: string) => void; ariaLabel: string; placeholder?: string; disabled?: boolean }): JSX.Element {
  const [open, setOpen] = useState(false);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const [activeIndex, setActiveIndex] = useState(Math.max(0, selectedIndex));
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const menuId = `glass-select-menu-${generatedId}`;
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const activeOptionId = open && options[activeIndex] ? `${menuId}-option-${activeIndex}` : undefined;

  useEffect(() => {
    if (!open) setActiveIndex(Math.max(0, selectedIndex));
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    listboxRef.current?.focus({ preventScroll: true });
    const onPointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const openMenu = (): void => {
    if (disabled) return;
    setActiveIndex(Math.max(0, selectedIndex));
    setOpen(true);
  };

  const closeMenu = (restoreFocus = false): void => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const choose = (index: number): void => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    closeMenu(true);
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu();
    }
  };

  const handleListboxKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (event.key === 'Tab') {
      closeMenu();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (options.length === 0) return;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((index) => (index + direction + options.length) % options.length);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActiveIndex(event.key === 'Home' ? 0 : Math.max(0, options.length - 1));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(activeIndex);
    }
  };

  return <div ref={rootRef} className={`glass-select${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`}>
    <button ref={triggerRef} id={id} type="button" className="glass-select-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-controls={menuId} disabled={disabled} onClick={() => (open ? closeMenu() : openMenu())} onKeyDown={handleTriggerKeyDown}>
      <span>{selectedOption?.label ?? placeholder}</span><span className="glass-select-chevron" aria-hidden="true">⌄</span>
    </button>
    {open ? <div ref={listboxRef} id={menuId} className="glass-select-menu" role="listbox" aria-label={ariaLabel} aria-activedescendant={activeOptionId} tabIndex={-1} onKeyDown={handleListboxKeyDown}>
      {options.length > 0 ? options.map((option, index) => <div id={`${menuId}-option-${index}`} key={option.value} className={`glass-select-option${index === activeIndex ? ' is-active' : ''}${option.value === value ? ' is-selected' : ''}`} role="option" aria-selected={option.value === value} onClick={() => choose(index)} onMouseEnter={() => setActiveIndex(index)}>{option.label}</div>) : <div className="glass-select-empty">暂无可选项</div>}
    </div> : null}
  </div>;
}
