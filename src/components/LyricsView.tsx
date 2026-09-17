import { useLayoutEffect, useMemo, useRef } from "react";
import type { Playhead, Song } from "../types";
import { activeLineIndex, activeSyllableIndex, lyricLines } from "../songs/lyrics";

export function LyricsView({
  song,
  playhead,
  onSelectBar,
}: {
  song: Song;
  playhead: Playhead;
  onSelectBar?: (bar: number) => void;
}) {
  const lines = useMemo(() => lyricLines(song.lyrics ?? []), [song.lyrics]);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const followRef = useRef(true);
  const ignoreScrollRef = useRef(false);
  const bar = playhead.bar;
  const slot = playhead.phase === "song" ? playhead.slot : 0;
  const current = activeLineIndex(lines, bar, slot);
  const word = activeSyllableIndex(current >= 0 ? lines[current] : lines[0], bar, slot);

  useLayoutEffect(() => {
    if (playhead.phase === "countin" || playhead.phase === "waiting") followRef.current = true;
    if (!followRef.current || current < 0) return;
    const el = boardRef.current;
    const node = el?.querySelector(`[data-line="${current}"]`);
    if (!el || !(node instanceof HTMLElement)) return;
    const top = node.offsetTop - el.clientHeight / 3;
    ignoreScrollRef.current = true;
    el.scrollTop = Math.max(0, top);
    requestAnimationFrame(() => {
      ignoreScrollRef.current = false;
    });
  }, [current, playhead.phase]);

  if (!lines.length) {
    return (
      <div className="staff lyrics-staff">
        <div className="staff-head">
          <b>Vocals</b>
          <span className="meta">No lyrics</span>
        </div>
        <p className="lyrics-empty">This file has no lyrics.</p>
      </div>
    );
  }

  return (
    <div className="staff lyrics-staff">
      <div className="staff-head">
        <b>Vocals</b>
        <span className="meta">{playhead.sectionName || "Lyrics"}</span>
      </div>
      <div
        className="lyrics-board"
        ref={boardRef}
        onScroll={() => {
          if (!ignoreScrollRef.current) followRef.current = false;
        }}
      >
        {lines.map((line, i) => (
          <p
            key={`${line.bar}-${line.slot}-${i}`}
            data-line={i}
            className={
              i === current ? "lyrics-now" : i === current - 1 ? "lyrics-prev" : i > current ? "lyrics-next" : "lyrics-prev"
            }
            onClick={() => onSelectBar?.(line.bar)}
          >
            {line.syllables.map((syl, si) => (
              <span
                key={`${syl.bar}-${syl.slot}-${si}`}
                className={
                  i === current && si === word ? "lyric-word on" : i === current && si < word ? "lyric-word done" : "lyric-word"
                }
              >
                {si > 0 && !line.syllables[si - 1].text.endsWith("-") ? " " : ""}
                {syl.text}
              </span>
            ))}
          </p>
        ))}
      </div>
    </div>
  );
}
