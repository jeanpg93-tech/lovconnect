import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { theme } from "../theme";
import { entrance, idle } from "../components/anim";

export const Scene2Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const strike = interpolate(frame, [40, 65], [0, 100], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ padding: "0 160px", justifyContent: "center" }}>
      <div style={{ ...entrance(frame, 0, 20), maxWidth: 1400 }}>
        <div
          style={{
            fontFamily: theme.body,
            fontSize: 22,
            letterSpacing: "0.35em",
            color: theme.primary,
            fontWeight: 600,
            textTransform: "uppercase",
            marginBottom: 28,
          }}
        >
          — Pergunta séria
        </div>
        <div
          style={{
            fontFamily: theme.display,
            fontSize: 140,
            fontWeight: 700,
            lineHeight: 1.02,
            letterSpacing: "-0.035em",
            color: theme.text,
            transform: `translateY(${idle(frame, 3, 50)}px)`,
          }}
        >
          Ainda entrega <br />
          <span style={{ position: "relative", display: "inline-block" }}>
            chave na mão?
            <div
              style={{
                position: "absolute",
                left: 0,
                top: "55%",
                height: 10,
                width: `${strike}%`,
                background: theme.primary,
                boxShadow: `0 0 28px ${theme.primaryGlow}`,
                transformOrigin: "left",
              }}
            />
          </span>
        </div>
        <div
          style={{
            ...entrance(frame, 55, 20),
            marginTop: 38,
            fontFamily: theme.body,
            fontSize: 28,
            color: theme.textDim,
            maxWidth: 900,
            fontWeight: 400,
          }}
        >
          Cliente acorda às 02h, paga e fica esperando. Você dormindo. Venda perdida.
        </div>
      </div>
    </AbsoluteFill>
  );
};