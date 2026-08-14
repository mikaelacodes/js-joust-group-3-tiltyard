/**
 * Tempo-locked soundtrack for the TILTYARD conductor screen.
 *
 * The server owns the tempo and broadcasts the current BPM + tempo level; this
 * synth stays locked to it. Everything is generated with the Web Audio API —
 * no audio assets to ship — using the classic look-ahead scheduler so beats
 * land on sample-accurate times even as the BPM swings.
 *
 * The arrangement tracks the tempo: a slow freeze is a sparse, tense pulse; a
 * fast charge thickens into a driving kick + bass with a frantic hat + arp — so
 * the music mirrors the on-screen phase.
 *
 * Only the conductor plays audio (players are on phones, muted spectators of
 * the beat). Browser autoplay policy requires a user gesture to start audio,
 * so call `unlock()` from a click handler (the host's "Start the round" tap)
 * before `start()`.
 */

// A minor pentatonic-ish voicing that reads as tense/driving. Frequencies (Hz)
// for the arpeggio, low to high. Root ~ A2.
const ROOT = 110; // A2
const SCALE = [0, 3, 5, 7, 10, 12]; // semitone offsets (minor pentatonic + octave)
const semi = (n) => ROOT * Math.pow(2, n / 12);

// Scheduler timing (Chris Wilson's look-ahead pattern).
const LOOKAHEAD_MS = 25; // how often the scheduler wakes
const SCHEDULE_AHEAD = 0.12; // seconds of audio scheduled in advance

export class Soundtrack {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    this.master = null;
    this.enabled = false; // actively scheduling notes
    this.muted = false;

    this.bpm = 66;
    this.energy = 0; // 0 = slow/sparse, 1 = fast/busy (tracks server tempo)

    this._step = 0; // 16th-note step, 0..15 within a bar
    this._nextNoteTime = 0; // audio-clock time of the next 16th
    this._timer = null;
  }

  /**
   * Create/resume the AudioContext. MUST be called from a user gesture so the
   * browser lets us make sound. Safe to call repeatedly.
   */
  async unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignored */
      }
    }
    return this.ctx.state === "running";
  }

  /** Begin the tempo-locked beat. No-op until `unlock()` has succeeded. */
  start() {
    if (!this.ctx || this.enabled) return;
    this.enabled = true;
    this._step = 0;
    this._nextNoteTime = this.ctx.currentTime + 0.06;
    this._scheduler();
  }

  /** Fade out and stop scheduling. */
  stop() {
    this.enabled = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this.ctx && this.master) {
      const now = this.ctx.currentTime;
      const g = this.master.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + 0.4);
      // Restore level for the next round once the fade has finished.
      g.linearRampToValueAtTime(this.muted ? 0 : 0.9, now + 0.45);
    }
  }

  /** Update the target BPM + tempo level (0..1) broadcast by the server. */
  setTempo(bpm, energy) {
    if (typeof bpm === "number") this.bpm = bpm;
    if (typeof energy === "number") this.energy = energy;
  }

  /** Toggle audible output without stopping the beat. Returns the new state. */
  toggleMute() {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(this.muted ? 0 : 0.9, now + 0.15);
    }
    return this.muted;
  }

  // -- Scheduler -----------------------------------------------------------
  _scheduler() {
    if (!this.enabled || !this.ctx) return;
    while (this._nextNoteTime < this.ctx.currentTime + SCHEDULE_AHEAD) {
      this._scheduleStep(this._step, this._nextNoteTime);
      // A 16th note = a quarter of a beat. Read BPM fresh so tempo changes
      // take effect on the very next step.
      const secondsPerBeat = 60 / Math.max(1, this.bpm);
      this._nextNoteTime += secondsPerBeat / 4;
      this._step = (this._step + 1) % 16;
    }
    this._timer = setTimeout(() => this._scheduler(), LOOKAHEAD_MS);
  }

  /** Voice one 16th-note step of the arrangement. */
  _scheduleStep(step, time) {
    const i = this.energy;
    const onBeat = step % 4 === 0; // quarter notes
    const onEighth = step % 2 === 0;

    // Kick: four-on-the-floor always; add a driving off-kick as it heats up.
    if (onBeat) this._kick(time);
    else if (i > 0.4 && step % 4 === 2 && Math.random() < 0.5) this._kick(time, 0.6);

    // Hat: eighths from Danger, sixteenths in Sudden Death.
    if (i > 0.35 && onEighth) this._hat(time, i > 0.75 ? 0.5 : 0.35);
    if (i > 0.78 && !onEighth) this._hat(time, 0.28);

    // Bass: root pulse under the kick, thicker as the tempo climbs.
    if (onBeat || (i > 0.5 && onEighth)) {
      this._bass(time, semi(step % 8 === 4 && i > 0.6 ? 3 : 0));
    }

    // Lead arpeggio: enters in Danger, gets busier in Sudden Death.
    const arpGate = i > 0.75 ? onEighth : i > 0.4 ? onBeat : false;
    if (arpGate) {
      const idx = Math.floor((step / 2 + i * 3)) % SCALE.length;
      this._lead(time, semi(SCALE[idx] + 12), 0.35 + i * 0.4);
    }
  }

  // -- Instruments (all synthesized) --------------------------------------
  _kick(time, gain = 1) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
    g.gain.setValueAtTime(0.9 * gain, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    osc.connect(g).connect(this.master);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  _hat(time, gain = 0.35) {
    const ctx = this.ctx;
    const buf = this._noiseBuffer();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    src.connect(hp).connect(g).connect(this.master);
    src.start(time);
    src.stop(time + 0.06);
  }

  _bass(time, freq) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = freq / 2; // an octave below the arp root
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 400 + this.energy * 900;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(0.28, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
    osc.connect(lp).connect(g).connect(this.master);
    osc.start(time);
    osc.stop(time + 0.18);
  }

  _lead(time, freq, gain) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(0.12 * gain, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
    osc.connect(g).connect(this.master);
    osc.start(time);
    osc.stop(time + 0.16);
  }

  /** Short white-noise buffer, lazily built and reused for hats. */
  _noiseBuffer() {
    if (this._noise) return this._noise;
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let n = 0; n < data.length; n++) data[n] = Math.random() * 2 - 1;
    this._noise = buf;
    return buf;
  }
}

export const soundtrack = new Soundtrack();
