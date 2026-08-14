import { C2S, S2C, MIN_PLAYERS_TO_START } from "@joust/shared";
import { net } from "./net.js";
import { motion } from "./motion.js";
import { soundtrack } from "./audio.js";
import { qrSvg, joinUrl } from "./qr.js";
import "./styles.css";

/**
 * TILTYARD client (modern attract-mode skin). Two roles share one app:
 *  - Conductor: the big shared screen. Attract lobby (QR to join) -> live tempo.
 *  - Player: a phone controller. Reads its own motion, self-reports when out.
 *
 * render() paints the whole screen for the current (phase, role). During play
 * we patch dynamic bits in place so animations + motion feedback stay smooth.
 */

const app = document.getElementById("app");

const BRAND = `<div class="brand-mark">
  <svg width="20" height="20" viewBox="0 0 20 20">
    <circle cx="10" cy="10" r="9" fill="none" stroke="#35e6ff" stroke-width="2"/>
    <circle cx="10" cy="10" r="3" fill="#ff3d7a"/>
  </svg><span>Tiltyard</span></div>`;

const BLOBS = `<div class="blobs"><div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div></div>`;

const TICKER =
  "⚡ SLOW BEAT? FREEZE. FAST BEAT? CHARGE. ⚡ MOVE TOO MUCH WHILE IT'S SLOW AND YOU'RE OUT ⚡ LAST KNIGHT STANDING WINS ⚡";

const state = {
  role: null, // "conductor" | "player"
  code: null,
  playerId: null,
  isHost: false,
  players: [],
  phase: "home", // home | lobby | countdown | playing | ended
  tempo: 0, // 0 = slow/sensitive, 1 = fast/free
  bpm: 66,
  allowedMagnitude: Infinity,
  phaseInfo: { name: "Warm-Up", className: "", caption: "", hint: "" },
  winnerName: null,
  winnerColor: null,
  eliminatedSelf: false,
  playStartedAt: 0,
  survivedSec: 0,
  error: null,
};

const players = () => state.players.filter((p) => p.role === "player");
const me = () => state.players.find((p) => p.id === state.playerId) ?? null;
const meAlive = () => !!me()?.alive;

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]
  );
}

function knightHTML(p) {
  return `<div class="knight ${p.alive ? "" : "out"}">
    <div class="avatar av-${p.color}"></div>
    <div class="knight-name">${esc(p.name)}</div>
  </div>`;
}

const beatSeconds = () => (60 / Math.max(1, state.bpm)).toFixed(3);

// ---------------------------------------------------------------------------
// Server message handlers
// ---------------------------------------------------------------------------
function wireHandlers() {
  net.on(S2C.ROOM_JOINED, (d) => {
    state.role = d.role;
    state.code = d.code;
    state.playerId = d.playerId;
    state.isHost = d.isHost;
    state.players = d.players;
    state.phase = "lobby";
    state.error = null;
    render();
  });

  net.on(S2C.PLAYERS_UPDATE, (d) => {
    state.players = d.players;
    state.isHost = me()?.isHost ?? state.isHost;
    if (state.phase === "playing") updateConductorUI();
    else render();
  });

  net.on(S2C.ERROR, (d) => {
    state.error = d.message;
    render();
  });

  net.on(S2C.GAME_STARTING, () => {
    state.phase = "countdown";
    state.eliminatedSelf = false;
    render();
  });

  net.on(S2C.GAME_STARTED, () => {
    state.phase = "playing";
    state.playStartedAt = Date.now();
    render();
    if (state.role === "player") startPlayerLoop();
    // Both the conductor screen and every player's phone play the beat.
    soundtrack.setTempo(state.bpm, state.tempo);
    soundtrack.start();
  });

  net.on(S2C.TEMPO, (d) => {
    state.tempo = d.tempo;
    state.bpm = d.bpm;
    state.allowedMagnitude = d.allowedMagnitude;
    state.phaseInfo = d.phase;
    soundtrack.setTempo(d.bpm, d.tempo);
    if (state.phase === "playing") {
      if (state.role === "conductor") updateConductorUI();
      else updatePlayerTempo();
    }
  });

  net.on(S2C.PLAYER_ELIMINATED, (d) => {
    const p = state.players.find((x) => x.id === d.playerId);
    if (p) p.alive = false;
    if (d.playerId === state.playerId) state.eliminatedSelf = true;
    if (state.phase === "playing" && state.role === "conductor") updateConductorUI();
  });

  net.on(S2C.GAME_OVER, (d) => {
    state.phase = "ended";
    state.winnerName = d.winnerName;
    state.winnerColor = d.winnerColor;
    stopPlayerLoop();
    soundtrack.stop();
    render();
  });

  net.on(S2C.LOBBY_RESET, (d) => {
    state.players = d.players;
    state.phase = "lobby";
    state.winnerName = null;
    state.winnerColor = null;
    state.eliminatedSelf = false;
    stopPlayerLoop();
    soundtrack.stop();
    render();
  });

  net.on(S2C.ROOM_CLOSED, () => {
    state.phase = "home";
    state.error = "The room was closed.";
    soundtrack.stop();
    render();
  });
}

// ---------------------------------------------------------------------------
// Player motion loop — pulse-core feedback + self-elimination detection
// ---------------------------------------------------------------------------
let rafId = null;

function startPlayerLoop() {
  motion.start();
  const loop = () => {
    if (state.phase !== "playing" || state.role !== "player") return;
    const core = document.getElementById("pulseCore");
    if (core && !state.eliminatedSelf) {
      core.style.transform = `translate(${motion.tiltX * 18}px, ${motion.tiltY * 18}px)`;
    }
    if (meAlive() && !state.eliminatedSelf && motion.magnitude > state.allowedMagnitude) {
      state.eliminatedSelf = true;
      state.survivedSec = Math.max(0, Math.round((Date.now() - state.playStartedAt) / 1000));
      net.send(C2S.ELIMINATED);
      playUnhorsed();
    }
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

function stopPlayerLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  motion.stop();
}

function playUnhorsed() {
  navigator.vibrate?.([220, 90, 220, 90, 400]);
  const root = document.getElementById("ctrl-root");
  if (!root) return;
  const stat = document.getElementById("outStat");
  if (stat) stat.textContent = `SURVIVED ${state.survivedSec}S · ${state.phaseInfo?.name ?? ""}`;
  root.classList.add("state-hit", "shake");
  setTimeout(() => {
    root.classList.remove("state-hit", "shake");
    root.classList.add("state-out");
  }, 900);
}

// ---------------------------------------------------------------------------
// Render dispatch
// ---------------------------------------------------------------------------
function render() {
  if (state.phase === "home") return renderHome();
  if (state.role === "conductor") return renderConductor();
  return renderPlayer();
}

const errorBanner = () => (state.error ? `<p class="error">${esc(state.error)}</p>` : "");
const playerShell = (inner) => `<div class="wrap">${BLOBS}${inner}</div>`;

// ---- Home -----------------------------------------------------------------
function renderHome() {
  const preCode = new URLSearchParams(location.search).get("code") ?? "";
  app.innerHTML = playerShell(`
    <div class="screen">
      <p class="eyebrow" style="text-align:center">Phones only · no controllers</p>
      <h1 class="home-title anton">Grab a phone.<br/><span class="line2">Pick a fight.</span></h1>
      <p class="home-sub">Tilt to duel. Move too much for the beat and you're out. Last knight standing wins.</p>
      ${errorBanner()}
      <button id="create" class="primary">Host a game · shared screen</button>
      <div class="or">— or join on your phone —</div>
      <label>Your name
        <input id="name" maxlength="16" placeholder="e.g. Sir Gold" />
      </label>
      <div class="join-row">
        <input id="code" maxlength="4" placeholder="CODE" class="code-input" value="${esc(preCode.toUpperCase())}" />
        <button id="join">Join</button>
      </div>
    </div>`);

  document.getElementById("create").onclick = () => net.send(C2S.CREATE_ROOM);
  document.getElementById("join").onclick = async () => {
    const name = document.getElementById("name").value.trim();
    const code = document.getElementById("code").value.trim();
    // This tap is the player's one gesture — use it to unlock audio (so the
    // beat can play on the phone) and to grant motion permission (iOS 13+).
    soundtrack.unlock();
    await motion.requestPermission();
    net.send(C2S.JOIN_ROOM, { code, name });
  };
  if (preCode) document.getElementById("name").focus();
}

// ---- Conductor (big shared screen) ---------------------------------------
function renderConductor() {
  if (state.phase === "lobby") return renderAttract();
  if (state.phase === "ended") return renderConductorEnded();
  return renderConductorPlaying();
}

function renderAttract() {
  const total = players().length;
  const canStart = state.isHost && total >= MIN_PLAYERS_TO_START;
  app.innerHTML = `
    <div class="stage">
      ${BLOBS}
      <div class="stage-top">${BRAND}<div class="pill">Attract Mode</div></div>
      <div class="stage-main">
        <p class="eyebrow">Phones only · no controllers needed</p>
        <h2 class="hero-title anton">Grab a phone.<br/><span class="line2">Pick a fight.</span></h2>
        <p class="hero-sub">Scan to join. Tilt to duel. Move too much for the beat and you're out — last knight standing wins the round.</p>

        <div class="attract-cta">
          <div class="qr-box">${qrSvg(joinUrl(state.code))}</div>
          <div class="join-info">
            <div class="lbl">Or type the code at ${esc(location.host)}</div>
            <div class="code">${esc(state.code)}</div>
            <div class="url">${esc(location.host)}/</div>
          </div>
        </div>

        <div class="knights-row">${players().map(knightHTML).join("")}</div>
        <div class="queue-row">
          <span class="queue-text"><b>${total} ${total === 1 ? "knight" : "knights"}</b> in the lobby — ${
            canStart ? "start whenever you're ready" : `need ${MIN_PLAYERS_TO_START}+ to begin`
          }</span>
        </div>
        ${state.isHost
          ? `<div class="stage-cta"><button class="primary" id="startBtn" ${canStart ? "" : "disabled"}>Start the round</button></div>`
          : ""}
      </div>
      <div class="stage-bottom">
        <span>${total} in lobby</span>
        <div class="ticker"><span class="ticker-track">${TICKER}</span></div>
        <span>Tiltyard</span>
      </div>
    </div>`;

  const startBtn = document.getElementById("startBtn");
  if (startBtn)
    startBtn.onclick = () => {
      // Unlock audio here: browsers only allow sound to start from a gesture.
      soundtrack.unlock();
      net.send(C2S.START_GAME);
    };
}

function renderConductorPlaying() {
  const remaining = players().filter((p) => p.alive).length;
  app.innerHTML = `
    <div class="stage ${state.phaseInfo?.className ?? ""}" id="stage">
      ${BLOBS}
      <div class="stage-top">${BRAND}<div class="stage-top-right">
        <button class="mute-btn" id="muteBtn" title="Mute music" aria-label="Mute music">${
          soundtrack.muted ? "🔇" : "🔊"
        }</button>
        <div class="pill">Live</div>
      </div></div>
      <div class="stage-main">
        <p class="phase-name" id="phaseName">${esc(state.phaseInfo?.name ?? "Warm-Up")}</p>
        <p class="phase-caption" id="phaseCaption">${esc(state.phaseInfo?.caption ?? "")}</p>
        <div class="tempo-stage" id="tempoStage" style="--beat:${beatSeconds()}s">
          <div class="tempo-ring"></div>
          <div class="tempo-ring r2"></div>
          <div class="tempo-core"><div class="bpm" id="bpmVal">${state.bpm}</div>
            <div class="bpm-label">BPM</div>
          </div>
        </div>
        <div class="knights-row" id="knightsRow">${players().map(knightHTML).join("")}</div>
      </div>
      <div class="stage-bottom">
        <span id="remainLabel">${remaining} knights remain</span>
        <div class="ticker"><span class="ticker-track">${TICKER}</span></div>
        <span id="phaseHint">${esc(state.phaseInfo?.hint ?? "")}</span>
      </div>
    </div>`;

  const muteBtn = document.getElementById("muteBtn");
  if (muteBtn)
    muteBtn.onclick = () => {
      const muted = soundtrack.toggleMute();
      muteBtn.textContent = muted ? "🔇" : "🔊";
      muteBtn.title = muted ? "Unmute music" : "Mute music";
    };
}

/** In-place update of the conductor during play (no full re-render). */
function updateConductorUI() {
  if (state.role !== "conductor") return;
  const stage = document.getElementById("stage");
  if (!stage) return render();

  stage.classList.remove("phase-danger", "phase-sudden");
  if (state.phaseInfo?.className) stage.classList.add(state.phaseInfo.className);

  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set("phaseName", state.phaseInfo?.name ?? "");
  set("phaseCaption", state.phaseInfo?.caption ?? "");
  set("bpmVal", String(state.bpm));
  set("phaseHint", state.phaseInfo?.hint ?? "");

  const stageEl = document.getElementById("tempoStage");
  if (stageEl) stageEl.style.setProperty("--beat", `${beatSeconds()}s`);

  const row = document.getElementById("knightsRow");
  if (row) row.innerHTML = players().map(knightHTML).join("");

  const remaining = players().filter((p) => p.alive).length;
  set("remainLabel", `${remaining} knights remain`);
}

function renderConductorEnded() {
  app.innerHTML = `
    <div class="stage">
      ${BLOBS}
      <div class="stage-top">${BRAND}<div class="pill">Round over</div></div>
      <div class="stage-main">
        <p class="eyebrow">${state.winnerName ? "Winner" : ""}</p>
        <h2 class="hero-title anton">${state.winnerName ? `${esc(state.winnerName)} wins` : "Draw"}</h2>
        ${state.winnerColor ? `<div class="avatar big av-${state.winnerColor}"></div>` : ""}
        <div class="knights-row">${players().map(knightHTML).join("")}</div>
        ${state.isHost
          ? `<div class="stage-cta"><button class="primary" id="againBtn">Play again</button></div>`
          : ""}
      </div>
      <div class="stage-bottom">
        <span>Round complete</span>
        <div class="ticker"><span class="ticker-track">${TICKER}</span></div>
        <span>Tiltyard</span>
      </div>
    </div>`;
  const againBtn = document.getElementById("againBtn");
  if (againBtn)
    againBtn.onclick = () => {
      soundtrack.unlock();
      net.send(C2S.PLAY_AGAIN);
    };
}

// ---- Player (phone controller) -------------------------------------------
function renderPlayer() {
  if (state.phase === "lobby") return renderPlayerLobby();
  if (state.phase === "countdown") return renderPlayerCountdown();
  if (state.phase === "ended") return renderPlayerEnded();
  return renderPlayerPlaying();
}

function renderPlayerLobby() {
  const mine = me();
  app.innerHTML = playerShell(`
    <div class="screen center">
      ${errorBanner()}
      <div class="knight"><div class="avatar big av-${mine?.color ?? "cyan"}"></div>
        <div class="knight-name">${esc(mine?.name ?? "You")}</div>
      </div>
      <h2 class="anton" style="font-size:1.8rem;margin:0">You're in</h2>
      <p class="hint">Room <b style="color:var(--cyan)">${esc(state.code)}</b></p>
      <p class="hint">Waiting for the host to start the round…</p>
    </div>`);
}

function renderPlayerCountdown() {
  app.innerHTML = playerShell(`
    <div class="screen center">
      <h2 class="anton" style="font-size:2.6rem;margin:0;color:var(--cyan)">Get ready</h2>
      <p class="hint">Slow beat = freeze. Fast beat = charge. Watch the tempo.</p>
    </div>`);
}

function renderPlayerPlaying() {
  const mine = me();
  app.innerHTML = `
    <div class="controller" id="ctrl-root">
      ${BLOBS}
      <div class="ctrl-content">
        <div class="ctrl-topline">
          <span class="ctrl-eyebrow">${esc(mine?.name ?? "You")} · in play</span>
          <h2 class="ctrl-title" id="ctrlTitle">${esc(state.phaseInfo?.name ?? "Get Ready")}</h2>
        </div>
        <div class="ctrl-center">
          <div class="pulse-wrap" style="--beat:${beatSeconds()}s">
            <div class="pulse-ring"></div>
            <div class="pulse-ring r2"></div>
            <div class="pulse-core" id="pulseCore"><div class="dot"></div></div>
          </div>
          <div class="ctrl-tempo"><span id="ctrlBpm">${state.bpm}</span> BPM</div>
          <p class="ctrl-hint">Slow beat: freeze. Fast beat: lunge. Move too much for the beat and you're out.</p>
        </div>
        <div class="ctrl-out">
          <p class="out-big">You're Out</p>
          <p class="out-stat" id="outStat">SURVIVED —</p>
          <p class="out-sub">Spectate on the big screen — you're auto-queued for the next round.</p>
        </div>
        <div style="min-height:20px"></div>
      </div>
    </div>`;

  if (state.eliminatedSelf || !meAlive()) {
    document.getElementById("ctrl-root")?.classList.add("state-out");
  }
}

function updatePlayerTempo() {
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set("ctrlTitle", state.phaseInfo?.name ?? "");
  set("ctrlBpm", String(state.bpm));
  const wrap = document.querySelector(".pulse-wrap");
  if (wrap) wrap.style.setProperty("--beat", `${beatSeconds()}s`);
  // Tint the controller for the danger (slow/freeze) phase.
  const root = document.getElementById("ctrl-root");
  if (root) root.classList.toggle("freeze", state.phaseInfo?.id === "freeze");
}

function renderPlayerEnded() {
  const iWon = state.winnerName && meAlive();
  app.innerHTML = playerShell(
    iWon
      ? `<div class="screen center">
           <div class="avatar big av-${state.winnerColor ?? "cyan"}"></div>
           <h2 class="win-big">You win!</h2>
           <p class="hint">Last knight standing.</p>
         </div>`
      : `<div class="screen center">
           <h2 class="anton" style="font-size:2rem;margin:0">${
             state.winnerName ? `${esc(state.winnerName)} wins` : "Draw"
           }</h2>
           <p class="hint">You're out. You're auto-queued for the next round.</p>
         </div>`
  );
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function boot() {
  wireHandlers();
  render();
  try {
    await net.connect();
  } catch {
    state.error = "Could not reach the server.";
    render();
  }
}

boot();
