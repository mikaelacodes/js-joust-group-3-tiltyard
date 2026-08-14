/**
 * Reads this device's accelerometer and reports the current motion magnitude.
 *
 * Only the phone itself can see its own DeviceMotion, so each client watches its
 * own movement and decides when it has been jostled too hard. The server just
 * broadcasts the current allowed magnitude (derived from tempo).
 */
export class MotionSensor {
  constructor() {
    /** Gravity-free jerk magnitude, compared against the allowed limit. */
    this.magnitude = 0;
    /** Tilt, roughly -1..1 on each axis, for the reticle dot. */
    this.tiltX = 0;
    this.tiltY = 0;
    this._handler = this._onMotion.bind(this);
    this._listening = false;
  }

  /**
   * iOS 13+ requires a permission prompt triggered by a user gesture. Call this
   * from a button handler. Resolves true if motion is available.
   * @returns {Promise<boolean>}
   */
  async requestPermission() {
    const DME = /** @type {any} */ (window).DeviceMotionEvent;
    if (DME && typeof DME.requestPermission === "function") {
      try {
        const result = await DME.requestPermission();
        return result === "granted";
      } catch {
        return false;
      }
    }
    // Non-iOS browsers: no explicit permission needed.
    return typeof window.DeviceMotionEvent !== "undefined";
  }

  start() {
    if (this._listening) return;
    window.addEventListener("devicemotion", this._handler);
    this._listening = true;
  }

  stop() {
    if (!this._listening) return;
    window.removeEventListener("devicemotion", this._handler);
    this._listening = false;
    this.magnitude = 0;
    this.tiltX = 0;
    this.tiltY = 0;
  }

  /** @param {DeviceMotionEvent} event */
  _onMotion(event) {
    // Jerk magnitude: prefer gravity-free acceleration, else strip ~1g off Z.
    const acc = event.acceleration;
    let x, y, z;
    if (acc && acc.x != null) {
      x = acc.x ?? 0;
      y = acc.y ?? 0;
      z = acc.z ?? 0;
    } else {
      const g = event.accelerationIncludingGravity;
      x = g?.x ?? 0;
      y = g?.y ?? 0;
      z = (g?.z ?? 0) - 9.81;
    }
    this.magnitude = Math.sqrt(x * x + y * y + z * z);

    // Tilt for the reticle: use gravity direction, normalized by 1g.
    const g = event.accelerationIncludingGravity;
    if (g) {
      this.tiltX = Math.max(-1, Math.min(1, (g.x ?? 0) / 9.81));
      this.tiltY = Math.max(-1, Math.min(1, (g.y ?? 0) / 9.81));
    }
  }
}

export const motion = new MotionSensor();
