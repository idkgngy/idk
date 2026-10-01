const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 8000);
const ROOT = __dirname;
const clients = new Map();
const players = new Map();
const colors = ['#ff4d7d', '#38e8ff', '#ffc857', '#a978ff', '#63f59b', '#ff8b4d'];
const weapons = {
  pulse: { damage: 34, cooldown: 130, pellets: 1 },
  burst: { damage: 18, cooldown: 260, pellets: 3 },
  scatter: { damage: 12, cooldown: 620, pellets: 7 },
  beam: { damage: 52, cooldown: 900, pellets: 1 }
};
const spawns = [
  { x: -24, z: -18 }, { x: 24, z: 18 }, { x: 24, z: -18 }, { x: -24, z: 18 },
  { x: 0, z: -25 }, { x: 0, z: 25 }
];

function spawnFor(index) {
  const spawn = spawns[index % spawns.length];
  return { x: spawn.x, y: 1.7, z: spawn.z };
}

function publicState() {
  return [...players.values()].map(({ id, name, color, x, y, z, yaw, pitch, health, score, deaths, alive, weapon }) => ({
    id, name, color, x, y, z, yaw, pitch, health, score, deaths, alive, weapon
  }));
}

function broadcast(message) {
  const data = JSON.stringify(message);
  for (const socket of clients.keys()) {
    if (socket.readyState === 1) socket.send(data);
  }
}

function send(socket, message) {
  if (socket.readyState === 1) socket.send(JSON.stringify(message));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function rayHits(origin, direction, target) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dz = target.z - origin.z;
  const along = dx * direction.x + dy * direction.y + dz * direction.z;
  if (along < 0 || along > 90) return false;
  const closest = { x: origin.x + direction.x * along, y: origin.y + direction.y * along, z: origin.z + direction.z * along };
  return Math.hypot(target.x - closest.x, target.y - closest.y, target.z - closest.z) < 1.25;
}

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((request, response) => {
  const requested = request.url === '/' ? '/index.html' : request.url.split('?')[0];
  const file = path.normalize(path.join(ROOT, 'public', requested));
  if (!file.startsWith(path.join(ROOT, 'public'))) {
    response.writeHead(403); response.end('Forbidden'); return;
  }
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    response.end(data);
  });
});

const wss = new WebSocketServer({ server });
wss.on('connection', (socket) => {
  const id = Math.random().toString(36).slice(2, 9);
  const position = spawnFor(players.size);
  const player = { id, name: `Ranger-${id.slice(0, 3).toUpperCase()}`, color: colors[players.size % colors.length], ...position, yaw: 0, pitch: 0, health: 100, score: 0, deaths: 0, alive: true, weapon: 'pulse', lastShot: 0 };
  clients.set(socket, id);
  players.set(id, player);
  send(socket, { type: 'welcome', id, players: publicState() });
  broadcast({ type: 'player-joined', player });

  socket.on('message', (raw) => {
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    const current = players.get(id);
    if (!current) return;
    if (message.type === 'update') {
      if (!current.alive) return;
      current.x = Math.max(-43, Math.min(43, Number(message.x) || 0));
      current.y = Math.max(1.2, Math.min(8, Number(message.y) || 1.7));
      current.z = Math.max(-31, Math.min(31, Number(message.z) || 0));
      current.yaw = Number(message.yaw) || 0;
      current.pitch = Number(message.pitch) || 0;
      if (weapons[message.weapon]) current.weapon = message.weapon;
      if (typeof message.name === 'string' && message.name.trim()) current.name = message.name.trim().slice(0, 16);
    }
    if (message.type === 'shoot' && current.alive && Date.now() - current.lastShot > (weapons[current.weapon]?.cooldown || 130)) {
      current.lastShot = Date.now();
      const profile = weapons[current.weapon];
      const directions = Array.isArray(message.directions) ? message.directions.slice(0, profile.pellets) : [message.direction || {}];
      const origin = { x: current.x, y: current.y, z: current.z };
      const victims = new Set();
      for (const direction of directions) {
        for (const target of players.values()) {
          if (target.id !== id && target.alive && distance(current, target) < 90 && rayHits(origin, direction, target)) { victims.add(target); break; }
        }
      }
      broadcast({ type: 'shot', shooter: id, origin, directions, victims: [...victims].map(target => target.id), weapon: current.weapon });
      for (const victim of victims) {
        victim.health -= profile.damage;
        if (victim.health <= 0) {
          victim.health = 0; victim.alive = false; victim.deaths += 1; current.score += 1;
          broadcast({ type: 'elimination', killer: current.name, victim: victim.name, players: publicState() });
          setTimeout(() => {
            if (!players.has(victim.id)) return;
            Object.assign(victim, spawnFor(Math.floor(Math.random() * spawns.length)), { health: 100, alive: true });
            broadcast({ type: 'respawn', player: victim });
          }, 2200);
        }
      }
    }
  });

  socket.on('close', () => {
    clients.delete(socket); players.delete(id); broadcast({ type: 'player-left', id });
  });
});

setInterval(() => broadcast({ type: 'state', players: publicState() }), 50);
server.listen(PORT, '0.0.0.0', () => console.log(`Neon Strike Arena listening on http://localhost:${PORT}`));
