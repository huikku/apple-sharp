import { useEffect, useMemo, useRef, useState } from 'react';

interface MobileCarouselProps {
    index: number;
    onIndexChange: (next: number) => void;
    children: [React.ReactNode, React.ReactNode, React.ReactNode];
}

export function MobileCarousel({ index, onIndexChange, children }: MobileCarouselProps) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const startXRef = useRef<number | null>(null);
    const startYRef = useRef<number | null>(null);
    const dragDxRef = useRef(0);
    const isDraggingRef = useRef(false);

    const [dragDx, setDragDx] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [containerWidth, setContainerWidth] = useState(0);

    const translatePct = useMemo(() => {
        const width = containerWidth || (typeof window === 'undefined' ? 1 : window.innerWidth || 1);
        const deltaPct = (dragDx / width) * 100;
        const min = -((children.length - 1) * 100);
        const max = 0;
        const next = -(index * 100) + deltaPct;
        return Math.min(max, Math.max(min, next));
    }, [children.length, containerWidth, dragDx, index]);

    useEffect(() => {
        if (!rootRef.current) return;
        const el = rootRef.current;
        const update = () => setContainerWidth(el.getBoundingClientRect().width);
        update();

        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const onTouchStart = (e: React.TouchEvent) => {
        const t = e.touches[0];
        startXRef.current = t.clientX;
        startYRef.current = t.clientY;
        dragDxRef.current = 0;
        isDraggingRef.current = false;
        setDragDx(0);
        setIsDragging(false);
    };

    const onTouchMove = (e: React.TouchEvent) => {
        const startX = startXRef.current;
        const startY = startYRef.current;
        if (startX == null || startY == null) return;

        const t = e.touches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;

        // Don’t hijack vertical scrolling unless it’s a clear horizontal swipe
        let dragging = isDraggingRef.current;
        if (!dragging) {
            if (Math.abs(dx) < 8) return;
            if (Math.abs(dx) < Math.abs(dy) * 1.2) return;
            dragging = true;
            isDraggingRef.current = true;
            setIsDragging(true);
        }

        if (!dragging) return;

        // Prevent default only if we are horizontal swiping
        if (e.cancelable) e.preventDefault();
        dragDxRef.current = dx;
        setDragDx(dx);
    };

    const onTouchEnd = () => {
        if (!isDraggingRef.current) {
            setDragDx(0);
            dragDxRef.current = 0;
            startXRef.current = null;
            startYRef.current = null;
            return;
        }

        const width = containerWidth || (typeof window === 'undefined' ? 1 : window.innerWidth || 1);
        const threshold = Math.min(120, Math.max(40, width * 0.18));
        const lastIndex = children.length - 1;
        let next = index;
        const lastDx = dragDxRef.current;

        if (lastDx <= -threshold) next = Math.min(lastIndex, index + 1);
        if (lastDx >= threshold) next = Math.max(0, index - 1);

        onIndexChange(next);
        setDragDx(0);
        dragDxRef.current = 0;
        setIsDragging(false);
        isDraggingRef.current = false;
        startXRef.current = null;
        startYRef.current = null;
    };

    return (
        <div
            ref={rootRef}
            className="relative flex-1 overflow-hidden touch-pan-y"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchEnd}
        >
            <div
                className="flex h-full w-full"
                style={{
                    transform: `translateX(${translatePct}%)`,
                    transition: isDragging ? 'none' : 'transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                }}
            >
                {children.map((child, i) => (
                    <div key={i} className="w-full shrink-0 h-full overflow-hidden">
                        {child}
                    </div>
                ))}
            </div>
        </div>
    );
}
