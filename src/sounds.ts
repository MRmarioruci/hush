export type SoundId = "womb" | "shush" | "brown" | "pink" | "white" | "ocean";

export const SOUNDS: { id: SoundId; name: string; sub: string; file: number; icon: string }[] = [
  { id: "womb", name: "Womb", sub: "A slow heartbeat, like before birth", file: require("../assets/sounds/womb.wav"),
    icon: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><path d="M8 11h2l1-2 2 4 1-2h2"/>' },
  { id: "shush", name: "Shush", sub: "Gentle, rhythmic shh… shh…", file: require("../assets/sounds/shush.wav"),
    icon: '<path d="M4 9c2-2 4 2 6 0s4-2 6 0 3 1 4 0"/><path d="M4 14c2-2 4 2 6 0s4-2 6 0 3 1 4 0"/>' },
  { id: "brown", name: "Brown", sub: "A deep, soft rumble", file: require("../assets/sounds/brown.wav"),
    icon: '<path d="M3 18l5-7 4 5 3-3 6 5z"/><circle cx="17" cy="7" r="2"/>' },
  { id: "pink", name: "Pink", sub: "Steady light rain", file: require("../assets/sounds/pink.wav"),
    icon: '<path d="M7 14a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 17 14z"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>' },
  { id: "white", name: "White", sub: "The classic fan hiss", file: require("../assets/sounds/white.wav"),
    icon: '<circle cx="12" cy="12" r="1.6"/><path d="M12 10.4c0-4 1-6 3-6s1.5 4-1.5 6.2M13.6 12c4 0 6 1 6 3s-4 1.5-6.2-1.5M12 13.6c0 4-1 6-3 6s-1.5-4 1.5-6.2M10.4 12c-4 0-6-1-6-3s4-1.5 6.2 1.5"/>' },
  { id: "ocean", name: "Ocean", sub: "Slow rolling waves", file: require("../assets/sounds/ocean.wav"),
    icon: '<path d="M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M2 19c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M6 10c1-3 4-5 7-4-2 1-2 3 0 4"/>' },
];

export const soundById = (id: SoundId) => SOUNDS.find((s) => s.id === id)!;

/** Index of the current pulse, so the moon's ripples land on the sound's own rhythm. */
export function beatIndex(id: SoundId, t: number) {
  switch (id) {
    case "womb": return Math.floor(t / 0.8) * 2 + (t % 0.8 < 0.22 ? 0 : 1); // lub, dub
    case "shush": return Math.floor(t / 2);
    case "ocean": return Math.floor(t / 8);
    default: return Math.floor(t / 3);
  }
}
