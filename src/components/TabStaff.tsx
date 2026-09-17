import { memo } from "react";
import type { Playhead, TabTrack, TrackKind } from "../types";
import { bendAmountLabel, parseTabNote, tabDisplay } from "../songs/tabNote";
import { SystemScore } from "./SystemScore";

const ROW_H = 18;
const GUTTER = 28;
const BAR_W = 168;
const STAFF_TOP = 36;
const colors: Record<TrackKind, string> = {
  guitar: "var(--lead)",
  bass: "var(--bass)",
  drums: "var(--drums)",
};

function BendMark({ x, y, quarters }: { x: number; y: number; quarters: number }) {
  const label = bendAmountLabel(quarters);
  const tipX = x + 13;
  const tipY = y - 11;
  return (
    <g className="tab-bend">
      <path d={`M ${x + 3} ${y - 7} Q ${x + 9} ${y - 18}, ${tipX} ${tipY}`} />
      <polygon points={`${tipX},${tipY} ${tipX - 4},${tipY - 1.5} ${tipX - 0.5},${tipY + 4.5}`} />
      {label ? (
        <text x={x + 16} y={y - 13} className="tab-bend-label">
          {label}
        </text>
      ) : null}
    </g>
  );
}

const System = memo(function System({
  track,
  startBar,
  count,
  width,
  beatsPerBar,
}: {
  track: TabTrack;
  startBar: number;
  count: number;
  width: number;
  beatsPerBar: number;
}) {
  const slots = track.measures[0]?.rows[0]?.length ?? 16;
  const slotsPerBeat = slots / Math.max(1, beatsPerBar);
  const rows = track.stringNames.length;
  const height = STAFF_TOP + rows * ROW_H + 14;
  const innerW = width - GUTTER;
  const barW = count > 0 ? innerW / count : BAR_W;

  return (
    <svg width={width} height={height} className="tab-system">
      {track.stringNames.map((name, row) => {
        const y = STAFF_TOP + row * ROW_H + ROW_H / 2;
        return (
          <g key={name}>
            <text x={GUTTER - 6} y={y + 4} className="tab-string" textAnchor="end">
              {name}
            </text>
            <line x1={GUTTER} y1={y} x2={width} y2={y} className="tab-wire" />
          </g>
        );
      })}
      {Array.from({ length: count }, (_, i) => {
        const bar = startBar + i;
        const measure = track.measures[bar];
        const x0 = GUTTER + i * barW;
        if (!measure) return null;
        const items = [
          <line
            key={`bl${bar}`}
            x1={x0}
            y1={STAFF_TOP}
            x2={x0}
            y2={STAFF_TOP + rows * ROW_H}
            className="bar-line"
          />,
          <text key={`nm${bar}`} x={x0 + 3} y={14} className="bar-num">
            {bar + 1}
          </text>,
        ];
        for (let slot = 0; slot < slots; slot++) {
          const x = x0 + ((slot + 0.4) / slots) * barW;
          for (let row = 0; row < rows; row++) {
            const cell = measure.rows[row]?.[slot] ?? "-";
            if (!cell || cell === "-") continue;
            const parsed = parseTabNote(cell);
            if (parsed.kind === "rest") continue;
            const y = STAFF_TOP + row * ROW_H + ROW_H / 2;
            const label = tabDisplay(cell);
            const maskW = Math.max(16, label.length * 8 + 6);
            items.push(
              <g key={`${bar}-${row}-${slot}`}>
                <rect x={x - maskW / 2} y={y - 7} width={maskW} height="13" className="tab-mask" />
                <text x={x} y={y + 4} className="tab-fret" textAnchor="middle">
                  {label}
                </text>
                {parsed.kind === "fret" && parsed.bend ? (
                  <BendMark x={x} y={y} quarters={parsed.bend.quarters} />
                ) : null}
              </g>,
            );
          }
        }
        const beamY = STAFF_TOP + rows * ROW_H + 6;
        for (let beat = 0; beat < beatsPerBar; beat++) {
          const xs: number[] = [];
          for (let s = 0; s < slotsPerBeat; s++) {
            const slot = Math.round(beat * slotsPerBeat + s);
            const has = measure.rows.some((row) => row[slot] && row[slot] !== "-");
            if (has) xs.push(x0 + ((slot + 0.4) / slots) * barW);
          }
          if (xs.length > 1) {
            items.push(
              <line key={`rb${bar}-${beat}`} x1={xs[0]} y1={beamY} x2={xs[xs.length - 1]} y2={beamY} className="tab-beam" />,
            );
            for (const x of xs) {
              items.push(<line key={`rs${bar}-${x}`} x1={x} y1={beamY - 5} x2={x} y2={beamY} className="tab-beam" />);
            }
          } else if (xs.length === 1) {
            items.push(<line key={`rs${bar}-${beat}`} x1={xs[0]} y1={beamY - 5} x2={xs[0]} y2={beamY} className="tab-beam" />);
          }
        }
        return <g key={bar}>{items}</g>;
      })}
    </svg>
  );
});

export function TabStaff({
  track,
  playhead,
  beatsPerBar,
  onSelectBar,
}: {
  track: TabTrack;
  playhead: Playhead;
  beatsPerBar: number;
  onSelectBar: (bar: number) => void;
}) {
  const rows = track.stringNames.length;
  const height = STAFF_TOP + rows * ROW_H + 14;
  return (
    <div className="staff" style={{ ["--accent" as string]: colors[track.kind] }}>
      <div className="staff-head">
        <b>{track.name}</b>
        <span className="meta">
          {track.stringNames.join(" ")}
          {track.tuningMidi?.length ? ` · ${track.stringNames.length}-string` : ""}
        </span>
      </div>
      <SystemScore
        barCount={track.measures.length}
        slotsPerBar={track.measures[0]?.rows[0]?.length ?? 16}
        barWidth={BAR_W}
        systemHeight={height}
        gutterWidth={GUTTER}
        playhead={playhead}
        onSeekBar={onSelectBar}
        renderSystem={(start, count, width) => (
          <System track={track} startBar={start} count={count} width={width} beatsPerBar={beatsPerBar} />
        )}
      />
    </div>
  );
}
