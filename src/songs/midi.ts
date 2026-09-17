import { Midi } from "@tonejs/midi";
import type { ImportedScore, ImportedTrack, LyricSyllable, TimeSig } from "../types";
import { defaultSections, slotsForTimeSig } from "./grid";
import { mergeLyrics } from "./lyrics";
import {
  drumRowForMidi,
  guitarHitsFromMidiNotes,
  hintFromTrack,
  placeOnGrid,
  stringNamesFor,
  tuningFor,
} from "./mapNotes";

function quartersToBarSlot(quarters: number, timeSig: TimeSig, slots: number) {
  const barLen = timeSig.numerator * (4 / timeSig.denominator);
  const bar = Math.floor(quarters / barLen + 1e-6);
  const pos = quarters - bar * barLen;
  const slot = Math.round((pos / barLen) * slots);
  if (slot >= slots) return { bar: bar + 1, slot: 0 };
  return { bar, slot: Math.max(0, slot) };
}

export async function parseMidi(buffer: ArrayBuffer, fileName: string): Promise<ImportedScore> {
  const midi = new Midi(buffer);
  const ppq = midi.header.ppq || 480;
  const timeSigArr = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4];
  const timeSig: TimeSig = {
    numerator: timeSigArr[0] ?? 4,
    denominator: timeSigArr[1] ?? 4,
  };
  const bpm = Math.round(midi.header.tempos[0]?.bpm ?? 120);
  const slots = slotsForTimeSig(timeSig);
  const title = midi.header.name?.trim() || fileName.replace(/\.[^.]+$/, "");

  const tracks: ImportedTrack[] = [];

  midi.tracks.forEach((track, index) => {
    if (!track.notes.length) return;
    const percussion = Boolean(track.instrument.percussion || track.channel === 9);
    const program = track.instrument.number ?? 0;
    const name = track.name?.trim() || (percussion ? "Drums" : `Track ${index + 1}`);
    const hint = hintFromTrack(name, program, percussion);
    const stringNames = stringNamesFor(hint, percussion, percussion ? 6 : hint === "bass" ? 4 : 6);
    const tuning = percussion ? undefined : tuningFor(hint, stringNames.length);
    const hits: { bar: number; slot: number; string: number; value: string }[] = [];
    let maxBar = 0;

    if (percussion || hint === "drums") {
      for (const note of track.notes) {
        const mapped = drumRowForMidi(note.midi);
        const q = note.ticks / ppq;
        const { bar, slot } = quartersToBarSlot(q, timeSig, slots);
        maxBar = Math.max(maxBar, bar);
        hits.push({ bar, slot, string: mapped.row, value: mapped.value });
      }
    } else {
      const midiNotes = track.notes.map((note) => {
        const q = note.ticks / ppq;
        const { bar, slot } = quartersToBarSlot(q, timeSig, slots);
        maxBar = Math.max(maxBar, bar);
        return { midi: note.midi, bar, slot };
      });
      hits.push(...guitarHitsFromMidiNotes(midiNotes, tuning ?? []));
    }

    tracks.push({
      index,
      name,
      hint: percussion ? "drums" : hint,
      stringNames,
      isPercussion: percussion,
      measures: placeOnGrid(stringNames.length, slots, maxBar + 1, hits),
      tuningMidi: tuning,
    });
  });

  if (!tracks.length) {
    throw new Error("No playable tracks found in that MIDI file.");
  }

  const barCount = tracks.reduce((m, t) => Math.max(m, t.measures.length), 1);
  const lyrics: LyricSyllable[] = [];
  for (const ev of midi.header.meta ?? []) {
    const kind = String(ev.type ?? "").toLowerCase();
    const text = String(ev.text ?? "").trim();
    if (!text) continue;
    const isLyric = kind === "lyric" || kind === "lyrics";
    const isWord =
      kind === "text" &&
      text.length <= 48 &&
      !/copyright|www\.|https?:|track\s*\d/i.test(text);
    if (!isLyric && !isWord) continue;
    const { bar, slot } = quartersToBarSlot(ev.ticks / ppq, timeSig, slots);
    lyrics.push({ bar, slot, text });
  }
  return {
    title: title || "Imported MIDI",
    artist: "MIDI import",
    bpm,
    timeSig,
    slotsPerBar: slots,
    sections: defaultSections(barCount),
    tracks,
    lyrics: mergeLyrics(lyrics),
    source: "midi",
    fileName,
  };
}
