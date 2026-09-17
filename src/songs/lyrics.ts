import type { LyricSyllable } from "../types";

export interface LyricLine {
  bar: number;
  slot: number;
  syllables: LyricSyllable[];
}

export function beatLyricText(beat: Record<string, unknown> | null): string {
  if (!beat) return "";
  const lyrics = beat.lyrics;
  if (Array.isArray(lyrics)) {
    const joined = lyrics
      .map((part) => String(part ?? "").trim())
      .filter(Boolean)
      .join(" ");
    if (joined) return joined;
  }
  const text = typeof beat.text === "string" ? beat.text.trim() : "";
  return text;
}

export function mergeLyrics(parts: LyricSyllable[]): LyricSyllable[] {
  const seen = new Set<string>();
  const out: LyricSyllable[] = [];
  for (const part of [...parts].sort((a, b) => a.bar - b.bar || a.slot - b.slot)) {
    const text = part.text.replace(/\+/g, "").replace(/_/g, " ").trim();
    if (!text) continue;
    const key = `${part.bar}:${part.slot}:${text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ bar: part.bar, slot: part.slot, text });
  }
  return out;
}

export function lyricLines(syllables: LyricSyllable[]): LyricLine[] {
  const lines: LyricLine[] = [];
  let current: LyricSyllable[] = [];
  let startBar = 0;
  for (const syl of syllables) {
    const startsNew = current.length > 0 && (syl.bar - startBar >= 2 || syl.text.includes("\n"));
    if (startsNew) {
      lines.push({ bar: current[0].bar, slot: current[0].slot, syllables: current });
      current = [];
    }
    if (!current.length) startBar = syl.bar;
    current.push({ ...syl, text: syl.text.replace(/\n/g, " ").trim() });
  }
  if (current.length) lines.push({ bar: current[0].bar, slot: current[0].slot, syllables: current });
  return lines;
}

export function activeLineIndex(lines: LyricLine[], bar: number, slot: number): number {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.bar < bar || (line.bar === bar && line.slot <= slot)) idx = i;
    else break;
  }
  return idx;
}

export function activeSyllableIndex(line: LyricLine | undefined, bar: number, slot: number): number {
  if (!line) return -1;
  let idx = -1;
  for (let i = 0; i < line.syllables.length; i++) {
    const syl = line.syllables[i];
    if (syl.bar < bar || (syl.bar === bar && syl.slot <= slot)) idx = i;
    else break;
  }
  return idx;
}
