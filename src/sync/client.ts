import { engine } from "../audio/engine";
import type { ClientMessage, RoomState, ServerMessage, Song } from "../types";

export type SyncHandler = {
  onJoined: (youId: string, room: RoomState) => void;
  onState: (room: RoomState) => void;
  onError: (message: string) => void;
  onLanUrls: (urls: string[]) => void;
};

export class SyncClient {
  private ws: WebSocket | null = null;
  private offset = 0;
  private samples: number[] = [];
  private pingTimer: number | null = null;
  private handlers: SyncHandler;
  private reconnectRoom: { code: string; name: string; instrument: string; create: boolean } | null =
    null;
  connected = false;

  constructor(handlers: SyncHandler) {
    this.handlers = handlers;
  }

  connect() {
    this.disconnect();
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.ping();
      this.pingTimer = window.setInterval(() => this.ping(), 2500);
      if (this.reconnectRoom) {
        this.send({
          type: "join",
          room: this.reconnectRoom.code,
          name: this.reconnectRoom.name,
          instrument: this.reconnectRoom.instrument,
          create: this.reconnectRoom.create,
        });
      }
    };
    ws.onclose = () => {
      this.connected = false;
      if (this.pingTimer != null) window.clearInterval(this.pingTimer);
      this.pingTimer = null;
      window.setTimeout(() => {
        if (this.reconnectRoom) this.connect();
      }, 800);
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as ServerMessage;
      if (msg.type === "pong") {
        const rtt = Date.now() - msg.t;
        const est = msg.serverTime + rtt / 2 - Date.now();
        this.samples.push(est);
        if (this.samples.length > 8) this.samples.shift();
        const sorted = [...this.samples].sort((a, b) => a - b);
        this.offset = sorted[Math.floor(sorted.length / 2)] ?? 0;
      } else if (msg.type === "joined") {
        this.handlers.onJoined(msg.you.id, msg.room);
      } else if (msg.type === "state") {
        this.handlers.onState(msg.room);
      } else if (msg.type === "error") {
        this.handlers.onError(msg.message);
      } else if (msg.type === "info") {
        this.handlers.onLanUrls(msg.lanUrls);
      }
    };
  }

  join(room: string, name: string, instrument: string, create: boolean) {
    this.reconnectRoom = { code: room, name, instrument, create };
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) this.connect();
    else this.send({ type: "join", room, name, instrument, create });
  }

  leave() {
    this.reconnectRoom = null;
    this.disconnect();
  }

  send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  serverNow(): number {
    return Date.now() + this.offset;
  }

  localPlayAt(serverPlayAt: number): number {
    const delayMs = serverPlayAt - this.serverNow();
    return engine.getContextTime() + delayMs / 1000;
  }

  addSong(song: Song) {
    this.send({ type: "addSong", song });
  }

  syncLibrary(songs: Song[]) {
    if (!songs.length) return;
    this.send({ type: "syncLibrary", songs });
  }

  removeSong(songId: string) {
    this.send({ type: "removeSong", songId });
  }

  private ping() {
    this.send({ type: "ping", t: Date.now() });
  }

  private disconnect() {
    if (this.pingTimer != null) window.clearInterval(this.pingTimer);
    this.pingTimer = null;
    const ws = this.ws;
    this.ws = null;
    this.connected = false;
    ws?.close();
  }
}
