import type { Playhead, Player, Song, TabTrack, TrackKind } from "../types";
import { DrumStaff } from "./DrumStaff";
import { LyricsView } from "./LyricsView";
import { TabStaff } from "./TabStaff";

const accent: Record<TrackKind, string> = {
  guitar: "var(--lead)",
  bass: "var(--bass)",
  drums: "var(--drums)",
};

export function Stage({
  song,
  songs,
  playhead,
  players,
  youId,
  isHost,
  roomCode,
  bpm,
  countInBars,
  connected,
  view,
  previewing,
  muted,
  volume,
  synthOn,
  mutedParts,
  onView,
  onPlay,
  onStop,
  onSong,
  onBpm,
  onCountIn,
  onInstrument,
  onBar,
  onImport,
  onConnect,
  onLeave,
  onRemoveSong,
  onPreview,
  onVolume,
  onSynth,
  onTogglePart,
}: {
  song: Song;
  songs: Song[];
  playhead: Playhead;
  players: Player[];
  youId: string;
  isHost: boolean;
  roomCode: string;
  bpm: number;
  countInBars: number;
  connected: boolean;
  view: string;
  previewing: boolean;
  muted: boolean;
  volume: number;
  synthOn: boolean;
  mutedParts: Partial<Record<string, boolean>>;
  onView: (view: string) => void;
  onPlay: () => void;
  onStop: () => void;
  onSong: (id: string) => void;
  onBpm: (bpm: number) => void;
  onCountIn: (bars: number) => void;
  onInstrument: (id: string) => void;
  onBar: (bar: number) => void;
  onImport: () => void;
  onConnect: () => void;
  onLeave: () => void;
  onRemoveSong: () => void;
  onPreview: () => void;
  onVolume: (v: number) => void;
  onSynth: (on: boolean) => void;
  onTogglePart: (part: string) => void;
}) {
  const visible: TabTrack[] =
    view === "score" ? song.tracks : view === "vocals" ? [] : song.tracks.filter((t) => t.id === view);

  function pickTab(id: string) {
    onView(id);
    if (id === "score") return;
    if (id === "vocals") {
      onInstrument("vocals");
      return;
    }
    const track = song.tracks.find((t) => t.id === id);
    onInstrument(track?.name ?? id);
  }

  return (
    <div className="stage">
      {playhead.phase === "countin" ? (
        <div className="countin">
          <b>{playhead.countInBeat}</b>
        </div>
      ) : null}

      <header className="topbar">
        <div className="song-now">
          <strong>{song.title}</strong>
          <span>
            {song.artist} · {song.timeSig.numerator}/{song.timeSig.denominator}
            {song.source && song.source !== "built-in" ? ` · ${song.source}` : ""}
          </span>
        </div>
        <div className="room-pill">
          <span className={`status-dot ${connected ? "" : "off"}`} />
          <span className="room-code">{roomCode}</span>
          <button className="btn btn-ghost" onClick={onConnect}>
            Devices
          </button>
          <button className="btn btn-ghost" onClick={onLeave}>
            Leave
          </button>
        </div>
      </header>

      <div className="hud">
        <div className="beats">
          {Array.from({ length: song.timeSig.numerator }, (_, i) => {
            const n = i + 1;
            const on =
              (playhead.phase === "song" && playhead.beat === n) ||
              (playhead.phase === "countin" && playhead.countInBeat === n);
            return <div key={n} className={`beat ${on ? (n === 1 ? "on" : "sub") : ""}`} />;
          })}
        </div>
        <div className="clock">
          <div className="section">{playhead.sectionName || "Ready"}</div>
          <div className="bar">
            BAR {playhead.bar + 1}
            <span className="meta"> · {playhead.beat}</span>
          </div>
        </div>
        <div className="players">
          {players.map((p) => (
            <span key={p.id} className={`player ${p.id === youId || p.isHost ? "host" : ""}`}>
              {p.name} · {p.instrument}
              {p.isHost ? " · host" : ""}
            </span>
          ))}
        </div>
      </div>

      {song.sections.length > 1 ? (
        <div className="section-jump">
          {song.sections.map((section) => {
            const on =
              playhead.bar >= section.startBar && playhead.bar < section.startBar + Math.max(1, section.bars);
            return (
              <button
                key={`${section.name}-${section.startBar}`}
                type="button"
                className={`section-chip ${on ? "on" : ""}`}
                onClick={() => onBar(section.startBar)}
              >
                {section.name}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="tabs-wrap">
        {view === "vocals" || (view === "score" && (song.lyrics?.length ?? 0) > 0) ? (
          <LyricsView song={song} playhead={playhead} onSelectBar={onBar} />
        ) : null}
        {view === "vocals" ? null : visible.length ? (
          visible.map((track) => (
            <div key={track.id} style={{ marginBottom: 12 }}>
              {track.kind === "drums" ? (
                <DrumStaff
                  track={track}
                  playhead={playhead}
                  beatsPerBar={song.timeSig.numerator}
                  onSelectBar={onBar}
                />
              ) : (
                <TabStaff
                  track={track}
                  playhead={playhead}
                  beatsPerBar={song.timeSig.numerator}
                  onSelectBar={onBar}
                />
              )}
            </div>
          ))
        ) : (
          <p className="meta">No tab for this part.</p>
        )}
      </div>

      <footer className="transport">
        {isHost ? (
          <>
            <button className="btn btn-play" onClick={onPlay}>
              Play
            </button>
            <button className="btn btn-stop" onClick={onStop}>
              Stop
            </button>
          </>
        ) : (
          <span className="meta">Wait for host</span>
        )}
        <label className="range">
          Count-in
          <select
            value={countInBars}
            disabled={!isHost}
            onChange={(e) => onCountIn(Number(e.target.value))}
          >
            <option value={0}>Off</option>
            <option value={1}>1 bar</option>
            <option value={2}>2 bars</option>
          </select>
        </label>
        <label className="range">
          BPM {bpm}
          <input
            type="range"
            min={60}
            max={220}
            value={bpm}
            disabled={!isHost}
            onChange={(e) => onBpm(Number(e.target.value))}
          />
        </label>
        <button className="btn btn-ghost" onClick={onPreview}>
          {previewing ? "Stop click" : "Preview click"}
        </button>
        <label className="range">
          Vol
          <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => onVolume(Number(e.target.value))} />
        </label>
        <label className="range">
          Tab
          <select value={view} onChange={(e) => pickTab(e.target.value)}>
            {song.tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.name}
                {track.kind !== "drums" && track.stringNames.length
                  ? ` · ${track.stringNames.join(" ")}`
                  : ""}
              </option>
            ))}
            <option value="vocals">Vocals</option>
            <option value="score">All tracks</option>
          </select>
        </label>
        <div className="mixer">
          <button className={`chip ${synthOn ? "active" : ""}`} onClick={() => onSynth(!synthOn)}>
            Synth {synthOn ? "on" : "off"}
          </button>
          {song.tracks.map((track) => (
            <button
              key={track.id}
              className={`chip ${synthOn && !mutedParts[track.id] ? "active" : ""}`}
              style={{ ["--accent" as string]: accent[track.kind] }}
              onClick={() => onTogglePart(track.id)}
            >
              {track.name}
            </button>
          ))}
          <button className={`chip ${!muted && !mutedParts.click ? "active" : ""}`} onClick={() => onTogglePart("click")}>
            Click
          </button>
        </div>
        <select value={song.id} disabled={!isHost} onChange={(e) => onSong(e.target.value)}>
          {songs.some((s) => s.source !== "built-in") ? (
            <optgroup label="Setlist">
              {songs
                .filter((s) => s.source !== "built-in")
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
            </optgroup>
          ) : null}
          <optgroup label="Demos">
            {songs
              .filter((s) => s.source === "built-in")
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
          </optgroup>
        </select>
        {isHost ? (
          <button className="btn btn-ghost" onClick={onImport}>
            Import GP / MIDI
          </button>
        ) : null}
        {isHost && song.source && song.source !== "built-in" ? (
          <button className="btn btn-ghost" onClick={onRemoveSong}>
            Remove from setlist
          </button>
        ) : null}
      </footer>
    </div>
  );
}
