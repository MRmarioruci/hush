import { Composition, Folder } from "remotion";
import { HushPromo } from "./HushPromo";
import { HookScene, IntroScene, MonitorScene, NightsScene, OutroScene, SafeScene, SmartScene, SoundsScene } from "./scenes";

const V = { width: 1920, height: 1080, fps: 30 };

export const RemotionRoot: React.FC = () => (
  <>
    {/* Scene lengths add up to 1150 frames, minus seven 15-frame fades = 1045 frames (34.8 s) */}
    <Composition id="HushPromo" component={HushPromo} durationInFrames={1045} {...V} />
    <Folder name="Scenes">
      <Composition id="Hook" component={HookScene} durationInFrames={120} {...V} />
      <Composition id="Intro" component={IntroScene} durationInFrames={100} {...V} />
      <Composition id="Sounds" component={SoundsScene} durationInFrames={140} {...V} />
      <Composition id="SafeVolume" component={SafeScene} durationInFrames={140} {...V} />
      <Composition id="SmartVolume" component={SmartScene} durationInFrames={165} {...V} />
      <Composition id="Monitor" component={MonitorScene} durationInFrames={180} {...V} />
      <Composition id="Nights" component={NightsScene} durationInFrames={130} {...V} />
      <Composition id="Outro" component={OutroScene} durationInFrames={175} {...V} />
    </Folder>
  </>
);
