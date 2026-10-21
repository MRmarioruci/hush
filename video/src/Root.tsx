import { Composition, Folder } from "remotion";
import { HushPromo } from "./HushPromo";
import { HookScene, IntroScene, NapsScene, RemoteScene, ThreeScene, MonitorScene, NightsScene, OutroScene, SafeScene, SmartScene, SoundsScene } from "./scenes";

const V = { width: 1920, height: 1080, fps: 30 };

export const RemotionRoot: React.FC = () => (
  <>
    {/* Scene lengths add up to 1610 frames, minus ten 15-frame fades = 1460 frames (48.7 s) */}
    <Composition id="HushPromo" component={HushPromo} durationInFrames={1520} {...V} />
    <Folder name="Scenes">
      <Composition id="Hook" component={HookScene} durationInFrames={120} {...V} />
      <Composition id="Intro" component={IntroScene} durationInFrames={100} {...V} />
      <Composition id="Three" component={ThreeScene} durationInFrames={130} {...V} />
      <Composition id="NapTimes" component={NapsScene} durationInFrames={160} {...V} />
      <Composition id="Remote" component={RemoteScene} durationInFrames={200} {...V} />
      <Composition id="Sounds" component={SoundsScene} durationInFrames={140} {...V} />
      <Composition id="SafeVolume" component={SafeScene} durationInFrames={140} {...V} />
      <Composition id="SmartVolume" component={SmartScene} durationInFrames={165} {...V} />
      <Composition id="Monitor" component={MonitorScene} durationInFrames={210} {...V} />
      <Composition id="Nights" component={NightsScene} durationInFrames={130} {...V} />
      <Composition id="Outro" component={OutroScene} durationInFrames={175} {...V} />
    </Folder>
  </>
);
