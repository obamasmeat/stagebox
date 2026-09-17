import type { Song, TabTrack } from "../types";
import { BASS_TUNING_MIDI, GUITAR_TUNING_MIDI } from "../songs/grid";
import { isSustainHold, parseTabNote, type TabBendKind } from "../songs/tabNote";

export type SynthPart = string;

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function openMidi(track: TabTrack, row: number): number {
  const tuning = track.tuningMidi;
  if (tuning?.length) return tuning[row] ?? tuning[tuning.length - 1] ?? 40;
  const bass = track.kind === "bass";
  const fallback = bass ? BASS_TUNING_MIDI : GUITAR_TUNING_MIDI;
  return fallback[row] ?? fallback[fallback.length - 1] ?? (bass ? 28 : 40);
}

export class BandSynth {
  private volume = 0.65;
  private bus: GainNode | null = null;
  private ctx: AudioContext | null = null;
  enabled = true;
  muted = new Set<SynthPart>();

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.bus) this.bus.gain.value = this.volume;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
  }

  setMuted(part: SynthPart, mute: boolean) {
    if (mute) this.muted.add(part);
    else this.muted.delete(part);
  }

  attach(ctx: AudioContext) {
    if (this.ctx === ctx && this.bus) return this.bus;
    this.ctx = ctx;
    const bus = ctx.createGain();
    bus.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 8;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.12;
    bus.connect(comp);
    comp.connect(ctx.destination);
    this.bus = bus;
    return bus;
  }

  triggerSongSlot(
    ctx: AudioContext,
    time: number,
    song: Song,
    bar: number,
    slot: number,
    slotDuration = 0.12,
  ) {
    if (!this.enabled || this.volume <= 0) return;
    const dest = this.attach(ctx);
    for (const track of song.tracks) {
      if (this.muted.has(track.id) || this.muted.has(track.kind)) continue;
      const measure = track.measures[bar];
      if (!measure) continue;
      if (track.kind === "drums") this.playDrums(ctx, dest, time, measure.rows, slot);
      else this.playFretted(ctx, dest, time, track, measure.rows, slot, slotDuration);
    }
  }

  private out(ctx: AudioContext, dest: AudioNode, time: number, peak: number, dur: number) {
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(Math.max(0.0001, peak), time);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    amp.connect(dest);
    return amp;
  }

  private playDrums(ctx: AudioContext, dest: AudioNode, time: number, rows: string[][], slot: number) {
    const hit = (row: number) => rows[row]?.[slot] && rows[row][slot] !== "-";
    if (hit(5)) this.kick(ctx, dest, time);
    if (hit(2)) this.snare(ctx, dest, time);
    if (hit(1)) this.hat(ctx, dest, time, rows[1][slot] === "O");
    if (hit(0)) this.crash(ctx, dest, time);
    if (hit(3)) this.tom(ctx, dest, time, 196);
    if (hit(4)) this.tom(ctx, dest, time, 128);
  }

  private kick(ctx: AudioContext, dest: AudioNode, time: number) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(98, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.09);
    osc.connect(this.out(ctx, dest, time, 0.85, 0.22));
    osc.start(time);
    osc.stop(time + 0.24);
    this.noise(ctx, dest, time, 0.03, 0.18, 1200, "lowpass");
  }

  private snare(ctx: AudioContext, dest: AudioNode, time: number) {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(190, time);
    osc.connect(this.out(ctx, dest, time, 0.22, 0.1));
    osc.start(time);
    osc.stop(time + 0.12);
    this.noise(ctx, dest, time, 0.14, 0.38, 2200, "highpass");
  }

  private hat(ctx: AudioContext, dest: AudioNode, time: number, open: boolean) {
    this.noise(ctx, dest, time, open ? 0.22 : 0.035, open ? 0.12 : 0.09, 9000, "highpass");
  }

  private crash(ctx: AudioContext, dest: AudioNode, time: number) {
    this.noise(ctx, dest, time, 0.55, 0.14, 6500, "highpass");
  }

  private tom(ctx: AudioContext, dest: AudioNode, time: number, freq: number) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.72, time + 0.14);
    osc.connect(this.out(ctx, dest, time, 0.4, 0.2));
    osc.start(time);
    osc.stop(time + 0.22);
  }

  private playFretted(
    ctx: AudioContext,
    dest: AudioNode,
    time: number,
    track: TabTrack,
    rows: string[][],
    slot: number,
    slotDuration: number,
  ) {
    const bass = track.kind === "bass";
    for (let s = 0; s < rows.length; s++) {
      const cell = rows[s]?.[slot] ?? "-";
      const note = parseTabNote(cell);
      if (note.kind === "rest") continue;
      if (note.kind === "dead") {
        this.muteThunk(ctx, dest, time, bass);
        continue;
      }
      if (slot > 0 && isSustainHold(rows[s][slot - 1] ?? "-", cell)) continue;
      this.pluck(ctx, dest, time, openMidi(track, s) + note.fret, bass, note.bend, slotDuration);
    }
  }

  private muteThunk(ctx: AudioContext, dest: AudioNode, time: number, bass: boolean) {
    this.noise(ctx, dest, time, 0.042, bass ? 0.28 : 0.2, bass ? 900 : 1600, "bandpass");
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(bass ? 70 : 110, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.028);
    osc.connect(this.out(ctx, dest, time, bass ? 0.16 : 0.1, 0.05));
    osc.start(time);
    osc.stop(time + 0.055);
  }

  private pluck(
    ctx: AudioContext,
    dest: AudioNode,
    time: number,
    midi: number,
    bass: boolean,
    bend?: { type: TabBendKind; quarters: number },
    slotDuration = 0.12,
  ) {
    const freq = midiToFreq(midi);
    const q = bend?.quarters ?? 0;
    const destFreq = midiToFreq(midi + q / 2);
    const ramp = Math.max(0.1, slotDuration * (bend?.type === "bend-release" ? 1 : 0.9));
    const hold = bend ? Math.max(0.75, ramp + 0.2) : 0.75;
    let startFreq = freq;
    if (bend?.type === "prebend" || bend?.type === "release") startFreq = destFreq;

    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    osc.type = "triangle";
    osc2.type = "sine";
    this.applyBend(osc.frequency, osc2.frequency, time, startFreq, freq, destFreq, bend?.type, ramp);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(bass ? 700 : 1600, time);
    filter.frequency.exponentialRampToValueAtTime(bass ? 220 : 420, time + 0.3);
    const amp = this.out(ctx, dest, time, bass ? 0.34 : 0.14, bass ? Math.max(0.7, hold) : Math.max(0.45, hold * 0.7));
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(amp);
    osc.start(time);
    osc2.start(time);
    osc.stop(time + hold);
    osc2.stop(time + hold);
  }

  private applyBend(
    a: AudioParam,
    b: AudioParam,
    time: number,
    startFreq: number,
    fretFreq: number,
    destFreq: number,
    type: TabBendKind | undefined,
    ramp: number,
  ) {
    const safe = (hz: number) => Math.max(20, hz);
    a.setValueAtTime(safe(startFreq), time);
    b.setValueAtTime(safe(startFreq * 2.01), time);
    if (!type || type === "prebend") return;
    if (type === "bend") {
      a.exponentialRampToValueAtTime(safe(destFreq), time + ramp);
      b.exponentialRampToValueAtTime(safe(destFreq * 2.01), time + ramp);
      return;
    }
    if (type === "release") {
      a.exponentialRampToValueAtTime(safe(fretFreq), time + ramp);
      b.exponentialRampToValueAtTime(safe(fretFreq * 2.01), time + ramp);
      return;
    }
    a.exponentialRampToValueAtTime(safe(destFreq), time + ramp * 0.45);
    b.exponentialRampToValueAtTime(safe(destFreq * 2.01), time + ramp * 0.45);
    a.exponentialRampToValueAtTime(safe(fretFreq), time + ramp);
    b.exponentialRampToValueAtTime(safe(fretFreq * 2.01), time + ramp);
  }

  private noise(
    ctx: AudioContext,
    dest: AudioNode,
    time: number,
    dur: number,
    gain: number,
    freq: number,
    type: BiquadFilterType,
  ) {
    const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    src.connect(filter);
    filter.connect(this.out(ctx, dest, time, gain, dur));
    src.start(time);
    src.stop(time + dur);
  }
}

export const synth = new BandSynth();
