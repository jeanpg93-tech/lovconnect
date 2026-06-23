import { interpolate, spring } from "remotion";

export function entrance(frame: number, delay = 0, dur = 22) {
  const t = Math.max(0, Math.min(1, (frame - delay) / dur));
  const eased = 1 - Math.pow(1 - t, 3);
  return {
    opacity: eased,
    filter: `blur(${(1 - eased) * 18}px)`,
    transform: `translateY(${(1 - eased) * 24}px)`,
  } as React.CSSProperties;
}

export function heroPop(frame: number, fps: number, delay = 0) {
  const s = spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 140 } });
  return {
    transform: `scale(${interpolate(s, [0, 1], [0.6, 1])})`,
    opacity: interpolate(s, [0, 1], [0, 1]),
  } as React.CSSProperties;
}

export function idle(frame: number, amp = 4, speed = 70) {
  return Math.sin(frame / speed) * amp;
}