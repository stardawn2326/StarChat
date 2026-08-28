import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

interface WorkbenchResizeHandleProps {
  axis: 'horizontal' | 'vertical';
  value: number;
  minimum: number;
  maximum: number;
  resetValue: number;
  direction?: 1 | -1;
  label: string;
  controls: string;
  className?: string;
  onChange: (value: number) => void;
}

interface DragState {
  pointerId: number;
  coordinate: number;
  value: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(Math.round(value), minimum), maximum);
}

export function WorkbenchResizeHandle({
  axis,
  value,
  minimum,
  maximum,
  resetValue,
  direction = 1,
  label,
  controls,
  className = '',
  onChange
}: WorkbenchResizeHandleProps): JSX.Element {
  const drag = useRef<DragState | null>(null);
  const coordinate = (event: PointerEvent<HTMLDivElement>): number => axis === 'vertical' ? event.clientX : event.clientY;
  const applyCoordinateDelta = (delta: number): void => onChange(clamp(value + delta * direction, minimum, maximum));

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    drag.current = { pointerId: event.pointerId, coordinate: coordinate(event), value };
    document.documentElement.dataset.workbenchResizing = 'true';
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    onChange(clamp(active.value + (coordinate(event) - active.coordinate) * direction, minimum, maximum));
  };

  const finishPointer = (event: PointerEvent<HTMLDivElement>): void => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    delete document.documentElement.dataset.workbenchResizing;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 24 : 8;
    let coordinateDelta = 0;
    switch (event.key) {
      case 'ArrowLeft': coordinateDelta = axis === 'vertical' ? -step : 0; break;
      case 'ArrowRight': coordinateDelta = axis === 'vertical' ? step : 0; break;
      case 'ArrowUp': coordinateDelta = axis === 'horizontal' ? -step : 0; break;
      case 'ArrowDown': coordinateDelta = axis === 'horizontal' ? step : 0; break;
      case 'Home': onChange(minimum); event.preventDefault(); return;
      case 'End': onChange(maximum); event.preventDefault(); return;
      default: return;
    }
    if (coordinateDelta !== 0) {
      applyCoordinateDelta(coordinateDelta);
      event.preventDefault();
    }
  };

  return <div
    className={`wb-resize-handle is-${axis} ${className}`.trim()}
    role="separator"
    tabIndex={0}
    aria-label={label}
    aria-controls={controls}
    aria-orientation={axis}
    aria-valuemin={minimum}
    aria-valuemax={maximum}
    aria-valuenow={Math.round(value)}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={finishPointer}
    onPointerCancel={finishPointer}
    onLostPointerCapture={() => {
      drag.current = null;
      delete document.documentElement.dataset.workbenchResizing;
    }}
    onDoubleClick={() => onChange(clamp(resetValue, minimum, maximum))}
    onKeyDown={onKeyDown}
  ><span aria-hidden="true" /></div>;
}
