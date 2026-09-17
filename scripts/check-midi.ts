import { writeFileSync } from "node:fs";
import { Midi } from "@tonejs/midi";
import { parseMidi } from "../src/songs/midi.ts";
import { songFromImport } from "../src/songs/importFile.ts";

const midi = new Midi();
midi.header.name = "Import Check";
midi.header.tempos.push({ bpm: 110, ticks: 0 });
midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4], measures: 0 });
midi.header.update();

const lead = midi.addTrack();
lead.name = "Lead guitar";
lead.instrument.number = 27;
lead.addNote({ midi: 64, time: 0, duration: 0.5 });
lead.addNote({ midi: 67, time: 0.5, duration: 0.5 });
lead.addNote({ midi: 69, time: 1, duration: 0.5 });
lead.addNote({ midi: 72, time: 1.5, duration: 0.5 });

const bass = midi.addTrack();
bass.name = "Bass";
bass.instrument.number = 33;
bass.addNote({ midi: 40, time: 0, duration: 1 });
bass.addNote({ midi: 43, time: 1, duration: 1 });
bass.addNote({ midi: 45, time: 2, duration: 1 });
bass.addNote({ midi: 40, time: 3, duration: 1 });

const drums = midi.addTrack();
drums.name = "Drum kit";
drums.channel = 9;
drums.addNote({ midi: 36, time: 0, duration: 0.2 });
drums.addNote({ midi: 38, time: 1, duration: 0.2 });
drums.addNote({ midi: 36, time: 2, duration: 0.2 });
drums.addNote({ midi: 38, time: 3, duration: 0.2 });
drums.addNote({ midi: 42, time: 0.5, duration: 0.1 });
drums.addNote({ midi: 42, time: 1.5, duration: 0.1 });
drums.addNote({ midi: 42, time: 2.5, duration: 0.1 });
drums.addNote({ midi: 42, time: 3.5, duration: 0.1 });

const bytes = midi.toArray();
writeFileSync(new URL("./import-check.mid", import.meta.url), Buffer.from(bytes));

const score = await parseMidi(bytes.buffer, "import-check.mid");
const song = songFromImport(score);
const guitarHits =
  song.tracks.find((t) => t.kind === "guitar")?.measures[0]?.rows.flat().filter((c) => c !== "-").length ?? 0;
const bassHits =
  song.tracks.find((t) => t.kind === "bass")?.measures[0]?.rows.flat().filter((c) => c !== "-").length ?? 0;
const drumHits =
  song.tracks.find((t) => t.kind === "drums")?.measures[0]?.rows.flat().filter((c) => c !== "-").length ?? 0;

if (!guitarHits || !bassHits || !drumHits) {
  console.error(JSON.stringify({ title: score.title, tracks: score.tracks.map((t) => t.hint), guitarHits, bassHits, drumHits }, null, 2));
  throw new Error("MIDI import did not keep guitar/bass/drums");
}
console.log(`ok ${score.title} ${score.bpm}bpm tracks=${score.tracks.length} guitar=${guitarHits} bass=${bassHits} drums=${drumHits}`);
