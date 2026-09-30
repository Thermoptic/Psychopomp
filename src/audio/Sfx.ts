// Placeholder audio: turns core GameEvents into short synthesized sounds.
// No audio files, no network. The core never calls this directly — the app
// forwards the events returned by applyCommand.

import type { GameEvent } from '../core/types';

type Tone = { freq: number; to?: number; dur: number; type?: OscillatorType; gain?: number; delay?: number };

export class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;

  /** Browsers only allow audio after a user gesture; call from an input handler. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private play(tones: Tone[]): void {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== 'running') return;
    const t0 = ctx.currentTime;
    for (const t of tones) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const start = t0 + (t.delay ?? 0);
      osc.type = t.type ?? 'square';
      osc.frequency.setValueAtTime(t.freq, start);
      if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, start + t.dur);
      g.gain.setValueAtTime(t.gain ?? 0.06, start);
      g.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + t.dur + 0.02);
    }
  }

  ui(kind: 'move' | 'confirm' | 'deny'): void {
    if (kind === 'move') this.play([{ freq: 660, dur: 0.03, gain: 0.025 }]);
    if (kind === 'confirm') this.play([{ freq: 880, dur: 0.05, gain: 0.04 }]);
    if (kind === 'deny') this.play([{ freq: 140, dur: 0.12, type: 'sawtooth', gain: 0.05 }]);
  }

  handle(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'DICE_ROLLED':
          this.play([0, 0.04, 0.08, 0.12].map((delay) => ({ freq: 300 + delay * 2000, dur: 0.03, delay, type: 'triangle' as const, gain: 0.05 })));
          break;
        case 'DIE_LOCK_CHANGED':
          this.play([{ freq: e.locked ? 520 : 390, dur: 0.05 }]);
          break;
        case 'DIE_ALLOCATED':
          this.play([{ freq: 740, dur: 0.04 }]);
          break;
        case 'BATTLE_STARTED':
          this.play([{ freq: 220, to: 110, dur: 0.35, type: 'sawtooth', gain: 0.07 }, { freq: 330, to: 165, dur: 0.35, delay: 0.1, type: 'sawtooth', gain: 0.05 }]);
          break;
        case 'SPECIAL_ACTIVATED':
          this.play([{ freq: 440, to: 1320, dur: 0.3, type: 'triangle', gain: 0.07 }]);
          break;
        case 'ATTACK_STARTED':
          this.play([{ freq: 900, to: 300, dur: 0.08, type: 'triangle', gain: 0.03 }]);
          break;
        case 'HIT':
          this.play([{ freq: 120, to: 40, dur: 0.18, type: 'sawtooth', gain: 0.1 }]);
          break;
        case 'BLOCKED':
          this.play([{ freq: 1500, to: 900, dur: 0.1, type: 'square', gain: 0.05 }]);
          break;
        case 'GUARD':
          this.play([{ freq: 600, dur: 0.04, gain: 0.03 }]);
          break;
        case 'CREATURE_DIED':
          this.play([{ freq: 400, to: 50, dur: 0.6, type: 'sawtooth', gain: 0.08 }]);
          break;
        case 'POWER_POINT_CAPTURED':
          this.play([{ freq: 660, dur: 0.08 }, { freq: 990, dur: 0.12, delay: 0.08 }]);
          break;
        case 'MATCH_ENDED':
          this.play([523, 659, 784, 1047].map((freq, i) => ({ freq, dur: 0.2, delay: i * 0.15, gain: 0.06 })));
          break;
      }
    }
  }
}
