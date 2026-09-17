import type { ImportedScore } from "../types";
import { useState } from "react";

export function ImportModal({
  open,
  busy,
  error,
  score,
  onClose,
  onFile,
  onAdd,
}: {
  open: boolean;
  busy: boolean;
  error: string;
  score: ImportedScore | null;
  onClose: () => void;
  onFile: (file: File) => void;
  onAdd: () => void;
}) {
  const [hot, setHot] = useState(false);
  if (!open) return null;

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Import</h2>
        <p className="meta">Guitar Pro (.gp, .gp3–.gp5, .gpx) or MIDI (.mid).</p>
        <label
          className={`drop ${hot ? "hot" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setHot(true);
          }}
          onDragLeave={() => setHot(false)}
          onDrop={(e) => {
            e.preventDefault();
            setHot(false);
            const file = e.dataTransfer.files[0];
            if (file) onFile(file);
          }}
        >
          {busy ? "Reading…" : "Drop a file or click to choose"}
          <input
            type="file"
            hidden
            accept=".gp,.gp3,.gp4,.gp5,.gpx,.gtp,.mid,.midi"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
            }}
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        {score ? (
          <>
            <h3>
              {score.title} · {score.bpm} BPM · {score.timeSig.numerator}/{score.timeSig.denominator}
            </h3>
            <div className="track-map">
              {score.tracks.map((track) => (
                <div className="track-row" key={track.index}>
                  <div>
                    <b>{track.name}</b>
                    <div className="meta">
                      {track.measures.length} bars ·{" "}
                      {track.isPercussion
                        ? "percussion"
                        : `${track.stringNames.join(" ")} · ${track.stringNames.length}-string`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="row">
              <button className="btn btn-gold" onClick={onAdd}>
                Add to setlist
              </button>
              <button className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
