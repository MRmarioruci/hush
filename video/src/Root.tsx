import { Composition, Folder } from "remotion";
import { HushPromo } from "./HushPromo";
import { IntroScene, MonitorScene, NightsScene, OutroScene, SafeScene, SmartScene, SoundsScene } from "./scenes";

const V = { width: 1920, height: 1080, fps: 30 };

export const RemotionRoot: React.FC = () => (
  <>
    {/* 120+150+150+175+180+140+155 frames minus six 15-frame fades = 980 frames (32.7 s) */}
    <Composition id="HushPromo" component={HushPromo} durationInFrames={980} {...V} />
    <Folder name="Scenes">
      <Composition id="Intro" component={IntroScene} durationInFrames={120} {...V} />
      <Composition id="Sounds" component={SoundsScene} durationInFrames={150} {...V} />
      <Composition id="SafeVolume" component={SafeScene} durationInFrames={150} {...V} />
      <Composition id="SmartVolume" component={SmartScene} durationInFrames={175} {...V} />
      <Composition id="Monitor" component={MonitorScene} durationInFrames={180} {...V} />
      <Composition id="Nights" component={NightsScene} durationInFrames={140} {...V} />
      <Composition id="Outro" component={OutroScene} durationInFrames={155} {...V} />
    </Folder>
  </>
);
