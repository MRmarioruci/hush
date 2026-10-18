// The family: every phone that has joined with the family code. There are no fixed roles: any
// phone can start listening (it becomes the baby monitor) and every other phone gets its alerts,
// listen-in and white-noise remote.
//
// No server. Each phone keeps the list of phones in the family and they keep each other up to
// date with silent pushes. Every entry carries a time; the newest version of an entry wins (a
// rename, or a removal), so all phones end up with the same list whatever order messages arrive.
import type { Lang } from "./i18n";

export type Entry = { name: string; lang?: Lang; at: number; gone?: boolean };
export type Family = { id: string; key: string; entries: Record<string, Entry> };
/** Another phone in the family. */
export type Member = { token: string; name: string; lang?: Lang; addedAt: number };

const rand = (n: number) => Array.from({ length: n }, () => "abcdefghijkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 32)]).join("");

export function newFamily(me: string, name: string, lang?: Lang): Family {
  return { id: rand(10), key: rand(16), entries: me ? { [me]: { name, lang, at: Date.now() } } : {} };
}

/** The other phones (not this one, not removed). */
export function membersOf(f: Family | null | undefined, me: string): Member[] {
  if (!f) return [];
  return Object.entries(f.entries)
    .filter(([tok, e]) => tok !== me && !e.gone)
    .map(([token, e]) => ({ token, name: e.name, lang: e.lang, addedAt: e.at }))
    .sort((a, b) => a.addedAt - b.addedAt);
}

/** Newest entry wins, per phone. Returns null when nothing changed. */
export function mergeEntries(mine: Record<string, Entry>, theirs: Record<string, Entry>): Record<string, Entry> | null {
  let changed = false;
  const out = { ...mine };
  for (const [tok, e] of Object.entries(theirs ?? {})) {
    if (!tok.startsWith("ExponentPushToken[") || typeof e?.at !== "number") continue;
    const cur = out[tok];
    if (!cur || e.at > cur.at) {
      out[tok] = { name: String(e.name ?? "").slice(0, 40), lang: e.lang, at: e.at, ...(e.gone ? { gone: true } : {}) };
      changed = true;
    }
  }
  return changed ? out : null;
}

/** What a phone shows (QR code, or a link to send): enough for another phone to join. */
export type Invite = { app: "hush"; v: 3; id: string; key: string; token: string; name: string };
export const makeInvite = (f: Family, me: string, name: string) =>
  JSON.stringify({ app: "hush", v: 3, id: f.id, key: f.key, token: me, name } satisfies Invite);

export function readInvite(raw: string): Invite | null {
  try {
    let s = raw.trim();
    // A link: hush://join?d=<base64url>
    const m = s.match(/[?&]d=([A-Za-z0-9_-]+)/);
    if (m) s = fromB64(m[1]);
    const c = JSON.parse(s);
    if (c?.app === "hush" && c.v === 3 && typeof c.id === "string" && typeof c.key === "string" && typeof c.token === "string" && c.token.startsWith("ExponentPushToken[")) return c;
  } catch {}
  return null;
}

export const inviteLink = (invite: string) => `hush://join?d=${toB64(invite)}`;

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function toB64(s: string) {
  const bytes = utf8(s);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = bytes.slice(i, i + 3);
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : "") + (i + 2 < bytes.length ? B64[n & 63] : "");
  }
  return out;
}
function fromB64(s: string) {
  let bits = 0, val = 0;
  const bytes: number[] = [];
  for (const ch of s) {
    const i = B64.indexOf(ch);
    if (i < 0) continue;
    val = ((val << 6) | i) & 0xffffff; bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((val >> bits) & 255); }
  }
  return fromUtf8(bytes);
}
function utf8(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}
function fromUtf8(b: number[]): string {
  let out = "";
  for (let i = 0; i < b.length; ) {
    const x = b[i];
    const n = x < 0x80 ? 1 : x < 0xe0 ? 2 : x < 0xf0 ? 3 : 4;
    let c = n === 1 ? x : x & (0xff >> (n + 1));
    for (let k = 1; k < n; k++) c = (c << 6) | (b[i + k] & 63);
    out += String.fromCodePoint(c);
    i += n;
  }
  return out;
}

/** The silent message phones exchange to keep the family list in step. */
export type FamilyMsg = { type: "family"; id: string; key: string; entries: Record<string, Entry>; from: string; baby?: string };
export function readFamilyMsg(d: unknown): FamilyMsg | null {
  const x = d as FamilyMsg | undefined;
  return x?.type === "family" && typeof x.id === "string" && typeof x.key === "string" && x.entries && typeof x.from === "string" ? x : null;
}
