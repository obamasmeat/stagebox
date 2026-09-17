import type { Playhead, Song, TimeSig } from "../types";
import { sectionAt } from "../songs/grid";
import { synth } from "./synth";

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;

function trackBarCount(song: Song): number {
  return Math.max(1, ...song.tracks.map((t) => t.measures.length));
}

export class RehearsalEngine {
  private ctx: AudioContext | null = null;
  private timer: number | null = null;
  private nextClickTime = 0;
  private clickIndex = 0;
  private nextSlotTime = 0;
  private slotIndex = 0;
  private volume = 0.7;
  private muted = false;
  private playing = false;
  private localPlayAt = 0;
  private song: Song | null = null;
  private startBar = 0;
  private countInBars = 1;
  private bpm = 120;
  private timeSig: TimeSig = { numerator: 4, denominator: 4 };
  private previewing = false;

  async unlock(): Promise<void> {
    const ctx = this.ensure();
    if (ctx.state === "suspended") await ctx.resume();
  }

  setVolume(value: number) {
    this.volume = Math.min(1, Math.max(0, value));
    synth.setVolume(this.volume);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
  }

  getContextTime(): number {
    return this.ctx?.currentTime ?? 0;
  }

  startSong(opts: {
    song: Song;
    bpm: number;
    countInBars: number;
    startBar: number;
    localPlayAt: number;
  }) {
    this.stopPreview();
    this.song = opts.song;
    this.bpm = opts.bpm;
    this.countInBars = opts.countInBars;
    this.startBar = opts.startBar;
    this.timeSig = opts.song.timeSig;
    this.localPlayAt = opts.localPlayAt;
    this.playing = true;
    this.clickIndex = 0;
    this.nextClickTime = Math.max(this.getContextTime(), opts.localPlayAt);
    const slots = opts.song.slotsPerBar;
    const countInSlots = opts.countInBars * slots;
    this.slotIndex = -countInSlots;
    this.nextSlotTime = this.nextClickTime;
    void this.unlock();
    this.arm();
  }

  stop() {
    this.playing = false;
    this.previewing = false;
    this.disarm();
  }

  startPreview(bpm: number, timeSig: TimeSig) {
    void this.unlock();
    this.previewing = true;
    this.playing = true;
    this.bpm = bpm;
    this.timeSig = timeSig;
    this.song = null;
    this.countInBars = 0;
    this.startBar = 0;
    this.localPlayAt = this.getContextTime();
    this.clickIndex = 0;
    this.nextClickTime = this.localPlayAt;
    this.slotIndex = 0;
    this.nextSlotTime = this.localPlayAt;
    this.arm();
  }

  stopPreview() {
    if (this.previewing) this.stop();
  }

  getPlayhead(now = this.getContextTime()): Playhead {
    const idle: Playhead = {
      phase: "idle",
      countInBeat: 0,
      bar: this.startBar,
      beat: 1,
      slot: 0,
      slotExact: 0,
      sectionName: this.song ? sectionAt(this.song, this.startBar) : "",
    };
    if (!this.playing || this.previewing) return idle;

    const clickSecs = this.clickDuration();
    const beatsPerBar = this.timeSig.numerator;
    const countInBeats = this.countInBars * beatsPerBar;
    const elapsed = now - this.localPlayAt;
    if (elapsed < -0.03) return { ...idle, phase: "waiting" };

    const totalClicks = Math.max(0, elapsed / clickSecs);
    if (totalClicks < countInBeats) {
      return {
        phase: "countin",
        countInBeat: Math.min(beatsPerBar, (Math.floor(totalClicks) % beatsPerBar) + 1),
        bar: this.startBar,
        beat: 1,
        slot: 0,
        slotExact: 0,
        sectionName: "Count-in",
      };
    }

    const songBeats = totalClicks - countInBeats;
    const song = this.song;
    const barCount = song ? trackBarCount(song) : 1;
    const beatsFromStart = this.startBar * beatsPerBar + songBeats;
    const loopBeats = Math.max(1, barCount * beatsPerBar);
    const wrapped = ((beatsFromStart % loopBeats) + loopBeats) % loopBeats;
    const bar = Math.floor(wrapped / beatsPerBar);
    const beatPos = wrapped - bar * beatsPerBar;
    const slots = song?.slotsPerBar ?? 16;
    const slotExact = Math.min(slots, (beatPos / beatsPerBar) * slots);
    const slot = Math.min(slots - 1, Math.floor(slotExact));
    return {
      phase: "song",
      countInBeat: 0,
      bar,
      beat: Math.min(beatsPerBar, Math.floor(beatPos) + 1),
      slot,
      slotExact,
      sectionName: song ? sectionAt(song, bar) : "Song",
    };
  }

  private clickDuration(): number {
    return (60 / this.bpm) * (4 / this.timeSig.denominator);
  }

  private slotDuration(): number {
    const slots = this.song?.slotsPerBar ?? 16;
    return (this.clickDuration() * this.timeSig.numerator) / slots;
  }

  private ensure(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  private arm() {
    this.disarm();
    this.scheduler();
    this.timer = window.setInterval(() => this.scheduler(), LOOKAHEAD_MS);
  }

  private disarm() {
    if (this.timer != null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private scheduler() {
    if (!this.playing) return;
    const ctx = this.ensure();
    const clickSecs = this.clickDuration();
    const beatsPerBar = this.timeSig.numerator;
    while (this.nextClickTime < ctx.currentTime + SCHEDULE_AHEAD) {
      const countInBeats = this.song ? this.countInBars * beatsPerBar : 0;
      const isCountIn = this.song ? this.clickIndex < countInBeats : false;
      const beatInBar = this.clickIndex % beatsPerBar;
      const clickMuted = this.muted || synth.muted.has("click");
      if (!clickMuted && this.volume > 0) this.playClick(this.nextClickTime, beatInBar === 0, isCountIn);
      this.nextClickTime += clickSecs;
      this.clickIndex += 1;
    }

    if (!this.song || this.previewing) return;
    const slotSecs = this.slotDuration();
    const slots = this.song.slotsPerBar;
    const barCount = trackBarCount(this.song);
    const totalSlots = Math.max(1, barCount * slots);
    while (this.nextSlotTime < ctx.currentTime + SCHEDULE_AHEAD) {
      if (this.slotIndex >= 0) {
        const songSlot = (this.startBar * slots + this.slotIndex) % totalSlots;
        const bar = Math.floor(songSlot / slots);
        const slot = songSlot % slots;
        synth.triggerSongSlot(ctx, this.nextSlotTime, this.song, bar, slot, slotSecs);
      }
      this.nextSlotTime += slotSecs;
      this.slotIndex += 1;
    }
  }

  private playClick(time: number, downbeat: boolean, countIn: boolean) {
    const ctx = this.ensure();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = countIn ? (downbeat ? 1568 : 1174) : downbeat ? 1320 : 880;
    const peak = this.volume * (downbeat ? 0.28 : 0.16);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + (downbeat ? 0.07 : 0.045));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.09);
  }
}

export const engine = new RehearsalEngine();
