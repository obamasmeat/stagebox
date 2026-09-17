import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { engine } from "./audio/engine";
import { synth } from "./audio/synth";
import { ConnectModal } from "./components/ConnectModal";
import { ImportModal } from "./components/ImportModal";
import { Lobby } from "./components/Lobby";
import { Stage } from "./components/Stage";
import { findSong, BUILTIN_SONGS, allSongs } from "./songs/library";
import { parseScoreFile, songFromImport, normalizeSong, defaultViewFor } from "./songs/importFile";
import { mergeSavedSongs, upsertSavedSong, removeSavedSong, loadSavedLibrary } from "./songs/libraryStore";
import { sectionAt } from "./songs/grid";
import { SyncClient } from "./sync/client";
import type { ImportedScore, InstrumentId, Playhead, RoomState } from "./types";

function EasterBg() {
  return (
    <div className="easter-bg" aria-hidden="true">
      <img src="/easter-beach.png" alt="" className="easter-left" />
      <img src="/easter-beach.png" alt="" className="easter-right" />
    </div>
  );
}

const idleHead: Playhead = {
  phase: "idle",
  countInBeat: 0,
  bar: 0,
  beat: 1,
  slot: 0,
  slotExact: 0,
  sectionName: "Ready",
};

export default function App() {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [youId, setYouId] = useState("");
  const [error, setError] = useState("");
  const [lanUrls, setLanUrls] = useState<string[]>([]);
  const [playhead, setPlayhead] = useState<Playhead>(idleHead);
  const [view, setView] = useState("lead");
  const [importOpen, setImportOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [score, setScore] = useState<ImportedScore | null>(null);
  const [volume, setVolume] = useState(0.7);
  const [muted, setMuted] = useState(false);
  const [synthOn, setSynthOn] = useState(true);
  const [mutedParts, setMutedParts] = useState<Partial<Record<string, boolean>>>({});
  const [previewing, setPreviewing] = useState(false);
  const [connected, setConnected] = useState(false);
  const lastPlayAt = useRef(0);
  const hydratedRoom = useRef("");

  const client = useMemo(
    () =>
      new SyncClient({
        onJoined: (id, next) => {
          setYouId(id);
          setRoom(next);
          setError("");
          mergeSavedSongs(next.customSongs, next.songId);
        },
        onState: (next) => {
          setRoom(next);
          mergeSavedSongs(next.customSongs, next.songId);
        },
        onError: (message) => setError(message),
        onLanUrls: (urls) => setLanUrls(urls),
      }),
    [],
  );

  useEffect(() => {
    fetch("/api/info")
      .then((r) => r.json())
      .then((info: { lanUrls?: string[] }) => {
        if (info.lanUrls?.length) setLanUrls(info.lanUrls);
      })
      .catch(() => undefined);
    client.connect();
    return () => client.leave();
  }, [client]);

  useEffect(() => {
    const timer = window.setInterval(() => setConnected(client.connected), 400);
    return () => window.clearInterval(timer);
  }, [client]);

  const songs = allSongs(room?.customSongs ?? []);
  const song = normalizeSong(room ? findSong(room.songId, room.customSongs) ?? BUILTIN_SONGS[0] : BUILTIN_SONGS[0]);
  const you = room?.players.find((p) => p.id === youId);
  const isHost = you?.isHost ?? false;

  useEffect(() => {
    if (!room || !isHost) return;
    if (hydratedRoom.current === room.code) return;
    hydratedRoom.current = room.code;
    const local = loadSavedLibrary();
    if (local.songs.length) client.syncLibrary(local.songs);
  }, [room?.code, isHost, client]);

  useEffect(() => {
    engine.setVolume(volume);
    engine.setMuted(muted || Boolean(mutedParts.click));
    synth.setVolume(volume);
    synth.setEnabled(synthOn);
    for (const track of song.tracks) {
      synth.setMuted(track.id, Boolean(mutedParts[track.id]));
    }
    synth.setMuted("click", muted || Boolean(mutedParts.click));
  }, [volume, muted, synthOn, mutedParts, song]);

  useEffect(() => {
    if (!room || !song) return;
    if (room.playing && room.playAtServerTime && room.playAtServerTime !== lastPlayAt.current) {
      lastPlayAt.current = room.playAtServerTime;
      void engine.unlock();
      engine.startSong({
        song,
        bpm: room.bpm,
        countInBars: room.countInBars,
        startBar: room.startBar,
        localPlayAt: client.localPlayAt(room.playAtServerTime),
      });
      setPreviewing(false);
    } else if (!room.playing && lastPlayAt.current) {
      lastPlayAt.current = 0;
      engine.stop();
      setPlayhead({ ...idleHead, bar: room.startBar, sectionName: sectionAt(song, room.startBar) || "Ready" });
    }
  }, [room, song, client]);

  useEffect(() => {
    if (!room?.playing && !previewing) return;
    let raf = 0;
    const loop = () => {
      setPlayhead(engine.getPlayhead());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [room?.playing, previewing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isHost || !room) return;
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) {
        e.preventDefault();
        if (room.playing) client.send({ type: "stop" });
        else client.send({ type: "play", startBar: playhead.phase === "song" ? playhead.bar : room.startBar });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isHost, room, client, playhead]);

  useEffect(() => {
    setView((prev) => defaultViewFor(song, you?.instrument ?? "guitar", prev));
  }, [song.id, you?.instrument]);

  const onCreate = useCallback(
    (name: string, instrument: InstrumentId) => {
      setView(instrument);
      void engine.unlock();
      client.join("", name, instrument, true);
    },
    [client],
  );

  const onJoin = useCallback(
    (code: string, name: string, instrument: InstrumentId) => {
      setView(instrument);
      void engine.unlock();
      client.join(code, name, instrument, true);
    },
    [client],
  );

  async function onFile(file: File) {
    setBusy(true);
    setImportError("");
    try {
      const next = await parseScoreFile(file);
      setScore(next);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Could not read that file.");
      setScore(null);
    } finally {
      setBusy(false);
    }
  }

  if (!room) {
    return (
      <>
        <EasterBg />
        <Lobby lanUrls={lanUrls} error={error} onCreate={onCreate} onJoin={onJoin} />
      </>
    );
  }

  return (
    <>
      <EasterBg />
      <Stage
        song={song}
        songs={songs}
        playhead={
          room.playing || previewing
            ? playhead
            : { ...idleHead, bar: room.startBar, sectionName: sectionAt(song, room.startBar) || "Ready" }
        }
        players={room.players}
        youId={youId}
        isHost={isHost}
        roomCode={room.code}
        bpm={room.bpm}
        countInBars={room.countInBars}
        connected={connected}
        view={view}
        previewing={previewing}
        muted={muted}
        volume={volume}
        synthOn={synthOn}
        mutedParts={mutedParts}
        onView={setView}
        onPlay={() => client.send({ type: "play", startBar: room.startBar })}
        onStop={() => client.send({ type: "stop" })}
        onSong={(id) => {
          const picked = findSong(id, room.customSongs);
          client.send({ type: "setSong", songId: id });
          if (picked) client.send({ type: "setBpm", bpm: picked.bpm });
        }}
        onBpm={(bpm) => client.send({ type: "setBpm", bpm })}
        onCountIn={(bars) => client.send({ type: "setCountIn", bars })}
        onInstrument={(instrument) => client.send({ type: "instrument", instrument })}
        onBar={(bar) => {
          if (!isHost) return;
          if (room.playing) client.send({ type: "play", startBar: bar });
          else client.send({ type: "seek", startBar: bar });
        }}
        onImport={() => {
          setImportOpen(true);
          setImportError("");
        }}
        onConnect={() => setConnectOpen(true)}
        onLeave={() => {
          hydratedRoom.current = "";
          client.leave();
          setRoom(null);
          engine.stop();
        }}
        onRemoveSong={() => {
          if (!isHost || song.source === "built-in") return;
          removeSavedSong(song.id);
          client.removeSong(song.id);
        }}
        onPreview={() => {
          if (previewing) {
            engine.stopPreview();
            setPreviewing(false);
          } else {
            engine.startPreview(room.bpm, song.timeSig);
            setPreviewing(true);
          }
        }}
        onVolume={setVolume}
        onSynth={setSynthOn}
        onTogglePart={(part) => {
          if (part === "click") {
            setMuted((m) => !m);
            return;
          }
          setMutedParts((cur) => ({ ...cur, [part]: !cur[part] }));
        }}
      />
      <ImportModal
        open={importOpen}
        busy={busy}
        error={importError}
        score={score}
        onClose={() => setImportOpen(false)}
        onFile={onFile}
        onAdd={() => {
          if (!score) return;
          const built = songFromImport(score);
          upsertSavedSong(built);
          client.addSong(built);
          setImportOpen(false);
          setScore(null);
        }}
      />
      <ConnectModal
        open={connectOpen}
        code={room.code}
        lanUrls={lanUrls}
        onClose={() => setConnectOpen(false)}
      />
      {error ? (
        <p className="error" style={{ position: "fixed", bottom: 12, left: 16 }}>
          {error}
        </p>
      ) : null}
    </>
  );
}
