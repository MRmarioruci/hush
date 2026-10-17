import { requireOptionalNativeModule } from "expo";

type Subscription = { remove(): void };

export type VolumeState = { step: number; max: number };
export type CryStatus = { score?: number; level?: number; crying?: boolean; top?: number; topScore?: number; error?: string };

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
  sendAlert(tokens: string[], body: string, kind: string): Promise<{ ok: boolean; detail: string }>;
  recordClip(seconds: number, uploadUrl: string): Promise<{ ok: boolean; detail: string }>;
  setRoom?(playing: boolean, sound: string): void;
  setListen?(allow: boolean, bucket: string, notice: string, cryClip: number): void;
  diagMark?(what: string): void;
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
      sendAlert: (tokens: string[], body: string, kind = "info") => cry.sendAlert(tokens, body, kind),
      /** Uploads the last few seconds heard (kept in memory while listening) as a WAV to uploadUrl. */
      recordClip: (seconds: number, uploadUrl: string) => cry.recordClip(seconds, uploadUrl),
      /** Android: the native listener reports the room and answers "status"/"clip" itself. */
      setRoom: (playing: boolean, sound: string) => { try { cry.setRoom?.(playing, sound); } catch {} },
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
  report: (): string => { try { return cry?.diagReport?.() ?? ""; } catch { return ""; } },
};
