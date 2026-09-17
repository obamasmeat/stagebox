import type { ImportedScore, ImportedTrack, Song, TabTrack, TrackKind } from "../types";
import { defaultSections } from "./grid";
import { parseGuitarPro, looksLikeGuitarPro, looksLikeMidi } from "./guitarpro";
import {
  idFromFilename,
  kindFromHint,
  namesFromTuning,
  tuningForTrack,
} from "./mapNotes";
import { parseMidi } from "./midi";

export async function parseScoreFile(file: File): Promise<ImportedScore> {
  const buffer = await file.arrayBuffer();
  if (looksLikeMidi(file.name)) return parseMidi(buffer, file.name);
  if (looksLikeGuitarPro(file.name)) return parseGuitarPro(buffer, file.name);
  const head = new TextDecoder("ascii").decode(buffer.slice(0, 4));
  if (head === "MThd") return parseMidi(buffer, file.name);
  return parseGuitarPro(buffer, file.name);
}

export function songFromImport(score: ImportedScore): Song {
  const used = new Set<string>();
  const tracks = score.tracks.map((track) => toSongTrack(track, used));
  const barCount = tracks.reduce((m, t) => Math.max(m, t.measures.length), 1);
  return {
    id: idFromFilename(score.fileName),
    title: score.title,
    artist: score.artist,
    bpm: score.bpm,
    timeSig: score.timeSig,
    slotsPerBar: score.slotsPerBar,
    sections: score.sections.length ? score.sections : defaultSections(barCount),
    tracks,
    lyrics: score.lyrics,
    source: score.source,
    fileName: score.fileName,
  };
}

function uniqueName(name: string, used: Set<string>): string {
  const base = name.trim() || "Track";
  let next = base;
  let n = 2;
  while (used.has(next.toLowerCase())) {
    next = `${base} (${n})`;
    n += 1;
  }
  used.add(next.toLowerCase());
  return next;
}

function toSongTrack(track: ImportedTrack, used: Set<string>): TabTrack {
  const kind = kindFromHint(track.hint, track.isPercussion);
  const rows = Math.max(track.stringNames.length, track.measures[0]?.rows.length ?? 0, 1);
  const tuningMidi = tuningForTrack(kind, rows, track.tuningMidi);
  const stringNames =
    kind === "drums" ? track.stringNames : namesFromTuning(tuningMidi ?? []);
  return {
    id: `t${track.index}`,
    kind,
    name: uniqueName(track.name, used),
    stringNames: stringNames.length ? stringNames : track.stringNames,
    measures: track.measures.map((m) => ({ rows: m.rows.map((r) => [...r]) })),
    tuningMidi,
  };
}

export function normalizeSong(song: Song): Song {
  const list = coerceTracks(song.tracks);
  let changed = !Array.isArray(song.tracks) || list.some((t, i) => t !== (song.tracks as TabTrack[])[i]);
  const tracks = list.map((track) => {
    if (track.kind === "drums") return track;
    const rows = Math.max(track.stringNames.length, track.measures[0]?.rows.length ?? 0, 1);
    const tuningMidi = tuningForTrack(track.kind, rows, track.tuningMidi);
    const stringNames = namesFromTuning(tuningMidi ?? []);
    const sameTune =
      track.tuningMidi?.length === tuningMidi?.length &&
      track.tuningMidi?.every((v, i) => v === tuningMidi?.[i]);
    const sameNames = track.stringNames.length === stringNames.length && track.stringNames.every((n, i) => n === stringNames[i]);
    if (sameTune && sameNames) return track;
    changed = true;
    return { ...track, stringNames, tuningMidi };
  });
  return changed ? { ...song, tracks } : song;
}

function coerceTracks(raw: unknown): TabTrack[] {
  if (Array.isArray(raw)) return raw as TabTrack[];
  if (!raw || typeof raw !== "object") return [];
  return Object.entries(raw as Record<string, TabTrack>).map(([id, track]) => {
    const kind: TrackKind =
      track.kind ??
      (id === "drums" || track.name?.toLowerCase().includes("drum")
        ? "drums"
        : id === "bass" || track.name?.toLowerCase().includes("bass")
          ? "bass"
          : "guitar");
    return {
      id: track.id || id,
      kind,
      name: track.name || id,
      stringNames: track.stringNames,
      measures: track.measures,
      tuningMidi: track.tuningMidi,
    };
  });
}

export function defaultViewFor(song: Song, role: string, previous?: string): string {
  if (previous === "score" || previous === "vocals") return previous;
  const byId = previous && song.tracks.find((t) => t.id === previous || t.name === previous);
  if (byId) return byId.id;
  const lower = role.toLowerCase();
  if (lower.includes("vocal")) return "vocals";
  const want: TrackKind | null = lower.includes("drum") ? "drums" : lower.includes("bass") ? "bass" : "guitar";
  return song.tracks.find((t) => t.kind === want)?.id ?? song.tracks[0]?.id ?? "score";
}
