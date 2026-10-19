// Short pairing codes (6 digits) without a server of our own: the inviting phone leaves a small note
// in the Firebase Storage bucket the cry clips use, named after the code, for 5 minutes. The other
// phone types the code, reads the note (the usual invite), and asks to join. The inviting phone
// still has to tap Allow, so a mistyped or guessed code can't join anyone.
//
// The bucket's rules only allow new 24-character .wav names (see store/LISTEN_IN.md), so the note
// uses one, derived from the code and the 5-minute window it was made in. A name can only be
// written once and lingers until the bucket's lifecycle rule deletes it a day later, so tying it to
// the window frees the same 6 digits again 10 minutes on, rather than blocking them for a day.
// The note itself expires after 5 minutes.
import { storageBucket } from "./monitor";

export const CODE_MINUTES = 5;
const SLOT = CODE_MINUTES * 60_000;
const slotOf = (t: number) => Math.floor(t / SLOT);
export type CodeNote = { v: 1; invite: string; name: string; baby: string; exp: number };

/** The note's name for a code in a window: 24 lowercase letters/digits, the same on every phone. */
function noteName(code: string, slot: number) {
  let out = "";
  const s = `hush-pair-2:${code}:${slot}`;
  for (let k = 0; out.length < 24; k++) {
    let h = (0x811c9dc5 ^ (k * 0x9e3779b1)) >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    out += h.toString(36);
  }
  return out.slice(0, 24);
}
const urls = (code: string, slot: number) => {
  const b = storageBucket();
  if (!b) return null;
  const path = encodeURIComponent(`clips/${noteName(code, slot)}.wav`);
  return {
    put: `https://firebasestorage.googleapis.com/v0/b/${b}/o?uploadType=media&name=${path}`,
    get: `https://firebasestorage.googleapis.com/v0/b/${b}/o/${path}?alt=media`,
  };
};

/** fetch that gives up after a while instead of hanging. */
async function fetchT(url: string, init: RequestInit = {}, ms = 12_000) {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...init, signal: c.signal }); } finally { clearTimeout(id); }
}

export const newCode = () => String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");

/** Leave the note for a fresh code. Tries a few codes (a name can only be written once). */
export async function publishCode(invite: string, name: string, baby: string): Promise<{ code: string; exp: number } | "offline" | "setup"> {
  for (let i = 0; i < 4; i++) {
    const code = newCode();
    const now = Date.now();
    const u = urls(code, slotOf(now));
    if (!u) return "setup";
    const exp = now + SLOT;
    const note: CodeNote = { v: 1, invite, name, baby, exp };
    try {
      const res = await fetchT(u.put, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: JSON.stringify(note) });
      if (res.ok) return { code, exp };
      if (res.status !== 403 && res.status !== 409) return "setup";
    } catch {
      return "offline";
    }
  }
  return "setup";
}

/** Look a typed code up: made in this window or the one before (a code lives 5 minutes). */
export async function readCode(code: string): Promise<CodeNote | "missing" | "expired" | "offline"> {
  const now = slotOf(Date.now());
  let last: Awaited<ReturnType<typeof readSlot>> = "missing";
  for (const slot of [now, now - 1]) {
    last = await readSlot(code, slot);
    if (last !== "missing") return last;
  }
  return last;
}
async function readSlot(code: string, slot: number): Promise<CodeNote | "missing" | "expired" | "offline"> {
  const u = urls(code, slot);
  if (!u) return "missing";
  try {
    const res = await fetchT(u.get);
    if (res.status === 404 || res.status === 403) return "missing";
    if (!res.ok) return "offline";
    const note = JSON.parse(await res.text()) as CodeNote;
    if (note?.v !== 1 || typeof note.invite !== "string") return "missing";
    if (Date.now() > note.exp) return "expired";
    return note;
  } catch {
    return "offline";
  }
}
