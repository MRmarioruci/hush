import { Audio } from "@remotion/media";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { AbsoluteFill, staticFile } from "remotion";
import { HookScene, IntroScene, NapsScene, RemoteScene, ThreeScene, MonitorScene, NightsScene, OutroScene, SafeScene, SmartScene, SoundsScene } from "./scenes";

export const HushPromo: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#1b1727" }}>
    <TransitionSeries>
      <TransitionSeries.Sequence name="Hook" durationInFrames={120}><HookScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="Intro" durationInFrames={100}><IntroScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="Three features" durationInFrames={130}><ThreeScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="Sounds" durationInFrames={140}><SoundsScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="Safe volume" durationInFrames={140}><SafeScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="Smart volume" durationInFrames={165}><SmartScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="Nap times" durationInFrames={160}><NapsScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="Monitor" durationInFrames={210}><MonitorScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="From your phone" durationInFrames={200}><RemoteScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="Nights" durationInFrames={130}><NightsScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="Outro" durationInFrames={175}><OutroScene /></TransitionSeries.Sequence>
    </TransitionSeries>
    <Audio src={staticFile("music.wav")} volume={0.6} />
  </AbsoluteFill>
);
