export type TrackKind = "guitar" | "bass" | "drums";
export type PlayerRole = "guitar" | "bass" | "drums" | "vocals";
export type InstrumentId = PlayerRole;

export const INSTRUMENTS: { id: PlayerRole; label: string; short: string }[] = [
  { id: "guitar", label: "Guitar", short: "Guitar" },
  { id: "bass", label: "Bass", short: "Bass" },
  { id: "drums", label: "Drums", short: "Drums" },
  { id: "vocals", label: "Vocals", short: "Vocals" },
];

export interface LyricSyllable {
  bar: number;
  slot: number;
  text: string;
}

export interface TimeSig {
  numerator: number;
  denominator: number;
}

export interface SongSection {
  name: string;
  startBar: number;
  bars: number;
}

export interface TabMeasure {
  rows: string[][];
}

export interface TabTrack {
  id: string;
  kind: TrackKind;
  name: string;
  stringNames: string[];
  measures: TabMeasure[];
  tuningMidi?: number[];
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  timeSig: TimeSig;
  slotsPerBar: number;
  sections: SongSection[];
  tracks: TabTrack[];
  lyrics?: LyricSyllable[];
  source?: "built-in" | "guitar-pro" | "midi";
  fileName?: string;
}

export interface Player {
  id: string;
  name: string;
  instrument: string;
  isHost: boolean;
}

export interface PlayState {
  playing: boolean;
  playAtServerTime: number;
  startBar: number;
  countInBars: number;
}

export interface RoomState {
  code: string;
  hostId: string;
  songId: string;
  bpm: number;
  countInBars: number;
  playing: boolean;
  playAtServerTime: number;
  startBar: number;
  players: Player[];
  customSongs: Song[];
}

export type ClientMessage =
  | { type: "join"; room: string; name: string; instrument: string; create?: boolean }
  | { type: "instrument"; instrument: string }
  | { type: "play"; startBar: number }
  | { type: "seek"; startBar: number }
  | { type: "stop" }
  | { type: "setSong"; songId: string }
  | { type: "setBpm"; bpm: number }
  | { type: "setCountIn"; bars: number }
  | { type: "addSong"; song: Song }
  | { type: "syncLibrary"; songs: Song[] }
  | { type: "removeSong"; songId: string }
  | { type: "ping"; t: number };

export type ServerMessage =
  | { type: "joined"; you: Player; room: RoomState }
  | { type: "state"; room: RoomState }
  | { type: "error"; message: string }
  | { type: "pong"; t: number; serverTime: number }
  | { type: "info"; lanUrls: string[] };

export interface Playhead {
  phase: "idle" | "waiting" | "countin" | "song";
  countInBeat: number;
  bar: number;
  beat: number;
  slot: number;
  slotExact: number;
  sectionName: string;
}

export interface ImportedTrack {
  index: number;
  name: string;
  hint: TrackKind | "ignore";
  stringNames: string[];
  isPercussion: boolean;
  measures: TabMeasure[];
  tuningMidi?: number[];
}

export interface ImportedScore {
  title: string;
  artist: string;
  bpm: number;
  timeSig: TimeSig;
  slotsPerBar: number;
  sections: SongSection[];
  tracks: ImportedTrack[];
  lyrics?: LyricSyllable[];
  source: "guitar-pro" | "midi";
  fileName: string;
}
