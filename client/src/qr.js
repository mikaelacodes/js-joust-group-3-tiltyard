import qrcode from "qrcode-generator";

/**
 * Build a scalable SVG QR code for `text`. Returns an `<svg>…</svg>` string that
 * fills its container (size it with CSS). Used on the attract screen so players
 * can scan straight into the join flow.
 *
 * @param {string} text
 * @returns {string}
 */
export function qrSvg(text) {
  const qr = qrcode(0, "M"); // type 0 = auto-fit, error correction level M
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

/** The URL a phone should open to join this room (scanned or typed). */
export function joinUrl(code) {
  return `${location.origin}/?code=${encodeURIComponent(code)}`;
}
