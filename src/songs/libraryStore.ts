import type { Song } from "../types";

const KEY = "sb-library";

export type SavedLibrary = {
  songs: Song[];
  lastSongId?: string;
};

function looksLikeSong(value: unknown): value is Song {
  if (!value || typeof value !== "object") return false;
  const song = value as Song;
  return typeof song.id === "string" && typeof song.title === "string" && Array.isArray(song.tracks);
}

export function loadSavedLibrary(): SavedLibrary {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { songs: [] };
    const parsed = JSON.parse(raw) as { songs?: unknown; lastSongId?: unknown };
    return {
      songs: Array.isArray(parsed.songs) ? parsed.songs.filter(looksLikeSong) : [],
      lastSongId: typeof parsed.lastSongId === "string" ? parsed.lastSongId : undefined,
    };
  } catch {
    return { songs: [] };
  }
}

export function saveSavedLibrary(lib: SavedLibrary) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        songs: lib.songs,
        lastSongId: lib.lastSongId,
        savedAt: Date.now(),
      }),
    );
  } catch {
    /* quota — server file is the fallback */
  }
}

export function upsertSavedSong(song: Song) {
  const lib = loadSavedLibrary();
  const idx = lib.songs.findIndex((s) => s.id === song.id);
  if (idx >= 0) lib.songs[idx] = song;
  else lib.songs.push(song);
  lib.lastSongId = song.id;
  saveSavedLibrary(lib);
}

export function removeSavedSong(id: string) {
  const lib = loadSavedLibrary();
  lib.songs = lib.songs.filter((s) => s.id !== id);
  if (lib.lastSongId === id) lib.lastSongId = lib.songs[0]?.id;
  saveSavedLibrary(lib);
}

export function mergeSavedSongs(incoming: Song[], lastSongId?: string) {
  if (!incoming.length && !lastSongId) return loadSavedLibrary();
  const lib = loadSavedLibrary();
  for (const song of incoming) {
    if (!looksLikeSong(song)) continue;
    const idx = lib.songs.findIndex((s) => s.id === song.id);
    if (idx >= 0) lib.songs[idx] = song;
    else lib.songs.push(song);
  }
  if (lastSongId) lib.lastSongId = lastSongId;
  saveSavedLibrary(lib);
  return lib;
}
