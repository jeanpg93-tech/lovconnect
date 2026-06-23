import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { wipe } from "@remotion/transitions/wipe";
import { loadFont as loadDisplay } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadBody } from "@remotion/google-fonts/Inter";
import { PersistentBackground } from "./components/PersistentBackground";
import { Scene1Hook } from "./scenes/Scene1Hook";
import { Scene2Problem } from "./scenes/Scene2Problem";
import { Scene3Flow } from "./scenes/Scene3Flow";
import { Scene4Features } from "./scenes/Scene4Features";
import { Scene5Outro } from "./scenes/Scene5Outro";

loadDisplay("normal", { weights: ["400", "500", "700"], subsets: ["latin"] });
loadBody("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });

const TRANS = 15;

export const MainVideo: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#0a0908" }}>
    <PersistentBackground />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={60}>
        <Scene1Hook />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-right" })} timing={linearTiming({ durationInFrames: TRANS })} />
      <TransitionSeries.Sequence durationInFrames={90}>
        <Scene2Problem />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-right" })} timing={linearTiming({ durationInFrames: TRANS })} />
      <TransitionSeries.Sequence durationInFrames={120}>
        <Scene3Flow />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-right" })} timing={linearTiming({ durationInFrames: TRANS })} />
      <TransitionSeries.Sequence durationInFrames={120}>
        <Scene4Features />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-right" })} timing={linearTiming({ durationInFrames: TRANS })} />
      <TransitionSeries.Sequence durationInFrames={150}>
        <Scene5Outro />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);