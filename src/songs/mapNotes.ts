import type { TabMeasure, TrackKind } from "../types";
import {
  BASS_TUNING_MIDI,
  DRUM_STRINGS,
  GUITAR_STRINGS,
  GUITAR_TUNING_MIDI,
  emptyMeasure,
} from "./grid";

export function hintFromTrack(name: string, program: number, percussion: boolean): TrackKind | "ignore" {
  if (percussion) return "drums";
  const n = name.toLowerCase();
  if (/\b(drum|kit|perc)/.test(n)) return "drums";
  if (/\bbass\b|fretless|upright/.test(n) || (program >= 32 && program <= 39)) return "bass";
  if (/\b(lead|solo|melody|lick|rhythm|riff|guitar|gtr|acoustic)/.test(n)) return "guitar";
  if (program >= 24 && program <= 31) return "guitar";
  return "ignore";
}

export function kindFromHint(hint: TrackKind | "ignore", percussion: boolean): TrackKind {
  if (percussion || hint === "drums") return "drums";
  if (hint === "bass") return "bass";
  return "guitar";
}

const PITCH = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Tab rows run high → low (top line is the highest string). */
export function toHighToLow(tuning: number[]): number[] {
  if (tuning.length < 2) return [...tuning];
  return tuning[0] < tuning[tuning.length - 1] ? [...tuning].reverse() : [...tuning];
}

export function namesFromTuning(tuning: number[]): string[] {
  return tuning.map((midi) => {
    const n = PITCH[(((midi % 12) + 12) % 12)];
    if (n === "E" && midi >= 60) return "e";
    return n;
  });
}

export function fallbackTuning(kind: TrackKind, count: number): number[] {
  if (kind === "drums") return [];
  if (kind === "bass") {
    if (count >= 6) return [48, 43, 38, 33, 28, 23];
    if (count === 5) return [43, 38, 33, 28, 23];
    return [...BASS_TUNING_MIDI];
  }
  if (count === 7) return [64, 59, 55, 50, 45, 40, 35];
  if (count === 4) return [...BASS_TUNING_MIDI];
  return [...GUITAR_TUNING_MIDI];
}

export function tuningForTrack(
  kind: TrackKind,
  stringCount: number,
  raw?: number[],
): number[] | undefined {
  if (kind === "drums") return undefined;
  if (raw?.length) {
    const aligned = toHighToLow(raw);
    if (aligned.length === stringCount) return aligned;
    if (aligned.length > stringCount) return aligned.slice(0, stringCount);
    return [...aligned, ...fallbackTuning(kind, stringCount).slice(aligned.length)];
  }
  return fallbackTuning(kind, stringCount);
}

export function placeOnGrid(
  stringCount: number,
  slots: number,
  barCount: number,
  hits: { bar: number; slot: number; string: number; value: string }[],
): TabMeasure[] {
  const measures = Array.from({ length: Math.max(1, barCount) }, () => emptyMeasure(stringCount, slots));
  for (const hit of hits) {
    if (hit.bar < 0 || hit.string < 0 || hit.string >= stringCount) continue;
    while (hit.bar >= measures.length) {
      measures.push(emptyMeasure(stringCount, slots));
    }
    const row = measures[hit.bar].rows[hit.string];
    const slot = Math.max(0, Math.min(slots - 1, hit.slot));
    if (row[slot] === "-" || hit.value !== "-") row[slot] = hit.value;
  }
  return measures;
}

export function assignFrettedNote(
  midi: number,
  tuning: number[],
  used: Set<number>,
  lastFret: number,
): { string: number; fret: number } | null {
  const candidates: { string: number; fret: number; score: number }[] = [];
  for (let s = 0; s < tuning.length; s++) {
    if (used.has(s)) continue;
    const fret = midi - tuning[s];
    if (fret < 0 || fret > 24) continue;
    const stretch = Math.abs(fret - lastFret);
    const highFretPenalty = fret > 14 ? 6 : fret > 12 ? 2 : 0;
    const openBonus = fret === 0 ? -0.4 : 0;
    candidates.push({
      string: s,
      fret,
      score: stretch + highFretPenalty + (tuning.length - 1 - s) * 0.45 + openBonus,
    });
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0] ?? null;
}

export function guitarHitsFromMidiNotes(
  notes: { midi: number; bar: number; slot: number }[],
  tuning: number[],
): { bar: number; slot: number; string: number; value: string }[] {
  const grouped = new Map<string, { midi: number; bar: number; slot: number }[]>();
  for (const note of notes) {
    const key = `${note.bar}:${note.slot}`;
    const list = grouped.get(key) ?? [];
    list.push(note);
    grouped.set(key, list);
  }
  const hits: { bar: number; slot: number; string: number; value: string }[] = [];
  let lastFret = 5;
  const keys = [...grouped.keys()].sort((a, b) => {
    const [ab, as] = a.split(":").map(Number);
    const [bb, bs] = b.split(":").map(Number);
    return ab - bb || as - bs;
  });
  for (const key of keys) {
    const chord = grouped.get(key)!;
    chord.sort((a, b) => a.midi - b.midi);
    const used = new Set<number>();
    for (const note of chord) {
      const placed = assignFrettedNote(note.midi, tuning, used, lastFret);
      if (!placed) continue;
      used.add(placed.string);
      lastFret = placed.fret;
      hits.push({
        bar: note.bar,
        slot: note.slot,
        string: placed.string,
        value: String(placed.fret),
      });
    }
  }
  return hits;
}

export function drumRowForMidi(note: number): { row: number; value: string } {
  const n = Math.round(Math.abs(note));
  if (n === 35 || n === 36 || n === 87) return { row: 5, value: "o" };
  if (n === 38 || n === 40 || n === 91 || n === 34) return { row: 2, value: "o" };
  if (n === 37 || n === 31 || n === 33 || n === 39) return { row: 2, value: "x" };
  if (n === 42 || n === 44) return { row: 1, value: "x" };
  if (n === 46 || n === 92) return { row: 1, value: "O" };
  if (n === 49 || n === 57 || n === 55 || n === 52 || n === 97 || n === 98 || n === 96 || n === 95) {
    return { row: 0, value: "x" };
  }
  if (n === 51 || n === 59 || n === 53 || n === 29 || n === 30 || n === 93 || n === 94) {
    return { row: 0, value: "x" };
  }
  if (n === 48 || n === 50 || n === 47) return { row: 3, value: "o" };
  if (n === 41 || n === 43 || n === 45) return { row: 4, value: "o" };
  if (n <= 36) return { row: 5, value: "o" };
  if (n <= 40) return { row: 2, value: "o" };
  if (n <= 46) return { row: 1, value: "x" };
  if (n <= 51) return { row: 4, value: "o" };
  return { row: 0, value: "x" };
}

function asRec(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function percussionMidiFromNote(note: unknown, track: unknown): number {
  const n = asRec(note);
  const t = asRec(track);
  if (!n) return 38;
  const idx = Number(n.percussionArticulation);
  const arts = t?.percussionArticulations;
  if (Array.isArray(arts) && Number.isFinite(idx) && idx >= 0 && idx < arts.length) {
    const midi = Number(asRec(arts[idx])?.outputMidiNumber);
    if (midi >= 27) return midi;
  }
  const real = Number(n.realValue);
  if (real >= 27 && real <= 127) return real;
  if (idx >= 27 && idx <= 127) return idx;
  const element = Number(n.element);
  if (element === 0) return 36;
  if (element === 1) return 38;
  if (element === 2) return 42;
  if (Number.isFinite(idx) && idx > 0) return idx;
  return 38;
}

export function stringNamesFor(hint: TrackKind | "ignore", isPercussion: boolean, count: number): string[] {
  if (isPercussion || hint === "drums") return DRUM_STRINGS;
  if (hint === "bass" || count === 4) return namesFromTuning(fallbackTuning(hint === "bass" ? "bass" : "guitar", count));
  return GUITAR_STRINGS.slice(0, Math.max(1, count));
}

/** AlphaTab/Guitar Pro: 1 = lowest (thickest) string, bottom tab line. Our rows: 0 = highest (top). */
export function lowestStringToTabRow(stringIndex: number, stringCount: number, oneBased = true): number {
  const fromLowest = oneBased ? stringIndex : stringIndex + 1;
  return Math.max(0, Math.min(stringCount - 1, stringCount - fromLowest));
}

export function stringNamesFromTuning(tuning: number[], hint: TrackKind | "ignore"): string[] {
  const aligned = toHighToLow(tuning);
  if (!aligned.length) return stringNamesFor(hint, false, hint === "bass" ? 4 : 6);
  return namesFromTuning(aligned);
}

export function tuningFor(hint: TrackKind | "ignore", count: number): number[] {
  const kind = hint === "ignore" ? (count === 4 ? "bass" : "guitar") : hint;
  return fallbackTuning(kind, count);
}

export function idFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").toLowerCase();
  const slug = base.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "import";
  return `${slug}-${Date.now().toString(36)}`;
}
