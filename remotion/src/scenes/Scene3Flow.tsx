import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { theme } from "../theme";
import { entrance } from "../components/anim";

const Step: React.FC<{ delay: number; label: string; sub: string; icon: React.ReactNode; frame: number; fps: number }> = ({ delay, label, sub, icon, frame, fps }) => {
  const s = spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 140 } });
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 22,
        transform: `scale(${interpolate(s, [0, 1], [0.6, 1])})`,
        opacity: interpolate(s, [0, 1], [0, 1]),
      }}
    >
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: 32,
          background: theme.surface,
          border: `2px solid ${theme.primary}55`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 0 80px ${theme.primary}33, inset 0 0 30px ${theme.primary}11`,
        }}
      >
        {icon}
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: theme.display, fontSize: 32, fontWeight: 700, color: theme.text, letterSpacing: "-0.02em" }}>{label}</div>
        <div style={{ fontFamily: theme.body, fontSize: 18, color: theme.textDim, marginTop: 6 }}>{sub}</div>
      </div>
    </div>
  );
};

const Arrow: React.FC<{ delay: number; frame: number }> = ({ delay, frame }) => {
  const draw = interpolate(frame, [delay, delay + 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <svg width={140} height={40} viewBox="0 0 140 40" style={{ marginTop: 70 }}>
      <defs>
        <marker id="ah" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
          <polygon points="0 0, 10 5, 0 10" fill={theme.primary} />
        </marker>
      </defs>
      <line
        x1={5}
        y1={20}
        x2={5 + 120 * draw}
        y2={20}
        stroke={theme.primary}
        strokeWidth={3}
        strokeDasharray="6 6"
        markerEnd={draw > 0.95 ? "url(#ah)" : undefined}
        style={{ filter: `drop-shadow(0 0 8px ${theme.primaryGlow})` }}
      />
    </svg>
  );
};

export const Scene3Flow: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ padding: "0 100px", justifyContent: "center" }}>
      <div style={{ ...entrance(frame, 0, 18), textAlign: "center", marginBottom: 70 }}>
        <div
          style={{
            fontFamily: theme.body,
            fontSize: 22,
            letterSpacing: "0.35em",
            color: theme.primary,
            fontWeight: 600,
            textTransform: "uppercase",
            marginBottom: 18,
          }}
        >
          A LovConnect resolve
        </div>
        <div
          style={{
            fontFamily: theme.display,
            fontSize: 96,
            fontWeight: 700,
            color: theme.text,
            letterSpacing: "-0.035em",
            lineHeight: 1,
          }}
        >
          Venda <span style={{ color: theme.primary, fontStyle: "italic" }}>no automático</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 20 }}>
        <Step delay={20} frame={frame} fps={fps} label="Pagamento" sub="MisticPay confirma"
          icon={<svg width={88} height={88} viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="20" height="14" rx="2" stroke={theme.primary} strokeWidth="1.5" /><line x1="2" y1="10" x2="22" y2="10" stroke={theme.primary} strokeWidth="1.5" /><rect x="5" y="14" width="6" height="2" rx="0.5" fill={theme.primary} /></svg>} />
        <Arrow delay={42} frame={frame} />
        <Step delay={50} frame={frame} fps={fps} label="Entrega" sub="Chave gerada em 5s"
          icon={<svg width={88} height={88} viewBox="0 0 24 24" fill="none"><circle cx="9" cy="15" r="4" stroke={theme.primary} strokeWidth="1.5" /><line x1="12" y1="12" x2="21" y2="3" stroke={theme.primary} strokeWidth="1.5" /><line x1="17" y1="7" x2="20" y2="10" stroke={theme.primary} strokeWidth="1.5" /><line x1="19" y1="5" x2="22" y2="8" stroke={theme.primary} strokeWidth="1.5" /></svg>} />
        <Arrow delay={72} frame={frame} />
        <Step delay={80} frame={frame} fps={fps} label="Notificação" sub="WhatsApp + Telegram"
          icon={<svg width={88} height={88} viewBox="0 0 24 24" fill="none"><path d="M4 6h16v10H8l-4 4V6z" stroke={theme.primary} strokeWidth="1.5" strokeLinejoin="round" /><circle cx="9" cy="11" r="1" fill={theme.primary} /><circle cx="12" cy="11" r="1" fill={theme.primary} /><circle cx="15" cy="11" r="1" fill={theme.primary} /></svg>} />
      </div>
    </AbsoluteFill>
  );
};