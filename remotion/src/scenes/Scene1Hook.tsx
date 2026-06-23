import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { theme } from "../theme";
import { idle } from "../components/anim";

export const Scene1Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const dotScale = spring({ frame, fps, config: { damping: 12, stiffness: 90 } });
  const dotPulse = 1 + Math.sin(frame / 4) * 0.08;
  const wordReveal = interpolate(frame, [18, 48], [0, 1], { extrapolateRight: "clamp" });

  const letters = "LOVCONNECT".split("");

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          position: "absolute",
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: theme.primary,
          boxShadow: `0 0 ${40 + idle(frame, 20, 8)}px ${theme.primaryGlow}, 0 0 120px ${theme.primary}`,
          transform: `scale(${dotScale * dotPulse})`,
          opacity: interpolate(frame, [30, 45], [1, 0], { extrapolateRight: "clamp" }),
        }}
      />
      <div
        style={{
          display: "flex",
          gap: 2,
          fontFamily: theme.display,
          fontSize: 140,
          fontWeight: 700,
          letterSpacing: "-0.04em",
          color: theme.text,
        }}
      >
        {letters.map((ch, i) => {
          const delay = 22 + i * 2.2;
          const t = interpolate(frame, [delay, delay + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const eased = 1 - Math.pow(1 - t, 3);
          const isAccent = i === 3;
          return (
            <span
              key={i}
              style={{
                opacity: eased * wordReveal,
                transform: `translateY(${(1 - eased) * 30}px)`,
                filter: `blur(${(1 - eased) * 14}px)`,
                color: isAccent ? theme.primary : theme.text,
                display: "inline-block",
              }}
            >
              {ch}
            </span>
          );
        })}
      </div>
      <div
        style={{
          position: "absolute",
          top: "calc(50% + 110px)",
          height: 4,
          background: theme.primary,
          width: interpolate(frame, [40, 58], [0, 360], { extrapolateRight: "clamp" }),
          boxShadow: `0 0 18px ${theme.primaryGlow}`,
        }}
      />
    </AbsoluteFill>
  );
};