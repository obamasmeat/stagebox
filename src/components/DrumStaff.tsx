import { memo, type ReactNode } from "react";
import type { Playhead, TabTrack } from "../types";
import { SystemScore } from "./SystemScore";

const LINE_GAP = 15;
const STAFF_TOP = 36;
const LINES = 5;
const STEM_LEN = 28;
const STEM_LEFT = 6.5;
const BEAM_GAP = 6;
const GUTTER = 40;
const BAR_W = 176;

function staffY(step: number) {
  return STAFF_TOP + step * LINE_GAP;
}

const STAFF_BOTTOM = staffY(LINES - 1);
const BEAM_Y = STAFF_BOTTOM + STEM_LEN;
const HEIGHT = BEAM_Y + 14;

const ROW_Y = [staffY(-1.1), staffY(-0.5), staffY(1.5), staffY(0.5), staffY(3), staffY(3.5)];

type HeadKind = "x" | "open" | "drum" | "ghost" | "snare";

function kindOf(row: number, cell: string): HeadKind {
  if (row === 2) return "snare";
  if (row === 1 && (cell === "O" || cell === "o")) return "open";
  if (row <= 1) return "x";
  if (cell === "x" || cell === "X") return "ghost";
  return "drum";
}

type Column = { slot: number; stemX: number; rows: { row: number; cell: string }[] };

function columnsInBeat(
  measure: { rows: string[][] },
  beat: number,
  slots: number,
  slotsPerBeat: number,
  x0: number,
  barW: number,
): Column[] {
  const start = Math.round(beat * slotsPerBeat);
  const end = Math.min(slots, Math.round((beat + 1) * slotsPerBeat));
  const cols: Column[] = [];
  for (let slot = start; slot < end; slot++) {
    const rows: { row: number; cell: string }[] = [];
    for (let row = 0; row < 6; row++) {
      const cell = measure.rows[row]?.[slot] ?? "-";
      if (!cell || cell === "-") continue;
      rows.push({ row, cell });
    }
    if (!rows.length) continue;
    const cx = x0 + ((slot + 0.46) / slots) * barW;
    cols.push({ slot, stemX: cx - STEM_LEFT, rows });
  }
  return cols;
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
  const innerW = width - GUTTER;
  const barW = count > 0 ? innerW / count : BAR_W;

  return (
    <svg width={width} height={HEIGHT} className="drum-system">
      {Array.from({ length: LINES }, (_, i) => (
        <line key={i} x1={GUTTER - 8} y1={staffY(i)} x2={width} y2={staffY(i)} className="staff-line" />
      ))}
      <g className="perc-clef" transform={`translate(14, ${STAFF_TOP})`}>
        <rect x="0" y="0" width="5" height={STAFF_BOTTOM - STAFF_TOP} rx="0.5" />
        <rect x="9" y="0" width="2.2" height={STAFF_BOTTOM - STAFF_TOP} />
      </g>
      {Array.from({ length: count }, (_, i) => {
        const bar = startBar + i;
        const measure = track.measures[bar];
        const x0 = GUTTER + i * barW;
        if (!measure) return null;
        const nodes: ReactNode[] = [
          <line key={`b${bar}`} x1={x0} y1={STAFF_TOP} x2={x0} y2={STAFF_BOTTOM} className="bar-line" />,
          <text key={`n${bar}`} x={x0 + 5} y={22} className="drum-bar-num">
            {bar + 1}
          </text>,
        ];
        if (i === count - 1) {
          nodes.push(
            <line
              key={`be${bar}`}
              x1={x0 + barW}
              y1={STAFF_TOP}
              x2={x0 + barW}
              y2={STAFF_BOTTOM}
              className="bar-line"
            />,
          );
        }

        for (let beat = 0; beat < beatsPerBar; beat++) {
          const cols = columnsInBeat(measure, beat, slots, slotsPerBeat, x0, barW);
          if (!cols.length) continue;
          const beamY = BEAM_Y;
          const beam16 = beamY - BEAM_GAP;

          if (cols.length >= 2) {
            nodes.push(
              <line
                key={`bm-${bar}-${beat}`}
                x1={cols[0].stemX}
                y1={beamY}
                x2={cols[cols.length - 1].stemX}
                y2={beamY}
                className="beam"
              />,
            );
            if (cols.length >= 3) {
              nodes.push(
                <line
                  key={`bm16-${bar}-${beat}`}
                  x1={cols[0].stemX}
                  y1={beam16}
                  x2={cols[cols.length - 1].stemX}
                  y2={beam16}
                  className="beam beam-16"
                />,
              );
            }
          }

          for (const col of cols) {
            const top = Math.min(...col.rows.map((r) => ROW_Y[r.row]));
            const tip = cols.length >= 2 ? beamY : top + (STAFF_BOTTOM + STEM_LEN - top);
            nodes.push(
              <line
                key={`st-${bar}-${col.slot}`}
                x1={col.stemX}
                y1={top}
                x2={col.stemX}
                y2={tip}
                className="stem"
              />,
            );
            if (cols.length === 1) {
              nodes.push(
                <path
                  key={`fl-${bar}-${col.slot}`}
                  d={`M ${col.stemX} ${tip} c 12 -3, 14 -10, 10 -16`}
                  className="flag"
                />,
              );
            }
            for (const n of col.rows) {
              nodes.push(
                <Head
                  key={`h-${bar}-${col.slot}-${n.row}`}
                  kind={kindOf(n.row, n.cell)}
                  x={col.stemX + STEM_LEFT}
                  y={ROW_Y[n.row]}
                />,
              );
            }
          }
        }

        return <g key={bar}>{nodes}</g>;
      })}
    </svg>
  );
});

function Head({ kind, x, y }: { kind: HeadKind; x: number; y: number; clipId?: string }) {
  if (kind === "snare") {
    const id = `s${Math.round(x * 10)}-${Math.round(y * 10)}`;
    return (
      <g transform={`translate(${x},${y})`} className="drum-snare">
        <clipPath id={id}>
          <circle cx="0" cy="0" r="8" />
        </clipPath>
        <image
          href="/snare-face.png"
          x="-8"
          y="-9.5"
          width="16"
          height="20"
          preserveAspectRatio="xMidYMin slice"
          clipPath={`url(#${id})`}
        />
        <circle r="8" className="drum-snare-ring" />
      </g>
    );
  }
  if (kind === "x" || kind === "open") {
    return (
      <g transform={`translate(${x},${y})`} className="drum-x">
        {kind === "open" ? <circle r="7.2" /> : null}
        <path d="M-5.2-5.2 L5.2 5.2 M5.2-5.2 L-5.2 5.2" />
      </g>
    );
  }
  if (kind === "ghost") {
    return <ellipse cx={x} cy={y} rx="5.2" ry="3.7" className="drum-ghost" transform={`rotate(-20 ${x} ${y})`} />;
  }
  return <ellipse cx={x} cy={y} rx="6.6" ry="4.7" className="drum-head" transform={`rotate(-20 ${x} ${y})`} />;
}

export function DrumStaff({
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
  return (
    <div className="staff drum-staff">
      <div className="staff-head">
        <b>{track.name}</b>
        <span className="meta">x hats / cymbals · ● snare / toms / kick</span>
      </div>
      <SystemScore
        barCount={track.measures.length}
        slotsPerBar={track.measures[0]?.rows[0]?.length ?? 16}
        barWidth={BAR_W}
        systemHeight={HEIGHT}
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
