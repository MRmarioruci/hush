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
  isBatteryExempt(): boolean;
  requestBatteryExempt(): boolean;
  sendAlert(tokens: string[], body: string, kind: string): Promise<{ ok: boolean; detail: string }>;
  addListener(event: "onStatus", cb: (s: CryStatus) => void): Subscription;
  addListener(event: "onCry", cb: (e: { at: number; first: boolean }) => void): Subscription;
};

// Android only. On other platforms these are null and the app falls back gracefully.
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
      isBatteryExempt: () => cry.isBatteryExempt(),
      requestBatteryExempt: () => cry.requestBatteryExempt(),
      sendAlert: (tokens: string[], body: string, kind = "info") => cry.sendAlert(tokens, body, kind),
      onStatus: (cb: (s: CryStatus) => void) => cry.addListener("onStatus", cb),
      onCry: (cb: (e: { at: number; first: boolean }) => void) => cry.addListener("onCry", cb),
    }
  : null;
