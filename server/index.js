import express from "express";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 3001);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, "..", "dist");
const libraryPath = path.join(__dirname, "..", "data", "library.json");

function cloneSongs(songs) {
  try {
    return JSON.parse(JSON.stringify(songs));
  } catch {
    return [];
  }
}

function loadLibrary() {
  try {
    const raw = JSON.parse(fs.readFileSync(libraryPath, "utf8"));
    return {
      songs: Array.isArray(raw.songs) ? raw.songs.filter((s) => s?.id && s?.title) : [],
      lastSongId: typeof raw.lastSongId === "string" ? raw.lastSongId : "",
    };
  } catch {
    return { songs: [], lastSongId: "" };
  }
}

function saveLibrary() {
  try {
    fs.mkdirSync(path.dirname(libraryPath), { recursive: true });
    const tmp = `${libraryPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ songs: library.songs, lastSongId: library.lastSongId }));
    fs.renameSync(tmp, libraryPath);
  } catch (err) {
    console.error("Could not save setlist", err);
  }
}

function upsertLibrarySong(song, select = true) {
  if (!song?.id || !song?.title) return;
  const idx = library.songs.findIndex((s) => s.id === song.id);
  if (idx >= 0) library.songs[idx] = song;
  else library.songs.push(song);
  if (select) library.lastSongId = song.id;
}

function removeLibrarySong(id) {
  library.songs = library.songs.filter((s) => s.id !== id);
  if (library.lastSongId === id) library.lastSongId = library.songs[0]?.id ?? "";
}

/** @type {{ songs: object[], lastSongId: string }} */
let library = loadLibrary();

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function roomCode() {
  let code = "";
  for (let i = 0; i < 4; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return code;
}

function lanUrls(port) {
  const nets = os.networkInterfaces();
  const urls = [];
  for (const addrs of Object.values(nets)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal) {
        urls.push(`http://${addr.address}:${port}`);
      }
    }
  }
  return urls;
}

/**
 * @typedef {{ id: string, name: string, instrument: string, isHost: boolean }} Player
 * @typedef {{
 *  code: string,
 *  hostId: string,
 *  songId: string,
 *  bpm: number,
 *  countInBars: number,
 *  playing: boolean,
 *  playAtServerTime: number,
 *  startBar: number,
 *  customSongs: object[],
 *  players: Map<string, Player>
 * }} Room
 */

/** @type {Map<string, Room>} */
const rooms = new Map();

function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    songId: room.songId,
    bpm: room.bpm,
    countInBars: room.countInBars,
    playing: room.playing,
    playAtServerTime: room.playAtServerTime,
    startBar: room.startBar,
    customSongs: room.customSongs,
    players: [...room.players.values()].map((p) => ({ ...p, isHost: p.id === room.hostId })),
  };
}

function broadcast(room, msg) {
  const payload = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === 1 && client.roomCode === room.code) {
      client.send(payload);
    }
  }
}

function sendState(room) {
  broadcast(room, { type: "state", room: publicRoom(room) });
}

function getRoom(code) {
  return rooms.get(code.toUpperCase());
}

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/info", (_req, res) => {
  const frontPort = process.env.NODE_ENV === "production" ? PORT : Number(process.env.FRONT_PORT || 5173);
  res.json({
    lanUrls: lanUrls(frontPort),
    wsPort: PORT,
    production: process.env.NODE_ENV === "production",
  });
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(dist));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket) => {
  socket.id = Math.random().toString(36).slice(2, 10);
  socket.roomCode = null;

  socket.send(
    JSON.stringify({
      type: "info",
      lanUrls: lanUrls(process.env.NODE_ENV === "production" ? PORT : Number(process.env.FRONT_PORT || 5173)),
    }),
  );

  socket.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (msg.type === "ping") {
      socket.send(JSON.stringify({ type: "pong", t: msg.t, serverTime: Date.now() }));
      return;
    }

    if (msg.type === "join") {
      let code = String(msg.room || "").toUpperCase().trim();
      if (msg.create && !code) {
        do {
          code = roomCode();
        } while (rooms.has(code));
      }
      if (!/^[A-Z0-9]{4}$/.test(code)) {
        socket.send(JSON.stringify({ type: "error", message: "Room code must be 4 letters." }));
        return;
      }
      let room = rooms.get(code);
      if (!room) {
        const saved = cloneSongs(library.songs);
        const savedId =
          (library.lastSongId && saved.some((s) => s.id === library.lastSongId) && library.lastSongId) ||
          saved[0]?.id ||
          "breaker-box";
        const savedSong = saved.find((s) => s.id === savedId);
        room = {
          code,
          hostId: socket.id,
          songId: savedId,
          bpm: Number(savedSong?.bpm) || 120,
          countInBars: 1,
          playing: false,
          playAtServerTime: 0,
          startBar: 0,
          customSongs: saved,
          players: new Map(),
        };
        rooms.set(code, room);
      }
      socket.roomCode = code;
      const player = {
        id: socket.id,
        name: String(msg.name || "Player").slice(0, 24) || "Player",
        instrument: msg.instrument || "rhythm",
        isHost: room.players.size === 0 || room.hostId === socket.id,
      };
      if (room.players.size === 0) room.hostId = socket.id;
      room.players.set(socket.id, player);
      socket.send(JSON.stringify({ type: "joined", you: { ...player, isHost: player.id === room.hostId }, room: publicRoom(room) }));
      sendState(room);
      return;
    }

    const room = socket.roomCode ? getRoom(socket.roomCode) : null;
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    const isHost = player.id === room.hostId;

    if (msg.type === "instrument") {
      player.instrument = msg.instrument;
      sendState(room);
      return;
    }

    if (!isHost) {
      socket.send(JSON.stringify({ type: "error", message: "Only the host can control playback." }));
      return;
    }

    if (msg.type === "play") {
      room.playing = true;
      room.startBar = Math.max(0, Number(msg.startBar) || 0);
      room.playAtServerTime = Date.now() + 180;
      sendState(room);
    } else if (msg.type === "seek") {
      room.startBar = Math.max(0, Number(msg.startBar) || 0);
      sendState(room);
    } else if (msg.type === "stop") {
      room.playing = false;
      room.playAtServerTime = 0;
      sendState(room);
    } else if (msg.type === "setSong") {
      room.songId = msg.songId;
      room.playing = false;
      room.startBar = 0;
      const custom = room.customSongs.find((s) => s.id === msg.songId);
      if (custom?.bpm) room.bpm = custom.bpm;
      if (custom) {
        library.lastSongId = custom.id;
        saveLibrary();
      }
      sendState(room);
    } else if (msg.type === "setBpm") {
      room.bpm = Math.min(300, Math.max(40, Number(msg.bpm) || 120));
      sendState(room);
    } else if (msg.type === "setCountIn") {
      room.countInBars = Math.min(2, Math.max(0, Number(msg.bars) || 0));
      sendState(room);
    } else if (msg.type === "addSong") {
      const song = msg.song;
      if (!song?.id || !song?.title) return;
      const idx = room.customSongs.findIndex((s) => s.id === song.id);
      if (idx >= 0) room.customSongs[idx] = song;
      else room.customSongs.push(song);
      room.songId = song.id;
      room.bpm = song.bpm || room.bpm;
      room.playing = false;
      room.startBar = 0;
      upsertLibrarySong(song);
      saveLibrary();
      sendState(room);
    } else if (msg.type === "syncLibrary") {
      const songs = Array.isArray(msg.songs) ? msg.songs : [];
      for (const song of songs) {
        if (!song?.id || !song?.title) continue;
        const idx = room.customSongs.findIndex((s) => s.id === song.id);
        if (idx >= 0) room.customSongs[idx] = song;
        else room.customSongs.push(song);
        upsertLibrarySong(song, false);
      }
      saveLibrary();
      sendState(room);
    } else if (msg.type === "removeSong") {
      const id = String(msg.songId || "");
      if (!id) return;
      room.customSongs = room.customSongs.filter((s) => s.id !== id);
      removeLibrarySong(id);
      if (room.songId === id) {
        const next = room.customSongs[0];
        room.songId = next?.id || "breaker-box";
        if (next?.bpm) room.bpm = next.bpm;
        room.startBar = 0;
        room.playing = false;
      }
      saveLibrary();
      sendState(room);
    }
  });

  socket.on("close", () => {
    const room = socket.roomCode ? getRoom(socket.roomCode) : null;
    if (!room) return;
    room.players.delete(socket.id);
    if (room.players.size === 0) {
      rooms.delete(room.code);
      return;
    }
    if (room.hostId === socket.id) {
      room.hostId = room.players.keys().next().value;
      room.playing = false;
    }
    sendState(room);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  const urls = lanUrls(process.env.NODE_ENV === "production" ? PORT : 5173);
  console.log(`Stagebox sync on port ${PORT}`);
  if (library.songs.length) console.log(`  setlist: ${library.songs.length} saved song${library.songs.length === 1 ? "" : "s"}`);
  for (const url of urls) console.log(`  devices: ${url}`);
});
