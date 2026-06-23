import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { theme } from "../theme";
import { idle } from "../components/anim";

export const Scene5Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoS = spring({ frame, fps, config: { damping: 14, stiffness: 110 } });
  const taglineWords = ["Sua", "marca.", "Seu", "painel.", "No", "automático."];
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <div style={{ opacity: interpolate(frame, [10, 28], [0, 1], { extrapolateRight: "clamp" }), transform: `translateY(${interpolate(frame, [10, 28], [10, 0], { extrapolateRight: "clamp" })}px)`, fontFamily: theme.body, fontSize: 18, letterSpacing: "0.4em", color: theme.textDim, textTransform: "uppercase", marginBottom: 32 }}>— Apresenta</div>
      <div style={{ fontFamily: theme.display, fontSize: 200, fontWeight: 700, color: theme.text, letterSpacing: "-0.05em", lineHeight: 1, transform: `scale(${interpolate(logoS, [0, 1], [0.7, 1])}) translateY(${idle(frame - 30, 5, 70)}px)`, opacity: interpolate(logoS, [0, 1], [0, 1]), textShadow: `0 0 40px ${theme.primary}66, 0 0 120px ${theme.primary}33` }}>
        lov<span style={{ color: theme.primary }}>connect</span>
      </div>
      <div style={{ marginTop: 50, display: "flex", gap: 18, fontFamily: theme.display, fontSize: 44, fontWeight: 500, color: theme.text, letterSpacing: "-0.02em" }}>
        {taglineWords.map((w, i) => {
          const delay = 40 + i * 6;
          const t = interpolate(frame, [delay, delay + 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const eased = 1 - Math.pow(1 - t, 3);
          const isAccent = w === "automático.";
          return (
            <span key={i} style={{ opacity: eased, transform: `translateY(${(1 - eased) * 18}px)`, filter: `blur(${(1 - eased) * 10}px)`, color: isAccent ? theme.primary : theme.text, fontStyle: isAccent ? "italic" : "normal", fontWeight: isAccent ? 700 : 500 }}>{w}</span>
          );
        })}
      </div>
      <div style={{ marginTop: 80, opacity: interpolate(frame, [95, 115], [0, 1], { extrapolateRight: "clamp" }), transform: `translateY(${interpolate(frame, [95, 115], [12, 0], { extrapolateRight: "clamp" })}px)`, display: "flex", alignItems: "center", gap: 14, padding: "16px 36px", border: `1px solid ${theme.primary}55`, borderRadius: 999, background: `${theme.surface}aa`, fontFamily: theme.body, fontSize: 22, color: theme.text, letterSpacing: "0.05em" }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: theme.primary, boxShadow: `0 0 16px ${theme.primaryGlow}` }} />
        lovconnect.store
      </div>
    </AbsoluteFill>
  );
};