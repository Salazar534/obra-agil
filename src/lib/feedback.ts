import { isNativeShell, postNative } from "./native.ts";

let soundOn = true;
let audio: AudioContext | null = null;

export function setSoundEnabled(enabled: boolean) {
  soundOn = enabled;
}

const tunes = {
  success: [659.25, 830.61, 987.77],
  notify: [880, 1174.66],
  tap: [1046.5],
};

export function chime(kind: keyof typeof tunes = "success") {
  if (isNativeShell()) postNative({ type: "haptic", kind });
  else navigator.vibrate?.(kind === "success" ? [10, 40, 14] : 8);
  if (!soundOn) return;
  try {
    audio ??= new AudioContext();
    const ctx = audio;
    const start = ctx.currentTime + 0.01;
    tunes[kind].forEach((frequency, index) => {
      const at = start + index * 0.085;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.07, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.45);
    });
  } catch {
    // Audio can be blocked; the visual celebration still runs.
  }
}
