import type { NotificationTone } from "./project-settings";

export function playNotificationTone(context: AudioContext, tone: NotificationTone) {
  if (tone === "silent") return;
  const start = context.currentTime;
  const notes = tone === "soft" ? [523, 659] : [660, 880];
  notes.forEach((frequency, index) => {
    const offset = index * (tone === "soft" ? 0.18 : 0.14);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = tone === "soft" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequency, start + offset);
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(tone === "soft" ? 0.04 : 0.07, start + offset + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + (tone === "soft" ? 0.22 : 0.12));
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + (tone === "soft" ? 0.23 : 0.13));
  });
}
