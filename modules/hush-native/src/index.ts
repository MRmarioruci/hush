import { requireOptionalNativeModule } from "expo";

type Subscription = { remove(): void };

export type VolumeState = { step: number; max: number };
export type CryStatus = { score?: number; level?: number; crying?: boolean; top?: number; topScore?: number; error?: string; /** a parent made this phone the baby monitor */ monitorBy?: string; /** another phone took over as the baby monitor */ monitorOffBy?: string };

type VolumeNative = {
  getVolume(): VolumeState;
  setStep(step: number): VolumeState;
  setCeiling(step: number): VolumeState;
  addListener(event: "onVolumeChange", cb: (s: VolumeState) => void): Subscription;
};

type CryNative = {
  configure(threshold: number, babyName: string, tokens: string[], delaySeconds: number): void;
  start(): boolean;
  stop(): boolean;
  isListening(): boolean;
  takeEvents(): string;
  setTexts(texts: Record<string, string>): void;
  setTargets(list: Record<string, string>[]): void;
  isBatteryExempt(): boolean;
  requestBatteryExempt(): boolean;
  installer(): string;
  battery?(): [number, boolean];
  reportRoom?(): boolean;
  deviceName?(): string;
  artworkFile?(resource: string): string;
  setMonitor?(on: boolean): void;
  setVisible?(on: boolean): void;
  isMonitoring?(): boolean;
  rooms?(): string;
  setTile?(playing: boolean): void;
  listenSince?(): number;
  takeUnmonitored?(): string | null;
  inCall?(): boolean;
  setCloud?(apiKey: string, projectId: string, room: string, phone: string, refreshToken: string): boolean;
  setBaby?(name: string): void;
  lastClip?(): string;
  playClip?(url: string): boolean;
  stopClip?(): void;
  clipPlaying?(): boolean;
  refreshWidgets?(): void;
  takeDeadTokens?(): string[];
  sendAlert(tokens: string[], body: string, kind: string): Promise<{ ok: boolean; detail: string }>;
  recordClip(seconds: number, uploadUrl: string): Promise<{ ok: boolean; detail: string }>;
  setRoom?(playing: boolean, sound: string): void;
  setMe?(token: string, name: string): void;
  setListen?(allow: boolean, bucket: string, notice: string, cryClip: number): void;
  diagMark?(what: string): void;
  diagMemory?(what: string): void;
  diagReport?(): string;
  addListener(event: "onStatus", cb: (s: CryStatus) => void): Subscription;
  addListener(event: "onCry", cb: (e: { at: number; first: boolean }) => void): Subscription;
  addListener(event: "onData", cb: (d: Record<string, unknown>) => void): Subscription;
  // iOS only
  micPermission?(): "granted" | "denied" | "undetermined";
  requestMic?(): Promise<boolean>;
};

// HushVolume is Android only (iOS doesn't let apps set the volume; see src/safety.ts).
// HushCry exists on Android and iOS. On web both are null and the app falls back gracefully.
const volume = requireOptionalNativeModule<VolumeNative>("HushVolume");
const cry = requireOptionalNativeModule<CryNative>("HushCry");

export const deviceVolume = volume
  ? {
      get: () => volume.getVolume(),
      setStep: (step: number) => volume.setStep(Math.round(step)),
      setCeiling: (step: number) => volume.setCeiling(Math.round(step)),
      onChange: (cb: (s: VolumeState) => void) => volume.addListener("onVolumeChange", cb),
    }
  : null;

export const cryDetector = cry
  ? {
      configure: (threshold: number, babyName: string, tokens: string[], delaySeconds = 0) => cry.configure(threshold, babyName, tokens, delaySeconds),
      start: () => cry.start(),
      stop: () => cry.stop(),
      isListening: () => cry.isListening(),
      takeEvents: () => cry.takeEvents(),
      setTexts: (texts: Record<string, string>) => cry.setTexts(texts),
      setTargets: (list: Record<string, string>[]) => { try { cry.setTargets(list); } catch {} },
      isBatteryExempt: () => cry.isBatteryExempt(),
      requestBatteryExempt: () => cry.requestBatteryExempt(),
      installer: () => { try { return cry.installer(); } catch { return ""; } },
      /** This phone's battery: [percent or -1, plugged in]. */
      /** Tell the family's phones now whether this phone is listening. */
      reportRoom: () => { try { cry.reportRoom?.(); } catch {} },
      /** The phone's own name as people know it ("Redmi Note 14", "Pixel 8"), or "" if unknown. */
      /** Push addresses the native side found dead (DeviceNotRegistered) since last asked. */
      takeDeadTokens: (): string[] => { try { return cry.takeDeadTokens?.() ?? []; } catch { return []; } },
      /** The latest recording that reached this phone (kept natively, also with hush's screens asleep). */
      lastClip: (): { url?: string; at: number; seconds?: number; error?: string; auto?: boolean; got: number } | null => {
        try { const r = cry.lastClip?.() ?? ""; return r ? JSON.parse(r) : null; } catch { return null; }
      },
      /** Play a recording natively (the widget's Play), and stop it. */
      playClip: (url: string): boolean => { try { return cry.playClip?.(url) ?? false; } catch { return false; } },
      stopClip: () => { try { cry.stopClip?.(); } catch {} },
      clipPlaying: (): boolean => { try { return cry.clipPlaying?.() ?? false; } catch { return false; } },
      refreshWidgets: () => { try { cry.refreshWidgets?.(); } catch {} },
      /** This phone is the baby monitor (true), or the mic only serves smart volume (false: nothing is sent). */
      setMonitor: (on: boolean) => { try { cry.setMonitor?.(on); } catch {} },
      /** Whether hush is on screen: the mic's frequent level updates are only sent then. */
      setVisible: (on: boolean) => { try { cry.setVisible?.(on); } catch {} },
      /** Listening as the baby monitor (the mic can also be on just for smart volume). */
      isMonitoring: (): boolean => { try { return cry.isMonitoring?.() ?? cry.isListening(); } catch { return false; } },
      /** Room reports from the other phones that arrived natively (also while hush was closed). */
      rooms: (): Record<string, Record<string, unknown>> => { try { return JSON.parse(cry.rooms?.() ?? "{}") ?? {}; } catch { return {}; } },
      /** Another phone took over as the baby monitor while hush wasn't running: who (once), or null. */
      takeUnmonitored: (): string | null => { try { return cry.takeUnmonitored?.() ?? null; } catch { return null; } },
      /** When this phone became the baby monitor (0 = it isn't). */
      listenSince: (): number => { try { return cry.listenSince?.() ?? 0; } catch { return 0; } },
      /** What the Quick Settings tile shows (white noise here, or in the baby's room for its remote). */
      setTile: (playing: boolean) => { try { cry.setTile?.(playing); } catch {} },
      /** A call is on or ringing (a pause then is an interruption). */
      inCall: (): boolean => { try { return cry.inCall?.() ?? false; } catch { return false; } },
      /** The family's cloud room, so the native side keeps this phone's state there while hush sleeps ("" room = none). */
      setCloud: (apiKey: string, projectId: string, room: string, phone: string, refreshToken: string) => { try { cry.setCloud?.(apiKey, projectId, room, phone, refreshToken); } catch {} },
      /** The baby's name, kept natively so a woken phone answers with it. */
      setBaby: (name: string) => { try { cry.setBaby?.(name); } catch {} },
      /** The app's moon as a file:// URL for the playback notification, or "" (Android only). */
      artworkFile: (resource: string): string => { try { return cry.artworkFile?.(resource) ?? ""; } catch { return ""; } },
      deviceName: (): string => { try { return (cry.deviceName?.() ?? "").trim().slice(0, 30); } catch { return ""; } },
      battery: (): [number, boolean] | null => { try { return cry.battery?.() ?? null; } catch { return null; } },
      sendAlert: (tokens: string[], body: string, kind = "info") => cry.sendAlert(tokens, body, kind),
      /** Uploads the last few seconds heard (kept in memory while listening) as a WAV to uploadUrl. */
      recordClip: (seconds: number, uploadUrl: string) => cry.recordClip(seconds, uploadUrl),
      /** Android: the native listener reports the room and answers "status"/"clip" itself. */
      setRoom: (playing: boolean, sound: string) => { try { cry.setRoom?.(playing, sound); } catch {} },
      /** Who this phone is, for the room reports the native listener sends. */
      setMe: (token: string, name: string) => { try { cry.setMe?.(token, name); } catch {} },
      /** cryClip: seconds of sound sent after each crying alert (0 = none). */
      setListen: (allow: boolean, bucket: string, notice: string, cryClip = 0) => { try { cry.setListen?.(allow, bucket, notice, cryClip); } catch {} },
      onStatus: (cb: (s: CryStatus) => void) => cry.addListener("onStatus", cb),
      onCry: (cb: (e: { at: number; first: boolean }) => void) => cry.addListener("onCry", cb),
      /** iOS: silent push messages (expo-notifications only reports visible ones there). */
      onData: (cb: (d: Record<string, unknown>) => void) => { try { return cry.addListener("onData", cb); } catch { return { remove() {} }; } },
      micPermission: () => cry.micPermission?.() ?? "undetermined",
      requestMic: () => cry.requestMic?.() ?? Promise.resolve(false),
    }
  : null;

/** Android diagnostics (no personal data): marks from JS and a report to share. */
export const diag = {
  mark: (what: string) => { try { cry?.diagMark?.(what); } catch {} },
  /** Note memory use now (Java and native heaps, plus the JS heap given). */
  memory: (what: string) => { try { cry?.diagMemory?.(what); } catch {} },
  report: (): string => { try { return cry?.diagReport?.() ?? ""; } catch { return ""; } },
};
