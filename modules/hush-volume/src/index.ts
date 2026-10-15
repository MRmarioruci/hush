import { requireOptionalNativeModule } from "expo";

type EventSubscription = { remove(): void };

export type VolumeState = { step: number; max: number };

type Native = {
  getVolume(): VolumeState;
  setStep(step: number): VolumeState;
  setCeiling(step: number): VolumeState;
  addListener(event: "onVolumeChange", cb: (s: VolumeState) => void): EventSubscription;
};

// Android only. On other platforms this is null and the app falls back to its own volume bar.
const native = requireOptionalNativeModule<Native>("HushVolume");

export const deviceVolume = native
  ? {
      get: () => native.getVolume(),
      setStep: (step: number) => native.setStep(Math.round(step)),
      setCeiling: (step: number) => native.setCeiling(Math.round(step)),
      onChange: (cb: (s: VolumeState) => void) => native.addListener("onVolumeChange", cb),
    }
  : null;
