import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { theme } from "../theme";
import { entrance } from "../components/anim";

const Card: React.FC<{ delay: number; title: string; desc: string; tag: string; big?: boolean; frame: number; fps: number; col: number; row: number }> = ({ delay, title, desc, tag, big, frame, fps, col, row }) => {
  const s = spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 130 } });
  return (
    <div
      style={{
        gridColumn: `span ${col}`,
        gridRow: `span ${row}`,
        background: theme.surface,
        border: `1px solid ${big ? theme.primary + "66" : "#2a2522"}`,
        borderRadius: 28,
        padding: 36,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative",
        overflow: "hidden",
        transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px)`,
        opacity: interpolate(s, [0, 1], [0, 1]),
        boxShadow: big ? `0 0 80px ${theme.primary}33` : "none",
      }}
    >
      {big && (
        <div style={{ position: "absolute", top: -120, right: -120, width: 320, height: 320, borderRadius: "50%", background: `radial-gradient(circle, ${theme.primary}44 0%, transparent 70%)`, filter: "blur(40px)" }} />
      )}
      <div style={{ position: "relative" }}>
        <div style={{ fontFamily: theme.body, fontSize: 13, letterSpacing: "0.3em", color: theme.primary, fontWeight: 600, textTransform: "uppercase" }}>{tag}</div>
        <div style={{ fontFamily: theme.display, fontSize: big ? 72 : 42, fontWeight: 700, color: theme.text, letterSpacing: "-0.03em", marginTop: 12, lineHeight: 1.02, whiteSpace: "pre-line" }}>{title}</div>
      </div>
      <div style={{ fontFamily: theme.body, fontSize: big ? 22 : 17, color: theme.textDim, marginTop: 24, lineHeight: 1.4 }}>{desc}</div>
    </div>
  );
};

export const Scene4Features: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ padding: "70px 100px", flexDirection: "column" }}>
      <div style={{ ...entrance(frame, 0, 16), marginBottom: 28 }}>
        <div style={{ fontFamily: theme.body, fontSize: 20, letterSpacing: "0.35em", color: theme.primary, fontWeight: 600, textTransform: "uppercase" }}>O que vem incluso</div>
      </div>
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gridTemplateRows: "repeat(2, 1fr)", gap: 22 }}>
        <Card frame={frame} fps={fps} delay={10} col={2} row={2} big tag="Core" title={"Painel\nwhite-label"} desc="Sua marca, sua URL, seus preços. O cliente nunca vê a LovConnect." />
        <Card frame={frame} fps={fps} delay={22} col={2} row={1} tag="Loja pública" title="Storefront pronto" desc="Link único para divulgar." />
        <Card frame={frame} fps={fps} delay={34} col={1} row={1} tag="API" title="REST" desc="Integre no seu site." />
        <Card frame={frame} fps={fps} delay={46} col={1} row={1} tag="Bot" title="WA + TG" desc="Notificações em tempo real." />
      </div>
    </AbsoluteFill>
  );
};