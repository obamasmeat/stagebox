import type { ImportedTrack, Song, SongSection, TabMeasure, TimeSig } from "../types";

export function slotsForTimeSig(timeSig: TimeSig): number {
  const slots = (timeSig.numerator * 16) / timeSig.denominator;
  return Math.max(4, Math.round(slots));
}

export function emptyRow(slots: number): string[] {
  return Array.from({ length: slots }, () => "-");
}

export function emptyMeasure(stringCount: number, slots: number): TabMeasure {
  return { rows: Array.from({ length: stringCount }, () => emptyRow(slots)) };
}

export function cellsFromAscii(pattern: string, slots = 16): string[] {
  const body = pattern.replace(/\|/g, "");
  const out = emptyRow(slots);
  for (let i = 0; i < Math.min(slots, body.length); i++) {
    out[i] = body[i] === " " ? "-" : body[i];
  }
  return out;
}

export function guitarMeasure(
  e: string,
  B: string,
  G: string,
  D: string,
  A: string,
  E: string,
  slots = 16,
): TabMeasure {
  return {
    rows: [
      cellsFromAscii(e, slots),
      cellsFromAscii(B, slots),
      cellsFromAscii(G, slots),
      cellsFromAscii(D, slots),
      cellsFromAscii(A, slots),
      cellsFromAscii(E, slots),
    ],
  };
}

export function bassMeasure(G: string, D: string, A: string, E: string, slots = 16): TabMeasure {
  return {
    rows: [
      cellsFromAscii(G, slots),
      cellsFromAscii(D, slots),
      cellsFromAscii(A, slots),
      cellsFromAscii(E, slots),
    ],
  };
}

export function drumMeasure(
  cc: string,
  hh: string,
  sn: string,
  t1: string,
  t2: string,
  kd: string,
  slots = 16,
): TabMeasure {
  return {
    rows: [
      cellsFromAscii(cc, slots),
      cellsFromAscii(hh, slots),
      cellsFromAscii(sn, slots),
      cellsFromAscii(t1, slots),
      cellsFromAscii(t2, slots),
      cellsFromAscii(kd, slots),
    ],
  };
}

export function repeatMeasure(measure: TabMeasure, times: number): TabMeasure[] {
  return Array.from({ length: times }, () => ({
    rows: measure.rows.map((row) => [...row]),
  }));
}

export function concatMeasures(...groups: TabMeasure[][]): TabMeasure[] {
  return groups.flat();
}

export function defaultSections(barCount: number): SongSection[] {
  if (barCount <= 4) return [{ name: "Song", startBar: 0, bars: barCount }];
  if (barCount <= 8) {
    return [
      { name: "Intro", startBar: 0, bars: 4 },
      { name: "Verse", startBar: 4, bars: barCount - 4 },
    ];
  }
  const intro = Math.min(4, Math.floor(barCount / 4));
  const verse = Math.min(8, barCount - intro);
  const rest = barCount - intro - verse;
  const sections: SongSection[] = [
    { name: "Intro", startBar: 0, bars: intro },
    { name: "Verse", startBar: intro, bars: verse },
  ];
  if (rest > 0) sections.push({ name: "Chorus", startBar: intro + verse, bars: rest });
  return sections;
}

export function sectionAt(song: Song, bar: number): string {
  const hit = [...song.sections].reverse().find((s) => bar >= s.startBar);
  return hit?.name ?? "Song";
}

export const GUITAR_STRINGS = ["e", "B", "G", "D", "A", "E"];
export const BASS_STRINGS = ["G", "D", "A", "E"];
export const DRUM_STRINGS = ["CC", "HH", "SN", "T1", "T2", "KD"];

export const GUITAR_TUNING_MIDI = [64, 59, 55, 50, 45, 40];
export const BASS_TUNING_MIDI = [43, 38, 33, 28];

export function maxBars(tracks: ImportedTrack[]): number {
  return tracks.reduce((m, t) => Math.max(m, t.measures.length), 0);
}

export function padTrack(track: ImportedTrack, bars: number, slots: number): ImportedTrack {
  const measures = [...track.measures];
  while (measures.length < bars) {
    measures.push(emptyMeasure(track.stringNames.length, slots));
  }
  return { ...track, measures };
}
