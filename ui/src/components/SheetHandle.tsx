import { useRef, type PointerEvent } from 'react';
import styles from './Dashboard.module.css';

export type SheetState = 'closed' | 'half' | 'full';

type SheetHandleProps = {
  onChange: (sheet: SheetState) => void;
  onDrag: (height: number | null) => void;
};

const CLOSED_HEIGHT = 28;

function snapHeights() {
  return {
    closed: CLOSED_HEIGHT,
    half: window.innerHeight * 0.45,
    full: window.innerHeight * 0.88,
  };
}

export default function SheetHandle({ onChange, onDrag }: SheetHandleProps) {
  const drag = useRef({ startY: 0, startHeight: 0, moved: false });

  const handleDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const height = event.currentTarget.parentElement?.offsetHeight ?? 0;
    drag.current = { startY: event.clientY, startHeight: height, moved: false };
  };

  const handleMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const delta = drag.current.startY - event.clientY;
    if (Math.abs(delta) > 4) drag.current.moved = true;
    if (!drag.current.moved) return;
    const { closed, full } = snapHeights();
    onDrag(Math.min(full, Math.max(closed, drag.current.startHeight + delta)));
  };

  const handleUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    if (drag.current.moved) {
      const height = drag.current.startHeight + drag.current.startY - event.clientY;
      const heights = snapHeights();
      const nearest = (Object.keys(heights) as SheetState[]).reduce((best, key) =>
        Math.abs(heights[key] - height) < Math.abs(heights[best] - height) ? key : best,
      );
      onChange(nearest);
    }
    onDrag(null);
  };

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className={styles.handle}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={() => onDrag(null)}
    >
      <span className={styles.grip} />
    </div>
  );
}
