import { useEffect, useState } from "react";
import type { InstrumentId } from "../types";
import { INSTRUMENTS } from "../types";

const accent: Record<string, string> = {
  guitar: "var(--lead)",
  bass: "var(--bass)",
  drums: "var(--drums)",
  vocals: "var(--vocals)",
};

export function Lobby({
  error,
  onCreate,
  onJoin,
}: {
  lanUrls: string[];
  error: string;
  onCreate: (name: string, instrument: InstrumentId) => void;
  onJoin: (code: string, name: string, instrument: InstrumentId) => void;
}) {
  const [name, setName] = useState(localStorage.getItem("sb-name") || "");
  const [code, setCode] = useState(new URLSearchParams(location.search).get("room") || "");
  const [instrument, setInstrument] = useState<InstrumentId>(() => {
    const saved = localStorage.getItem("sb-inst");
    if (saved === "lead" || saved === "rhythm" || saved === "guitar") return "guitar";
    if (saved === "bass" || saved === "drums" || saved === "vocals") return saved;
    return "guitar";
  });

  useEffect(() => {
    localStorage.setItem("sb-name", name);
    localStorage.setItem("sb-inst", instrument);
  }, [name, instrument]);

  const ready = name.trim().length > 0;

  return (
    <div className="lobby">
      <section className="lobby-main">
        <h1>Stagebox</h1>
        <div className="form">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          </label>
          <label>
            Part
            <div className="instrument-grid">
              {INSTRUMENTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`chip ${instrument === item.id ? "active" : ""}`}
                  style={{ ["--accent" as string]: accent[item.id] }}
                  onClick={() => setInstrument(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </label>
          <div className="row">
            <button className="btn btn-gold grow" disabled={!ready} onClick={() => onCreate(name, instrument)}>
              Start room
            </button>
          </div>
          <label>
            Room code
            <div className="row">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="K7RM"
                maxLength={4}
              />
              <button
                className="btn btn-ghost"
                disabled={!ready || code.trim().length !== 4}
                onClick={() => onJoin(code, name, instrument)}
              >
                Join
              </button>
            </div>
          </label>
          {error ? <p className="error">{error}</p> : null}
        </div>
      </section>
    </div>
  );
}
