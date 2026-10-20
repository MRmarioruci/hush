// "Sleeping now", estimated: how many babies (under 2) are probably asleep in each place right
// now, from rough yearly births per country (UN figures, rounded) and how likely a baby is to be
// asleep at that local hour. Shown until hush has enough real (anonymous) counts of its own.

/** births: yearly births in millions (rounded). tz: a time zone for the local hour. */
type Area = { cc: string; name: string; tz: string; lon: number; lat: number; births: number };
export const AREAS: Area[] = [
  { cc: "IN", name: "India", tz: "Asia/Kolkata", lon: 78, lat: 22, births: 23 },
  { cc: "CN", name: "China", tz: "Asia/Shanghai", lon: 112, lat: 32, births: 9 },
  { cc: "NG", name: "Nigeria", tz: "Africa/Lagos", lon: 8, lat: 9, births: 8 },
  { cc: "PK", name: "Pakistan", tz: "Asia/Karachi", lon: 70, lat: 30, births: 6.5 },
  { cc: "ID", name: "Indonesia", tz: "Asia/Jakarta", lon: 113, lat: -3, births: 4.5 },
  { cc: "ET", name: "Ethiopia", tz: "Africa/Addis_Ababa", lon: 39, lat: 9, births: 4 },
  { cc: "CD", name: "DR Congo", tz: "Africa/Kinshasa", lon: 23, lat: -3, births: 4 },
  { cc: "US", name: "United States (East)", tz: "America/New_York", lon: -80, lat: 38, births: 1.9 },
  { cc: "US", name: "United States (West)", tz: "America/Los_Angeles", lon: -119, lat: 37, births: 0.8 },
  { cc: "US", name: "United States (Central)", tz: "America/Chicago", lon: -95, lat: 36, births: 0.9 },
  { cc: "BD", name: "Bangladesh", tz: "Asia/Dhaka", lon: 90, lat: 24, births: 3 },
  { cc: "BR", name: "Brazil", tz: "America/Sao_Paulo", lon: -47, lat: -15, births: 2.6 },
  { cc: "EG", name: "Egypt", tz: "Africa/Cairo", lon: 30, lat: 27, births: 2.2 },
  { cc: "TZ", name: "Tanzania", tz: "Africa/Dar_es_Salaam", lon: 35, lat: -6, births: 2.2 },
  { cc: "MX", name: "Mexico", tz: "America/Mexico_City", lon: -100, lat: 21, births: 1.9 },
  { cc: "PH", name: "Philippines", tz: "Asia/Manila", lon: 122, lat: 13, births: 1.7 },
  { cc: "UG", name: "Uganda", tz: "Africa/Kampala", lon: 32, lat: 1, births: 1.6 },
  { cc: "KE", name: "Kenya", tz: "Africa/Nairobi", lon: 38, lat: 0, births: 1.5 },
  { cc: "VN", name: "Vietnam", tz: "Asia/Ho_Chi_Minh", lon: 106, lat: 15, births: 1.4 },
  { cc: "RU", name: "Russia", tz: "Europe/Moscow", lon: 40, lat: 56, births: 1.3 },
  { cc: "AF", name: "Afghanistan", tz: "Asia/Kabul", lon: 67, lat: 34, births: 1.3 },
  { cc: "IR", name: "Iran", tz: "Asia/Tehran", lon: 53, lat: 32, births: 1.1 },
  { cc: "ZA", name: "South Africa", tz: "Africa/Johannesburg", lon: 25, lat: -29, births: 1.1 },
  { cc: "TR", name: "Türkiye", tz: "Europe/Istanbul", lon: 35, lat: 39, births: 1 },
  { cc: "SD", name: "Sudan", tz: "Africa/Khartoum", lon: 30, lat: 15, births: 1.4 },
  { cc: "DZ", name: "Algeria", tz: "Africa/Algiers", lon: 3, lat: 28, births: 0.9 },
  { cc: "SA", name: "Saudi Arabia", tz: "Asia/Riyadh", lon: 45, lat: 24, births: 0.6 },
  { cc: "JP", name: "Japan", tz: "Asia/Tokyo", lon: 138, lat: 36, births: 0.73 },
  { cc: "KR", name: "South Korea", tz: "Asia/Seoul", lon: 128, lat: 36, births: 0.24 },
  { cc: "TH", name: "Thailand", tz: "Asia/Bangkok", lon: 101, lat: 15, births: 0.5 },
  { cc: "MM", name: "Myanmar", tz: "Asia/Yangon", lon: 96, lat: 21, births: 0.9 },
  { cc: "GB", name: "United Kingdom", tz: "Europe/London", lon: -2, lat: 53, births: 0.68 },
  { cc: "FR", name: "France", tz: "Europe/Paris", lon: 2, lat: 47, births: 0.68 },
  { cc: "DE", name: "Germany", tz: "Europe/Berlin", lon: 10, lat: 51, births: 0.69 },
  { cc: "IT", name: "Italy & Malta", tz: "Europe/Rome", lon: 12, lat: 43, births: 0.38 },
  { cc: "ES", name: "Spain & Portugal", tz: "Europe/Madrid", lon: -4, lat: 40, births: 0.41 },
  { cc: "PL", name: "Poland & the Baltics", tz: "Europe/Warsaw", lon: 20, lat: 52, births: 0.33 },
  { cc: "GR", name: "Greece & the Balkans", tz: "Europe/Athens", lon: 22, lat: 41, births: 0.3 },
  { cc: "UA", name: "Ukraine & Romania", tz: "Europe/Kyiv", lon: 28, lat: 48, births: 0.45 },
  { cc: "SE", name: "Nordics", tz: "Europe/Stockholm", lon: 15, lat: 61, births: 0.27 },
  { cc: "NL", name: "Benelux", tz: "Europe/Amsterdam", lon: 5, lat: 51, births: 0.29 },
  { cc: "CO", name: "Colombia & Venezuela", tz: "America/Bogota", lon: -73, lat: 6, births: 0.95 },
  { cc: "PE", name: "Peru & Ecuador", tz: "America/Lima", lon: -76, lat: -8, births: 0.85 },
  { cc: "AR", name: "Argentina & Chile", tz: "America/Argentina/Buenos_Aires", lon: -64, lat: -33, births: 0.68 },
  { cc: "CA", name: "Canada", tz: "America/Toronto", lon: -85, lat: 50, births: 0.35 },
  { cc: "AU", name: "Australia", tz: "Australia/Sydney", lon: 145, lat: -30, births: 0.3 },
  { cc: "GH", name: "Ghana & Côte d'Ivoire", tz: "Africa/Accra", lon: -3, lat: 7, births: 1.8 },
  { cc: "AO", name: "Angola & Zambia", tz: "Africa/Luanda", lon: 20, lat: -13, births: 1.8 },
  { cc: "MA", name: "Morocco", tz: "Africa/Casablanca", lon: -6, lat: 32, births: 0.6 },
  { cc: "IQ", name: "Iraq & Syria", tz: "Asia/Baghdad", lon: 42, lat: 34, births: 1.6 },
  { cc: "UZ", name: "Central Asia", tz: "Asia/Tashkent", lon: 66, lat: 41, births: 1.6 },
  { cc: "NP", name: "Nepal", tz: "Asia/Kathmandu", lon: 84, lat: 28, births: 0.55 },
  { cc: "MY", name: "Malaysia & Singapore", tz: "Asia/Kuala_Lumpur", lon: 102, lat: 3, births: 0.5 },
];

/** The hour (0–24, with minutes) in a time zone. */
export function localHour(tz: string, now: number): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now));
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0), m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    return h + m / 60;
  } catch {
    return new Date(now).getUTCHours();
  }
}

/** How likely a baby under 2 is to be asleep at a local hour (night, naps, and in between). */
export function asleepShare(h: number): number {
  if (h >= 21 || h < 5.5) return 0.9;
  if (h < 6.5) return 0.7;
  if (h < 7.5) return 0.4;
  if (h < 9) return 0.15;
  if (h < 11.5) return 0.3; // morning nap
  if (h < 12.5) return 0.25;
  if (h < 15.5) return 0.42; // afternoon nap
  if (h < 18) return 0.15;
  if (h < 19) return 0.12;
  if (h < 20) return 0.35;
  return 0.65;
}
export const isNight = (h: number) => h >= 19 || h < 7;

export type Spot = Area & { n: number; night: boolean; hour: number };
/** Every area right now: babies probably asleep there (under 2 ≈ two years of births). */
export function estimate(now = Date.now()): Spot[] {
  return AREAS.map((a) => {
    const hour = localHour(a.tz, now);
    return { ...a, hour, night: isNight(hour), n: Math.round(a.births * 2e6 * asleepShare(hour)) };
  });
}

/** Where the sun is overhead right now (for the night side). */
export function subsolar(now = Date.now()): [number, number] {
  const d = new Date(now);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const day = (now - start) / 864e5;
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (day + 10));
  const hours = d.getUTCHours() + d.getUTCMinutes() / 60;
  return [(12 - hours) * 15, decl];
}

/** This phone's area: the same time zone, or the nearest place with the same UTC offset. */
export function myArea(spots: Spot[], now = Date.now()): Spot | null {
  let tz = "";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""; } catch {}
  const same = spots.find((s) => s.tz === tz);
  if (same) return same;
  const mine = localHour(tz || "UTC", now);
  const region = tz.split("/")[0];
  const near = spots.filter((s) => Math.abs(s.hour - mine) < 0.6);
  return near.find((s) => s.tz.startsWith(region)) ?? near[0] ?? null;
}

/** 23,400,000 → "23.4M", 412,000 → "412K". */
export function short(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}
