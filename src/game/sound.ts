let ctx: AudioContext | null = null;
/** Tiny synth beeps for feedback: ok, fail, open, goal. */
export function beep(kind: "ok" | "fail" | "open" | "goal") {
  try {
    ctx ??= new AudioContext();
    const notes = { ok: [660, 880], fail: [220, 160], open: [520], goal: [523, 659, 784, 1046] }[kind];
    notes.forEach((f, i) => {
      const o = ctx!.createOscillator(), g = ctx!.createGain(), t = ctx!.currentTime + i * 0.09;
      o.type = kind === "fail" ? "sawtooth" : "triangle"; o.frequency.value = f;
      g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g).connect(ctx!.destination); o.start(t); o.stop(t + 0.2);
    });
  } catch { /* audio unavailable */ }
}
