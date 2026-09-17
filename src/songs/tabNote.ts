export type TabBendKind = "bend" | "prebend" | "bend-release" | "release";

export type ParsedTabNote =
  | { kind: "rest" }
  | { kind: "dead"; fret: number | null }
  | { kind: "fret"; fret: number; bend?: { type: TabBendKind; quarters: number } };

const BEND_TOKEN: Record<TabBendKind, string> = {
  bend: "b",
  prebend: "pb",
  "bend-release": "br",
  release: "r",
};

const TOKEN_BEND: Record<string, TabBendKind> = {
  b: "bend",
  pb: "prebend",
  br: "bend-release",
  r: "release",
};

/** GPIF bend floats are 25 per AlphaTab quarter-step. */
export function gpifFloatToQuarters(value: number): number {
  return Math.round(value * (1 / 25));
}

export function parseTabNote(cell: string | undefined | null): ParsedTabNote {
  const raw = (cell ?? "").trim();
  if (!raw || raw === "-") return { kind: "rest" };

  const dead = /^x(\d+)?$/i.exec(raw);
  if (dead) {
    const fret = dead[1] != null ? Number(dead[1]) : null;
    return { kind: "dead", fret: fret != null && Number.isFinite(fret) ? fret : null };
  }

  const withBend = /^(\d+)(pb|br|b|r)(\d+)$/i.exec(raw);
  if (withBend) {
    const fret = Number(withBend[1]);
    const type = TOKEN_BEND[withBend[2].toLowerCase()];
    const quarters = Number(withBend[3]);
    if (!Number.isFinite(fret) || !type || !Number.isFinite(quarters)) return { kind: "rest" };
    return { kind: "fret", fret, bend: { type, quarters } };
  }

  const plain = /^(\d+)$/.exec(raw);
  if (plain) {
    const fret = Number(plain[1]);
    if (!Number.isFinite(fret)) return { kind: "rest" };
    return { kind: "fret", fret };
  }

  return { kind: "rest" };
}

export function encodeDead(fret?: number | null): string {
  if (fret == null || !Number.isFinite(fret)) return "x";
  return `x${Math.round(fret)}`;
}

export function encodeFret(fret: number, bend?: { type: TabBendKind; quarters: number }): string {
  const n = Math.round(fret);
  if (!bend || !Number.isFinite(bend.quarters) || bend.quarters <= 0) return String(n);
  return `${n}${BEND_TOKEN[bend.type]}${Math.round(bend.quarters)}`;
}

export function encodeTabNote(note: ParsedTabNote): string {
  if (note.kind === "rest") return "-";
  if (note.kind === "dead") return encodeDead(note.fret);
  return encodeFret(note.fret, note.bend);
}

export function tabDisplay(cell: string): string {
  const note = parseTabNote(cell);
  if (note.kind === "rest") return "";
  if (note.kind === "dead") return "x";
  return String(note.fret);
}

export function isDeadCell(cell: string): boolean {
  return parseTabNote(cell).kind === "dead";
}

export function isPitchedFret(note: ParsedTabNote): note is Extract<ParsedTabNote, { kind: "fret" }> {
  return note.kind === "fret";
}

/** Skip retrigger only for the same pitched (non-dead) fret with no new bend attack. */
export function isSustainHold(prevCell: string, cell: string): boolean {
  const prev = parseTabNote(prevCell);
  const cur = parseTabNote(cell);
  if (!isPitchedFret(prev) || !isPitchedFret(cur)) return false;
  if (prev.fret !== cur.fret) return false;
  if (!cur.bend) return true;
  if (!prev.bend) return false;
  return prev.bend.type === cur.bend.type && prev.bend.quarters === cur.bend.quarters;
}

export function bendAmountLabel(quarters: number): string {
  const q = Math.round(quarters);
  if (q <= 0) return "";
  const whole = Math.floor(q / 4);
  const rem = q % 4;
  const frac = rem === 1 ? "¼" : rem === 2 ? "½" : rem === 3 ? "¾" : "";
  if (q === 4) return "full";
  if (!whole) return frac;
  if (!frac) return String(whole);
  return `${whole}${frac}`;
}

export function inferBendType(
  origin: number,
  dest: number,
  middle?: number | null,
): TabBendKind | undefined {
  const peak = Math.max(origin, dest, middle ?? 0);
  if (peak <= 0 && origin <= 0 && dest <= 0) return undefined;
  const origBent = origin >= 1;
  const wentUp = peak > origin + 0.4;
  const cameDown = dest < peak - 0.4;

  if (!origBent && wentUp && cameDown) return "bend-release";
  if (!origBent && dest >= 1) return "bend";
  if (origBent && cameDown && !wentUp) return "release";
  if (origBent && wentUp && cameDown) return "bend-release";
  if (origBent && dest > origin + 0.4) return "prebend";
  if (origBent) return "prebend";
  if (peak > 0) return "bend";
  return undefined;
}

export function bendQuarters(origin: number, dest: number, middle?: number | null): number {
  return Math.max(0, Math.round(Math.max(origin, dest, middle ?? 0)));
}

/** AlphaTab BendType: None=0 Custom=1 Bend=2 Release=3 BendRelease=4 Hold=5 Prebend=6 PrebendBend=7 PrebendRelease=8 */
export function alphatabBend(
  bendType: number,
  origin: number,
  dest: number,
  maxValue: number,
  middle?: number | null,
): { type: TabBendKind; quarters: number } | undefined {
  if (bendType === 5) return undefined;
  const inferred = inferBendType(origin, dest, middle);
  let type: TabBendKind | undefined;
  switch (bendType) {
    case 2:
      type = "bend";
      break;
    case 3:
      type = "release";
      break;
    case 4:
      type = "bend-release";
      break;
    case 6:
    case 7:
      type = "prebend";
      break;
    case 8:
      type = "release";
      break;
    case 1:
      type = inferred;
      break;
    default:
      type = inferred;
  }
  const quarters = Math.max(0, Math.round(maxValue || bendQuarters(origin, dest, middle)));
  if (!type || quarters <= 0) return undefined;
  return { type, quarters };
}
