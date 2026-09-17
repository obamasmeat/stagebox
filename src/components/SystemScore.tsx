import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type UIEvent } from "react";
import type { Playhead } from "../types";

export function barsPerSystem(viewWidth: number, barWidth: number, gutter: number): number {
  return Math.max(2, Math.min(4, Math.floor((viewWidth - gutter) / barWidth) || 2));
}

export function SystemScore({
  barCount,
  slotsPerBar,
  barWidth,
  systemHeight,
  gutterWidth,
  playhead,
  onSeekBar,
  renderSystem,
}: {
  barCount: number;
  slotsPerBar: number;
  barWidth: number;
  systemHeight: number;
  gutterWidth: number;
  playhead: Playhead;
  onSeekBar: (bar: number) => void;
  renderSystem: (startBar: number, count: number, width: number) => ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const followRef = useRef(true);
  const ignoreScrollRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const [viewW, setViewW] = useState(960);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    setViewW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const perLine = barsPerSystem(viewW, barWidth, gutterWidth);
  const innerW = Math.max(barWidth, viewW - gutterWidth);
  const stretchedBar = innerW / perLine;
  const systemCount = Math.max(1, Math.ceil(barCount / perLine));
  const system = Math.min(systemCount - 1, Math.floor(playhead.bar / perLine));
  const barIn = playhead.bar % perLine;
  const frac = playhead.phase === "song" ? playhead.slotExact / slotsPerBar : 0;
  const x = gutterWidth + (barIn + frac) * stretchedBar;
  const y = 8 + system * systemHeight;
  const playing = playhead.phase === "song" || playhead.phase === "countin" || playhead.phase === "waiting";
  const pageWidth = viewW;
  const contentH = systemCount * systemHeight;

  function scrollToSystem(sys: number, force = false) {
    const el = wrapRef.current;
    if (!el) return;
    const target = Math.max(0, sys * systemHeight);
    const viewTop = el.scrollTop;
    const viewBot = viewTop + el.clientHeight;
    const sysTop = target;
    const sysBot = target + systemHeight;
    const hidden = sysTop < viewTop - 4 || sysBot > viewBot + 4;
    if (!force && !hidden) return;
    ignoreScrollRef.current = true;
    el.scrollTop = target;
    requestAnimationFrame(() => {
      ignoreScrollRef.current = false;
    });
  }

  useLayoutEffect(() => {
    if (playing && !wasPlayingRef.current) followRef.current = true;
    wasPlayingRef.current = playing;
    if (!playing) {
      scrollToSystem(system, false);
      return;
    }
    const el = wrapRef.current;
    if (el && !followRef.current) {
      const playTop = system * systemHeight;
      const playBot = playTop + systemHeight;
      const viewTop = el.scrollTop;
      const viewBot = viewTop + el.clientHeight;
      if (playBot > viewTop - 12 && playTop < viewBot + 12) followRef.current = true;
    }
    if (followRef.current) scrollToSystem(system, true);
  }, [playing, system, systemHeight]);

  useLayoutEffect(() => {
    const node = cursorRef.current;
    if (!node) return;
    node.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  });

  function onScroll(e: UIEvent<HTMLDivElement>) {
    if (ignoreScrollRef.current) return;
    const el = e.currentTarget;
    const playTop = system * systemHeight;
    const playBot = playTop + systemHeight;
    const viewTop = el.scrollTop;
    const viewBot = viewTop + el.clientHeight;
    const near = playBot > viewTop - 12 && playTop < viewBot + 12;
    followRef.current = near;
  }

  return (
    <div
      className="system-score"
      ref={wrapRef}
      style={{ ["--system-h" as string]: `${systemHeight}px` }}
      onScroll={onScroll}
      onClick={(e) => {
        const el = wrapRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top + el.scrollTop;
        if (px < gutterWidth) return;
        const lineHit = Math.min(systemCount - 1, Math.max(0, Math.floor(py / systemHeight)));
        const barHit = Math.min(perLine - 1, Math.max(0, Math.floor((px - gutterWidth) / stretchedBar)));
        const bar = lineHit * perLine + barHit;
        if (bar >= 0 && bar < barCount) onSeekBar(bar);
      }}
    >
      <div className="system-score-inner" style={{ height: contentH, width: pageWidth }}>
        {Array.from({ length: systemCount }, (_, i) => {
          const start = i * perLine;
          const count = Math.max(0, Math.min(perLine, barCount - start));
          if (count <= 0) return null;
          return (
            <div key={start} className="system-row" style={{ height: systemHeight }}>
              {renderSystem(start, count, pageWidth)}
            </div>
          );
        })}
        <div
          ref={cursorRef}
          className="playhead-moving"
          style={{ height: systemHeight - 10, transform: `translate3d(${x}px, ${y}px, 0)` }}
        />
      </div>
    </div>
  );
}
