import { unzipSync } from "fflate";
import type { ImportedScore, ImportedTrack, LyricSyllable, SongSection, TimeSig } from "../types";
import { defaultSections, slotsForTimeSig } from "./grid";
import { beatLyricText, mergeLyrics } from "./lyrics";
import { drumRowForMidi, hintFromTrack, kindFromHint, lowestStringToTabRow, percussionMidiFromNote, placeOnGrid, stringNamesFromTuning, stringNamesFor, toHighToLow } from "./mapNotes";
import {
  alphatabBend,
  encodeDead,
  encodeFret,
  gpifFloatToQuarters,
  inferBendType,
} from "./tabNote";

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

function durationToSlots(durationName: string, dots: number, slotsPerBar: number, barBeats: number): number {
  const names: Record<string, number> = {
    QuadrupleWhole: 16,
    DoubleWhole: 8,
    Whole: 4,
    Half: 2,
    Quarter: 1,
    Eighth: 0.5,
    Sixteenth: 0.25,
    ThirtySecond: 0.125,
    SixtyFourth: 0.0625,
    "16th": 0.25,
    "32nd": 0.125,
    "8th": 0.5,
  };
  let beats = names[durationName] ?? 1;
  if (dots === 1) beats *= 1.5;
  if (dots >= 2) beats *= 1.75;
  const slots = (beats / barBeats) * slotsPerBar;
  return Math.max(1, Math.round(slots));
}

function alphaDurationToSlots(duration: number, dots: number, slotsPerBar: number, barBeats: number): number {
  const unit = duration < 0 ? 4 * Math.abs(duration) : 4 / Math.max(1, duration);
  const beats = unit * (dots === 1 ? 1.5 : dots >= 2 ? 1.75 : 1);
  return Math.max(1, Math.round((beats / Math.max(1, barBeats)) * slotsPerBar));
}

type RawNote = { string: number; fret: number; midi?: number; percussion?: boolean; cell: string };

function gpifPropertyEnabled(xml: string, name: string): boolean {
  const prop = new RegExp(`<Property name="${name}"[^>]*>[\\s\\S]*?<Enable(?:\\s*/>|>)`, "i");
  const direct = new RegExp(`<${name}>\\s*<Enable(?:\\s*/>|>)`, "i");
  return prop.test(xml) || direct.test(xml);
}

function gpifNamedFloat(xml: string, name: string): number | undefined {
  const prop = xml.match(new RegExp(`<Property name="${name}"[^>]*>[\\s\\S]*?<Float>([^<]+)</Float>`, "i"));
  if (prop) return Number(prop[1]);
  const direct = xml.match(new RegExp(`<${name}>[\\s\\S]*?<Float>([^<]+)</Float>`, "i"));
  if (direct) return Number(direct[1]);
  return undefined;
}

function gpifTabCell(noteXml: string, fret: number): string {
  if (gpifPropertyEnabled(noteXml, "Muted")) return encodeDead(fret);
  const bended =
    gpifPropertyEnabled(noteXml, "Bended") || /<Bended\s*\/>/i.test(noteXml) || /name="Bended"/i.test(noteXml);
  if (!bended) return encodeFret(fret);
  const origin = gpifFloatToQuarters(gpifNamedFloat(noteXml, "BendOriginValue") ?? 0);
  const dest = gpifFloatToQuarters(gpifNamedFloat(noteXml, "BendDestinationValue") ?? 0);
  const middleRaw = gpifNamedFloat(noteXml, "BendMiddleValue");
  const middle = middleRaw == null ? null : gpifFloatToQuarters(middleRaw);
  const type = inferBendType(origin, dest, middle);
  const quarters = Math.max(origin, dest, middle ?? 0);
  if (!type || quarters <= 0) return encodeFret(fret);
  return encodeFret(fret, { type, quarters });
}

function alphatabTabCell(note: Record<string, unknown>): string {
  const fret = Number(note.fret ?? 0);
  if (note.isDead) return encodeDead(fret);
  const bendType = Number(note.bendType ?? 0);
  const points = Array.isArray(note.bendPoints) ? note.bendPoints : [];
  const vals = points.map((p) => Number(asRecord(p)?.value ?? 0));
  const origin = vals[0] ?? 0;
  const dest = vals.length ? vals[vals.length - 1] : 0;
  const middle = vals.length > 2 ? Math.max(...vals.slice(1, -1)) : vals.length === 1 ? origin : null;
  const maxPoint = asRecord(note.maxBendPoint);
  const maxValue = Number(maxPoint?.value ?? (vals.length ? Math.max(...vals) : 0));
  const hasBend = Boolean(note.hasBend) || bendType > 0 || maxValue > 0;
  if (!hasBend || bendType === 5) return encodeFret(fret);
  const bend = alphatabBend(bendType, origin, dest, maxValue, middle);
  return encodeFret(fret, bend);
}

function gpifRhythmMap(xml: string): Map<string, { value: string; dots: number }> {
  const map = new Map<string, { value: string; dots: number }>();
  const rhythmRe = /<Rhythm id="(\d+)"[^>]*>([\s\S]*?)<\/Rhythm>/g;
  let match: RegExpExecArray | null;
  while ((match = rhythmRe.exec(xml))) {
    const value = match[2].match(/<NoteValue>([^<]+)<\/NoteValue>/)?.[1] ?? "Quarter";
    const dots = match[2].match(/<PrimaryDots>(\d+)<\/PrimaryDots>/)
      ? Number(match[2].match(/<PrimaryDots>(\d+)<\/PrimaryDots>/)![1])
      : match[2].includes("<Dot/>") || match[2].includes("<Dots>1")
        ? 1
        : 0;
    map.set(match[1], { value, dots });
  }
  return map;
}

function parseGpif(xml: string, fileName: string): ImportedScore {
  const title =
    xml.match(/<Title>([^<]+)<\/Title>/)?.[1]?.trim() ||
    fileName.replace(/\.[^.]+$/, "");
  const artist = xml.match(/<Artist>([^<]+)<\/Artist>/)?.[1]?.trim() || "Guitar Pro import";
  const tempo = Number(xml.match(/<Tempo>(\d+)<\/Tempo>/)?.[1] ?? xml.match(/<Automat[^>]*value="(\d+)"/)?.[1] ?? 120);
  const timeMatch = xml.match(/<Time>(\d+)\/(\d+)<\/Time>/);
  const timeSig: TimeSig = {
    numerator: Number(timeMatch?.[1] ?? 4),
    denominator: Number(timeMatch?.[2] ?? 4),
  };
  const slots = slotsForTimeSig(timeSig);
  const barBeats = timeSig.numerator;
  const rhythms = gpifRhythmMap(xml);

  const masterBars: { section?: string }[] = [];
  const mbRe = /<MasterBar>([\s\S]*?)<\/MasterBar>/g;
  let mb: RegExpExecArray | null;
  while ((mb = mbRe.exec(xml))) {
    const section =
      mb[1].match(/<Text>([^<]+)<\/Text>/)?.[1] ||
      mb[1].match(/<Letter>([^<]+)<\/Letter>/)?.[1];
    masterBars.push({ section: section || undefined });
  }

  const noteMap = new Map<string, RawNote>();
  const noteRe = /<Note id="(\d+)"[^>]*>([\s\S]*?)<\/Note>/g;
  let nm: RegExpExecArray | null;
  while ((nm = noteRe.exec(xml))) {
    const string = Number(nm[2].match(/<String>(\d+)<\/String>/)?.[1] ?? 0);
    const fret = Number(nm[2].match(/<Fret>(\d+)<\/Fret>/)?.[1] ?? 0);
    const midi = nm[2].match(/<Midi>(\d+)<\/Midi>/);
    noteMap.set(nm[1], {
      string,
      fret,
      midi: midi ? Number(midi[1]) : undefined,
      percussion: /<InstrumentId>.*[Dd]rum/.test(nm[2]) || nm[2].includes("Drum"),
      cell: gpifTabCell(nm[2], fret),
    });
  }

  const beatMap = new Map<string, { noteIds: string[]; rhythm: string; text: string }>();
  const beatRe = /<Beat id="(\d+)"[^>]*>([\s\S]*?)<\/Beat>/g;
  let bm: RegExpExecArray | null;
  while ((bm = beatRe.exec(xml))) {
    const notesBlock = bm[2].match(/<Notes>([\d\s]+)<\/Notes>/)?.[1] ?? "";
    const rhythm = bm[2].match(/<Rhythm ref="(\d+)"/)?.[1] ?? "0";
    const text =
      bm[2].match(/<Lyrics>[\s\S]*?<Text>([^<]*)<\/Text>/)?.[1] ??
      bm[2].match(/<FreeText>([^<]+)<\/FreeText>/)?.[1] ??
      "";
    beatMap.set(bm[1], {
      noteIds: notesBlock.trim() ? notesBlock.trim().split(/\s+/) : [],
      rhythm,
      text: text.trim(),
    });
  }

  const voiceMap = new Map<string, string[]>();
  const voiceRe = /<Voice id="(\d+)"[^>]*>([\s\S]*?)<\/Voice>/g;
  let vm: RegExpExecArray | null;
  while ((vm = voiceRe.exec(xml))) {
    const beats = vm[2].match(/<Beats>([\d\s]+)<\/Beats>/)?.[1] ?? "";
    voiceMap.set(vm[1], beats.trim() ? beats.trim().split(/\s+/) : []);
  }

  const barList: { voiceIds: string[] }[] = [];
  const barRe = /<Bar id="(\d+)"[^>]*>([\s\S]*?)<\/Bar>/g;
  let br: RegExpExecArray | null;
  while ((br = barRe.exec(xml))) {
    const voices = br[2].match(/<Voices>([\d\s\-]+)<\/Voices>/)?.[1] ?? "";
    barList.push({
      voiceIds: voices
        .trim()
        .split(/\s+/)
        .filter((id) => id && id !== "-1"),
    });
  }

  const tracks: ImportedTrack[] = [];
  const lyricsParts: LyricSyllable[] = [];
  const trackRe = /<Track id="(\d+)"[^>]*>([\s\S]*?)<\/Track>/g;
  let tm: RegExpExecArray | null;
  let trackIndex = 0;
  while ((tm = trackRe.exec(xml))) {
    const name = tm[2].match(/<Name>([^<]+)<\/Name>/)?.[1]?.trim() || `Track ${trackIndex + 1}`;
    const staff = tm[2].match(/<Staff[^>]*>([\s\S]*?)<\/Staff>/)?.[1] ?? tm[2];
    const tuningText = staff.match(/<Tuning>([\d\s]+)<\/Tuning>/)?.[1];
    const tuning = tuningText ? tuningText.trim().split(/\s+/).map(Number) : [];
    const percussion =
      /<ShortName>.*[Dd]rum/.test(tm[2]) ||
      /\b(drum|kit)/i.test(name) ||
      tm[2].includes("<InstrumentSet>drums") ||
      tm[2].includes("Percussion");
    const program = Number(tm[2].match(/<Program>(\d+)<\/Program>/)?.[1] ?? 0);
    const barsAttr = tm[2].match(/<Bars>([\d\s]+)<\/Bars>/)?.[1] ?? "";
    const barIds = barsAttr.trim() ? barsAttr.trim().split(/\s+/) : [];
    const hint = hintFromTrack(name, program, percussion);
    const highToLow =
      tuning.length > 1 && tuning[0] < tuning[tuning.length - 1] ? [...tuning].reverse() : tuning;
    const stringNames = percussion
      ? stringNamesFor("drums", true, 6)
      : stringNamesFromTuning(highToLow, hint);
    const hits: { bar: number; slot: number; string: number; value: string }[] = [];

    barIds.forEach((barId, barIndex) => {
      const bar = barList[Number(barId)] ?? barList[barIndex];
      if (!bar) return;
      const voiceIds = bar.voiceIds.length ? bar.voiceIds : [];
      for (const voiceId of voiceIds) {
        const beatIds = voiceMap.get(voiceId) ?? [];
        let slot = 0;
        for (const beatId of beatIds) {
          const beat = beatMap.get(beatId);
          if (!beat) continue;
          const rhythm = rhythms.get(beat.rhythm);
          const width = durationToSlots(rhythm?.value ?? "Quarter", rhythm?.dots ?? 0, slots, barBeats);
          if (beat.text) lyricsParts.push({ bar: barIndex, slot, text: beat.text });
          for (const noteId of beat.noteIds) {
            const note = noteMap.get(noteId);
            if (!note) continue;
            if (percussion || hint === "drums") {
              const midi = note.midi ?? percussionMidiFromNote(note, {});
              const mapped = drumRowForMidi(midi);
              hits.push({ bar: barIndex, slot, string: mapped.row, value: mapped.value });
            } else {
              const displayString = lowestStringToTabRow(note.string, stringNames.length, false);
              hits.push({
                bar: barIndex,
                slot,
                string: displayString,
                value: note.cell,
              });
            }
          }
          slot += width;
        }
      }
    });

    tracks.push({
      index: trackIndex,
      name,
      hint: kindFromHint(hint, percussion),
      stringNames,
      isPercussion: percussion,
      measures: placeOnGrid(stringNames.length, slots, Math.max(barIds.length, 1), hits),
      tuningMidi: percussion ? undefined : highToLow,
    });
    trackIndex += 1;
  }

  if (!tracks.length) throw new Error("No tracks found in that Guitar Pro file.");

  const sections: SongSection[] = [];
  masterBars.forEach((mb, i) => {
    if (!mb.section) return;
    const last = sections[sections.length - 1];
    if (last) last.bars = i - last.startBar;
    sections.push({ name: mb.section, startBar: i, bars: 1 });
  });
  const barCount = tracks.reduce((m, t) => Math.max(m, t.measures.length), 1);
  if (sections.length) {
    const last = sections[sections.length - 1];
    last.bars = barCount - last.startBar;
  }

  return {
    title,
    artist,
    bpm: Number.isFinite(tempo) && tempo > 0 ? tempo : 120,
    timeSig,
    slotsPerBar: slots,
    sections: sections.length ? sections : defaultSections(barCount),
    tracks,
    lyrics: mergeLyrics(lyricsParts),
    source: "guitar-pro",
    fileName,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readPath(root: unknown, path: string[]): unknown {
  let cur: unknown = root;
  for (const key of path) {
    const rec = asRecord(cur);
    if (!rec) return undefined;
    cur = rec[key];
  }
  return cur;
}

function parseWithAlphaTab(mod: Record<string, unknown>, bytes: Uint8Array, fileName: string): ImportedScore {
  const SettingsCtor = (mod.Settings ?? readPath(mod, ["Settings"])) as
    | (new () => unknown)
    | undefined;
  const loader =
    (readPath(mod, ["importer", "ScoreLoader"]) as Record<string, unknown> | undefined) ??
    (mod.ScoreLoader as Record<string, unknown> | undefined);
  const load = loader?.loadScoreFromBytes as
    | ((data: Uint8Array, settings?: unknown) => unknown)
    | undefined;
  if (!load) throw new Error("AlphaTab ScoreLoader is unavailable.");

  const settings = SettingsCtor ? new SettingsCtor() : undefined;
  const importer = asRecord(asRecord(settings)?.importer);
  if (importer) importer.beatTextAsLyrics = true;
  const score = load(bytes, settings) as Record<string, unknown>;
  const scoreTitle = String(
    readPath(score, ["title"]) ?? readPath(score, ["album"]) ?? fileName.replace(/\.[^.]+$/, ""),
  );
  const artist = String(readPath(score, ["artist"]) ?? "Guitar Pro import");
  const masterBars = (score.masterBars as unknown[]) ?? [];
  const firstMaster = asRecord(masterBars[0]);
  const timeSig: TimeSig = {
    numerator: Number(readPath(firstMaster, ["timeSignatureNumerator"]) ?? 4),
    denominator: Number(readPath(firstMaster, ["timeSignatureDenominator"]) ?? 4),
  };
  const tempo = Number(
    readPath(firstMaster, ["tempoAutomation", "value"]) ??
      readPath(score, ["tempo"]) ??
      120,
  );
  const slots = slotsForTimeSig(timeSig);
  const barBeats = timeSig.numerator;
  const tracksIn = (score.tracks as unknown[]) ?? [];
  const imported: ImportedTrack[] = [];
  const lyricsParts: LyricSyllable[] = [];

  tracksIn.forEach((trackValue, index) => {
    const track = asRecord(trackValue);
    if (!track) return;
    const name = String(track.name ?? `Track ${index + 1}`);
    const staves = (track.staves as unknown[]) ?? [];
    const staff = asRecord(staves[0]);
    const percussion = Boolean(staff?.isPercussion);
    const program = Number(readPath(track, ["playbackInfo", "program"]) ?? 0);
    const hint = hintFromTrack(name, program, percussion);
    const tuning = Array.isArray(staff?.tuning) ? (staff.tuning as number[]) : [];
    const displayTuning = toHighToLow(tuning);
    const stringNames = percussion
      ? stringNamesFor("drums", true, 6)
      : stringNamesFromTuning(displayTuning, hint);
    const hits: { bar: number; slot: number; string: number; value: string }[] = [];
    const bars = (staff?.bars as unknown[]) ?? [];

    bars.forEach((barValue, barIndex) => {
      const bar = asRecord(barValue);
      const voices = (bar?.voices as unknown[]) ?? [];
      for (const voiceValue of voices) {
        const voice = asRecord(voiceValue);
        const beats = (voice?.beats as unknown[]) ?? [];
        let slot = 0;
        for (const beatValue of beats) {
          const beat = asRecord(beatValue);
          if (!beat) continue;
          const duration = Number(beat.duration ?? 4);
          const dots = Number(beat.dots ?? 0);
          const width = alphaDurationToSlots(duration, dots, slots, barBeats);
          const notes = (beat.notes as unknown[]) ?? [];
          const word = beatLyricText(beat);
          if (word) lyricsParts.push({ bar: barIndex, slot, text: word });
          if (!beat.isRest) {
            for (const noteValue of notes) {
              const note = asRecord(noteValue);
              if (!note || note.isTieDestination) continue;
              if (percussion || hint === "drums") {
                const midi = percussionMidiFromNote(note, track);
                const mapped = drumRowForMidi(midi);
                hits.push({ bar: barIndex, slot, string: mapped.row, value: mapped.value });
              } else {
                hits.push({
                  bar: barIndex,
                  slot,
                  string: lowestStringToTabRow(Number(note.string ?? 1), stringNames.length, true),
                  value: alphatabTabCell(note),
                });
              }
            }
          }
          slot += width;
        }
      }
    });

    imported.push({
      index,
      name,
      hint: kindFromHint(hint, percussion),
      stringNames,
      isPercussion: percussion,
      measures: placeOnGrid(stringNames.length, slots, Math.max(bars.length, 1), hits),
      tuningMidi: percussion ? undefined : displayTuning,
    });
  });

  if (!imported.length) throw new Error("No tracks found in that Guitar Pro file.");

  const sections: SongSection[] = [];
  masterBars.forEach((mbValue, i) => {
    const mb = asRecord(mbValue);
    const section = asRecord(mb?.section);
    const text = String(section?.text ?? section?.letter ?? "");
    if (!text) return;
    const last = sections[sections.length - 1];
    if (last) last.bars = i - last.startBar;
    sections.push({ name: text, startBar: i, bars: 1 });
  });
  const barCount = imported.reduce((m, t) => Math.max(m, t.measures.length), 1);
  if (sections.length) {
    sections[sections.length - 1].bars = barCount - sections[sections.length - 1].startBar;
  }

  return {
    title: scoreTitle || fileName.replace(/\.[^.]+$/, ""),
    artist,
    bpm: Number.isFinite(tempo) && tempo > 20 ? Math.round(tempo) : 120,
    timeSig,
    slotsPerBar: slots,
    sections: sections.length ? sections : defaultSections(barCount),
    tracks: imported,
    lyrics: mergeLyrics(lyricsParts),
    source: "guitar-pro",
    fileName,
  };
}

export async function parseGuitarPro(buffer: ArrayBuffer, fileName: string): Promise<ImportedScore> {
  const bytes = new Uint8Array(buffer);
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;

  try {
    const alphaTab = await import("@coderline/alphatab");
    return parseWithAlphaTab(alphaTab as unknown as Record<string, unknown>, bytes, fileName);
  } catch (alphaErr) {
    if (isZip) {
      try {
        const files = unzipSync(bytes);
        const gpifEntry =
          files["Content/score.gpif"] ??
          Object.entries(files).find(([name]) => name.endsWith("score.gpif"))?.[1];
        if (gpifEntry) return parseGpif(decodeText(gpifEntry), fileName);
      } catch {
        /* fall through */
      }
    }
    const message = alphaErr instanceof Error ? alphaErr.message : "Could not read Guitar Pro file.";
    throw new Error(message);
  }
}

export function looksLikeMidi(name: string): boolean {
  return /\.midi?$/i.test(name);
}

export function looksLikeGuitarPro(name: string): boolean {
  return /\.(gp\d?|gpx|gtp)$/i.test(name);
}
