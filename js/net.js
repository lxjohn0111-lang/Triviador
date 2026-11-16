// Online play: room codes, lobby and match relay. The host runs the engine; guests mirror it.
// Transport: WebRTC data channels through PeerJS (signalling via the public PeerJS server,
// with its STUN/TURN servers). A BroadcastChannel transport exists for same-browser testing.
const PROTO = 1;
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newCode = () => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
const ID_PREFIX = 'borderwise-v1-';

let peerLib = null;
function loadPeerLib() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (peerLib) return peerLib;
  peerLib = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'js/vendor/peerjs.min.js'; s.async = true;
    s.onload = () => (window.Peer ? res(window.Peer) : rej(new Error('unavailable')));
    s.onerror = () => { peerLib = null; rej(new Error('unavailable')); };
    document.head.appendChild(s);
  });
  return peerLib;
}
// test hook: ?peerhost=127.0.0.1:9000 points PeerJS at a self-hosted signalling server
const peerOpts = () => { const m = /[?&]peerhost=([\w.-]+):(\d+)/.exec(location.search); return m ? { debug: 0, host: m[1], port: +m[2], path: '/', secure: false } : { debug: 0 }; };
const withTimeout = (p, ms, err) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(err)), ms))]);
export const netAvailable = () => typeof RTCPeerConnection !== 'undefined' || /[?&]nettest=local/.test(location.search);

// ---------------- transports ----------------
// Host transport: onJoin(id) onLeave(id) onMsg(id,msg) send(id|null,msg) close()
// Guest transport: onMsg(msg) onClose() send(msg) close()

class PeerHost {
  static async open(code) {
    const Peer = await loadPeerLib();
    const t = new PeerHost(); t.conns = new Map();
    const peer = new Peer(ID_PREFIX + code, peerOpts());
    t.peer = peer;
    await withTimeout(new Promise((res, rej) => { peer.on('open', res); peer.on('error', (e) => rej(new Error(e && e.type === 'unavailable-id' ? 'taken' : 'unavailable'))); }), 12000, 'unavailable');
    peer.on('connection', (conn) => {
      conn.on('open', () => { t.conns.set(conn.peer, conn); t.onJoin && t.onJoin(conn.peer); });
      conn.on('data', (d) => t.onMsg && t.onMsg(conn.peer, d));
      const gone = () => { if (t.conns.get(conn.peer) === conn) { t.conns.delete(conn.peer); t.onLeave && t.onLeave(conn.peer); } };
      conn.on('close', gone); conn.on('error', gone);
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
    return t;
  }
  send(id, msg) { if (id == null) { for (const c of this.conns.values()) { try { c.send(msg); } catch (e) { /* ignore */ } } } else { const c = this.conns.get(id); if (c) try { c.send(msg); } catch (e) { /* ignore */ } } }
  kick(id) { const c = this.conns.get(id); if (c) { try { c.close(); } catch (e) { /* ignore */ } } }
  close() { try { this.peer.destroy(); } catch (e) { /* ignore */ } }
}
class PeerGuest {
  static async open(code) {
    const Peer = await loadPeerLib();
    const t = new PeerGuest();
    const peer = new Peer(peerOpts()); t.peer = peer;
    await withTimeout(new Promise((res, rej) => { peer.on('open', res); peer.on('error', () => rej(new Error('unavailable'))); }), 12000, 'unavailable');
    const conn = peer.connect(ID_PREFIX + code, { reliable: true, serialization: 'json' }); t.conn = conn;
    await withTimeout(new Promise((res, rej) => { conn.on('open', res); peer.on('error', (e) => rej(new Error(e && e.type === 'peer-unavailable' ? 'not_found' : 'unavailable'))); conn.on('error', () => rej(new Error('unavailable'))); }), 15000, 'not_found');
    conn.on('data', (d) => t.onMsg && t.onMsg(d));
    let closed = false; const gone = () => { if (closed) return; closed = true; t.onClose && t.onClose(); };
    conn.on('close', gone); peer.on('error', (e) => { if (e && (e.type === 'peer-unavailable' || e.type === 'network')) gone(); });
    return t;
  }
  send(msg) { try { this.conn.send(msg); } catch (e) { /* ignore */ } }
  close() { try { this.conn.close(); } catch (e) { /* ignore */ } try { this.peer.destroy(); } catch (e) { /* ignore */ } }
}

// Same-browser transport (tabs/windows of one browser profile) - used by automated tests.
class LocalHost {
  static async open(code) {
    const t = new LocalHost(); t.ch = new BroadcastChannel('bw-' + code); t.peers = new Set();
    t.ch.onmessage = (ev) => { const { from, to, m } = ev.data || {}; if (to !== 'host' || !from) return; if (!t.peers.has(from)) { t.peers.add(from); t.onJoin && t.onJoin(from); } if (m && m.k === 'bye') { t.peers.delete(from); t.onLeave && t.onLeave(from); return; } t.onMsg && t.onMsg(from, m); };
    return t;
  }
  send(id, msg) { this.ch.postMessage({ from: 'host', to: id == null ? '*' : id, m: msg }); }
  kick(id) { this.send(id, { k: 'closed', reason: 'kicked' }); }
  close() { this.send(null, { k: 'closed', reason: 'host' }); this.ch.close(); }
}
class LocalGuest {
  static async open(code) {
    const t = new LocalGuest(); t.id = 'g' + Math.random().toString(36).slice(2, 9); t.ch = new BroadcastChannel('bw-' + code);
    t.ch.onmessage = (ev) => { const { from, to, m } = ev.data || {}; if (from !== 'host' || (to !== '*' && to !== t.id)) return; t.onMsg && t.onMsg(m); };
    return t;
  }
  send(msg) { this.ch.postMessage({ from: this.id, to: 'host', m: msg }); }
  close() { this.send({ k: 'bye' }); this.ch.close(); }
}
const TRANSPORT = () => (/[?&]nettest=local/.test(location.search) ? { Host: LocalHost, Guest: LocalGuest } : { Host: PeerHost, Guest: PeerGuest });

// ---------------- sessions ----------------
// Host: owns the lobby, starts the match, relays engine events, feeds guest inputs to the engine.
export class HostSession {
  static async create(me, settings) {
    const T = TRANSPORT();
    let code, tr, err;
    for (let i = 0; i < 4 && !tr; i++) { code = newCode(); try { tr = await T.Host.open(code); } catch (e) { err = e; if (e.message !== 'taken') break; } }
    if (!tr) throw err || new Error('unavailable');
    return new HostSession(tr, code, me, settings);
  }
  constructor(tr, code, me, settings) {
    this.tr = tr; this.code = code; this.settings = settings; this.started = false; this.engine = null; this.pidOf = new Map(); this.lastSeen = new Map();
    this.seats = [{ peer: null, name: me.name, color: me.color, emblem: me.emblem }];
    this.onLobby = null; this.onGuestLeft = null;
    tr.onJoin = (id) => { this.lastSeen.set(id, Date.now()); };
    tr.onLeave = (id) => this.drop(id);
    tr.onMsg = (id, m) => this.onMsg(id, m);
    this.hb = setInterval(() => { this.tr.send(null, { k: 'hb' }); const now = Date.now(); for (const [id, ts] of this.lastSeen) if (now - ts > 15000) this.drop(id); if (!this.started) this.broadcastLobby(); }, 3000);
  }
  lobbyMsg() { return { k: 'lobby', code: this.code, seats: this.seats.map((s) => ({ peer: s.peer, name: s.name, color: s.color, emblem: s.emblem })), ...this.settings }; }
  broadcastLobby() { this.tr.send(null, this.lobbyMsg()); this.onLobby && this.onLobby(this.lobbyMsg()); }
  setSettings(s) { Object.assign(this.settings, s); this.broadcastLobby(); }
  onMsg(id, m) {
    if (!m || typeof m !== 'object') return;
    this.lastSeen.set(id, Date.now());
    if (m.k === 'hello') {
      if (m.v !== PROTO) { this.tr.send(id, { k: 'closed', reason: 'version' }); return; }
      if (this.started) { this.tr.send(id, { k: 'closed', reason: 'started' }); return; }
      let s = this.seats.find((x) => x.peer === id);
      if (!s) { if (this.seats.length >= 3) { this.tr.send(id, { k: 'closed', reason: 'full' }); return; } s = { peer: id }; this.seats.push(s); }
      s.name = String(m.name || 'Player').slice(0, 16); s.color = Math.max(0, Math.min(7, m.color | 0)); s.emblem = Math.max(0, Math.min(11, m.emblem | 0));
      this.broadcastLobby();
    } else if (m.k === 'ready') { const pid = this.pidOf.get(id); if (pid != null && this._ready) this._ready(pid); }
    else if (m.k === 'in') { const pid = this.pidOf.get(id); if (pid != null && this.engine) this.engine.input(pid, { req: m.req, a: m.a, v: m.v }); }
    else if (m.k === 'bye') this.drop(id);
  }
  drop(id) {
    this.lastSeen.delete(id);
    if (!this.started) { const n = this.seats.length; this.seats = this.seats.filter((s) => s.peer !== id); if (this.seats.length !== n) this.broadcastLobby(); return; }
    const pid = this.pidOf.get(id); if (pid == null) return; this.pidOf.delete(id);
    if (this.engine) this.engine.botify(pid);
  }
  // players: engine players (index = pid) with .peer on guests. Waits until guests have loaded the map.
  async begin(players, mapInfo) {
    this.started = true;
    players.forEach((p) => { if (p.peer) this.pidOf.set(p.peer, p.id); });
    const pub = players.map(({ id, name, color, emblem, kind }) => ({ id, name, color, emblem, kind }));
    const waiting = new Set(players.filter((p) => p.peer).map((p) => p.id));
    const allReady = new Promise((res) => { this._ready = (pid) => { waiting.delete(pid); if (!waiting.size) res(); }; if (!waiting.size) res(); });
    for (const p of players) if (p.peer) this.tr.send(p.peer, { k: 'start', you: p.id, players: pub, ...mapInfo });
    await Promise.race([allReady, new Promise((r) => setTimeout(r, 20000))]);
    for (const pid of waiting) { const p = players[pid]; if (p.peer) { this.pidOf.delete(p.peer); p.kind = 'bot'; p.name += ' (bot)'; } }
  }
  relay(e) { this.tr.send(null, { k: 'ev', e }); }
  close() { clearInterval(this.hb); try { this.tr.send(null, { k: 'closed', reason: 'host' }); } catch (e) { /* ignore */ } setTimeout(() => this.tr.close(), 300); }
}

// Guest: joins by code, shows the lobby, then mirrors the host's match.
export class GuestSession {
  static async join(code, me) {
    const T = TRANSPORT();
    const tr = await T.Guest.open(code);
    return new GuestSession(tr, code, me);
  }
  constructor(tr, code, me) {
    this.tr = tr; this.code = code; this.me = me; this.closed = false; this.lastSeen = Date.now();
    this.onLobby = null; this.onStart = null; this.onEvent = null; this.onClosed = null;
    tr.onMsg = (m) => this.onMsg(m);
    tr.onClose = () => this.end('host');
    const hello = () => this.tr.send({ k: 'hello', v: PROTO, name: me.name, color: me.color, emblem: me.emblem });
    hello(); this.helloT = setInterval(() => { if (!this.inLobby) hello(); }, 1500);
    this.hb = setInterval(() => { this.tr.send({ k: 'hb' }); if (Date.now() - this.lastSeen > 15000) this.end('host'); }, 3000);
  }
  onMsg(m) {
    if (!m || typeof m !== 'object' || this.closed) return;
    this.lastSeen = Date.now();
    if (m.k === 'lobby') { this.inLobby = true; this.onLobby && this.onLobby(m); }
    else if (m.k === 'start') { clearInterval(this.helloT); this.onStart && this.onStart(m); }
    else if (m.k === 'ev') { this.onEvent && this.onEvent(m.e); }
    else if (m.k === 'closed') this.end(m.reason || 'host');
  }
  ready() { this.tr.send({ k: 'ready' }); }
  input(msg) { this.tr.send({ k: 'in', ...msg }); }
  end(reason) { if (this.closed) return; this.closed = true; clearInterval(this.hb); clearInterval(this.helloT); this.onClosed && this.onClosed(reason); }
  close() { if (!this.closed) { this.closed = true; clearInterval(this.hb); clearInterval(this.helloT); } this.tr.close(); }
}
