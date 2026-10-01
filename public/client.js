const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050a12);
scene.fog = new THREE.Fog(0x050a12, 35, 105);
const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.05, 180);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.querySelector('#game').appendChild(renderer.domElement);

const clock = new THREE.Clock();
const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
const remoteMeshes = new Map();
const effects = [];
const keys = new Set();
let myId = null;
let player = { x: 0, y: 1.7, z: 18, yaw: Math.PI, pitch: 0, health: 100, onGround: true };
let velocity = new THREE.Vector3();
let connected = false;
let matchSeconds = 600;
let lastSent = 0;
let canShootAt = 0;

const mat = (color, emissive = 0x000000, roughness = 0.72) => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: emissive ? 1.5 : 0, roughness, metalness: .25 });
const floorMat = mat(0x101d29, 0x06131e);
const neonCyan = mat(0x1cd9f4, 0x00b9dd, .38);
const neonPink = mat(0xff396d, 0xc5003c, .38);
const wallMat = mat(0x172837, 0x07131d);
const darkMat = mat(0x0b121c, 0x02060a);
const addBox = (x, y, z, w, h, d, material, glow = false) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
  if (glow) { const edge = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: material.color })); mesh.add(edge); }
  return mesh;
};

scene.add(new THREE.HemisphereLight(0x9cdcff, 0x071018, 1.1));
const sun = new THREE.DirectionalLight(0xccecff, 2.2); sun.position.set(-25, 35, 18); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); scene.add(sun);
const cyanLight = new THREE.PointLight(0x00d9ff, 12, 30); cyanLight.position.set(-22, 5, -20); scene.add(cyanLight);
const pinkLight = new THREE.PointLight(0xff1f69, 11, 28); pinkLight.position.set(25, 6, 20); scene.add(pinkLight);
addBox(0, -.6, 0, 100, 1, 76, floorMat);
addBox(0, 14, -38, 100, 28, 1, wallMat); addBox(0, 14, 38, 100, 28, 1, wallMat);
addBox(-50, 14, 0, 1, 28, 76, wallMat); addBox(50, 14, 0, 1, 28, 76, wallMat);
addBox(0, 4, 0, 9, 8, 9, darkMat, true); addBox(-19, 2, 1, 13, 4, 4, wallMat, true); addBox(20, 3, -6, 14, 6, 4, wallMat, true);
addBox(-28, 2, 20, 7, 4, 12, wallMat, true); addBox(29, 2, -22, 7, 4, 10, wallMat, true);
addBox(-2, .08, -37.3, 44, .08, .12, neonCyan); addBox(2, .08, 37.3, 44, .08, .12, neonPink);
for (let x = -40; x <= 40; x += 8) { addBox(x, .03, 0, .035, .035, 76, darkMat); }
for (let z = -32; z <= 32; z += 8) { addBox(0, .035, z, 100, .035, .035, darkMat); }

const weapon = new THREE.Group();
const gunBody = new THREE.Mesh(new THREE.BoxGeometry(.22, .18, .72), mat(0x1c2c3c, 0x06121d, .3)); gunBody.position.set(.34, -.28, -.62); weapon.add(gunBody);
const gunGlow = new THREE.Mesh(new THREE.BoxGeometry(.1, .045, .5), neonCyan); gunGlow.position.set(.34, -.2, -.93); weapon.add(gunGlow);
const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .2, 12), neonPink); muzzle.rotation.x = Math.PI / 2; muzzle.position.set(.34, -.28, -1.02); weapon.add(muzzle); camera.add(weapon); scene.add(camera);

function playerMesh(data) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.55, 1.1, 5, 10), mat(data.color, data.color)); body.position.y = 1.25; body.castShadow = true; group.add(body);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(.65, .18, .12), mat(0xdffaff, 0x27dcff, .22)); visor.position.set(0, 1.65, -.45); group.add(visor);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.72, .035, 6, 24), mat(data.color, data.color)); ring.rotation.x = Math.PI / 2; ring.position.y = .08; group.add(ring);
  scene.add(group); return group;
}
function upsertRemote(data) {
  if (data.id === myId) return;
  let item = remoteMeshes.get(data.id);
  if (!item) { item = { mesh: playerMesh(data), target: new THREE.Vector3(), data }; remoteMeshes.set(data.id, item); }
  item.data = data; item.target.set(data.x, 0, data.z); item.mesh.visible = data.alive;
  item.mesh.rotation.y = data.yaw || 0;
}
function removeRemote(id) { const item = remoteMeshes.get(id); if (item) { scene.remove(item.mesh); remoteMeshes.delete(id); } }

function addTracer(origin, direction, hit) {
  const end = new THREE.Vector3(origin.x, origin.y, origin.z).add(new THREE.Vector3(direction.x, direction.y, direction.z).multiplyScalar(hit ? 35 : 22));
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(origin.x, origin.y, origin.z), end]);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: hit ? 0xff477e : 0x35e4ff, transparent: true })); scene.add(line); effects.push({ object: line, ttl: .12 });
}
function shoot() {
  const now = performance.now(); if (!connected || now < canShootAt || !document.pointerLockElement) return;
  canShootAt = now + 145; weapon.position.z = -.08; setTimeout(() => weapon.position.z = 0, 50);
  const direction = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ')).normalize();
  socket.send(JSON.stringify({ type: 'shoot', direction })); addTracer({ x: player.x, y: player.y, z: player.z }, direction, false);
}
function updateScoreboard(list) {
  const sorted = [...list].sort((a, b) => b.score - a.score);
  document.querySelector('#score-list').innerHTML = sorted.map(p => `<div class="score-row ${p.id === myId ? 'me' : ''}"><span>${escapeHtml(p.name)}</span><small>${p.score} / ${p.deaths}</small></div>`).join('');
}
function escapeHtml(value) { return value.replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[c]); }
function feed(text) { const item = document.createElement('div'); item.className = 'feed-line'; item.textContent = text; document.querySelector('#feed').prepend(item); setTimeout(() => item.remove(), 4100); }
function banner(text) { const element = document.querySelector('#banner'); element.textContent = text; element.classList.remove('show'); void element.offsetWidth; element.classList.add('show'); }
function setHealth(value) { player.health = value; document.querySelector('#health-value').textContent = Math.ceil(value); document.querySelector('#health-bar').style.width = `${value}%`; document.querySelector('#health-bar').style.background = value < 35 ? 'var(--pink)' : 'var(--lime)'; }

socket.addEventListener('open', () => { connected = true; document.querySelector('#connection').textContent = 'ONLINE // PORT 8000'; document.querySelector('#connection').style.color = 'var(--lime)'; });
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (message.type === 'welcome') { myId = message.id; message.players.forEach(upsertRemote); updateScoreboard(message.players); }
  if (message.type === 'state') { const mine = message.players.find(p => p.id === myId); if (mine) { setHealth(mine.health); if (!mine.alive) document.querySelector('#damage-flash').style.boxShadow = 'inset 0 0 80px 20px rgba(255,20,80,.65)'; } message.players.forEach(upsertRemote); updateScoreboard(message.players); }
  if (message.type === 'player-left') removeRemote(message.id);
  if (message.type === 'player-joined') { upsertRemote(message.player); feed(`${message.player.name} joined the arena`); }
  if (message.type === 'shot') { if (message.shooter !== myId) addTracer(message.origin, message.direction, !!message.victim); if (message.victim === myId) { document.querySelector('#damage-flash').style.boxShadow = 'inset 0 0 80px 20px rgba(255,20,80,.65)'; setTimeout(() => document.querySelector('#damage-flash').style.boxShadow = '', 130); } if (message.victim === myId || message.victim) { document.querySelector('#hit-marker').style.opacity = message.victim === myId ? 0 : 1; setTimeout(() => document.querySelector('#hit-marker').style.opacity = 0, 90); } }
  if (message.type === 'elimination') { feed(`${message.killer} eliminated ${message.victim}`); if (message.killer === document.querySelector('#name-input').value.toUpperCase()) banner('ELIMINATION'); updateScoreboard(message.players); }
  if (message.type === 'respawn') { upsertRemote(message.player); if (message.player.id === myId) { player.x = message.player.x; player.z = message.player.z; setHealth(100); document.querySelector('#damage-flash').style.boxShadow = ''; banner('BACK IN THE FIGHT'); } }
});

function setPointer() { document.body.requestPointerLock(); }
document.querySelector('#play').addEventListener('click', () => { document.querySelector('#start-screen').style.display = 'none'; setPointer(); });
document.querySelector('#name-input').addEventListener('keydown', event => { if (event.key === 'Enter') document.querySelector('#play').click(); });
document.addEventListener('click', event => { if (document.querySelector('#start-screen').style.display === 'none' && event.target === renderer.domElement) setPointer(); });
document.addEventListener('mousedown', event => { if (event.button === 0) shoot(); });
document.addEventListener('keydown', event => { keys.add(event.code); if (event.code === 'Space') event.preventDefault(); });
document.addEventListener('keyup', event => keys.delete(event.code));
document.addEventListener('mousemove', event => { if (!document.pointerLockElement) return; player.yaw -= event.movementX * .0022; player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - event.movementY * .0022)); });

function updateMovement(dt) {
  if (!document.pointerLockElement) return;
  const forward = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const input = new THREE.Vector3(); if (keys.has('KeyW')) input.add(forward); if (keys.has('KeyS')) input.sub(forward); if (keys.has('KeyD')) input.add(right); if (keys.has('KeyA')) input.sub(right); if (input.lengthSq()) input.normalize();
  const speed = keys.has('ShiftLeft') ? 13 : 8.5; velocity.x = THREE.MathUtils.damp(velocity.x, input.x * speed, 12, dt); velocity.z = THREE.MathUtils.damp(velocity.z, input.z * speed, 12, dt);
  if (keys.has('Space') && player.onGround) { velocity.y = 8; player.onGround = false; }
  velocity.y -= 22 * dt; player.x += velocity.x * dt; player.z += velocity.z * dt; player.y += velocity.y * dt;
  player.x = THREE.MathUtils.clamp(player.x, -46, 46); player.z = THREE.MathUtils.clamp(player.z, -34, 34); if (player.y < 1.7) { player.y = 1.7; velocity.y = 0; player.onGround = true; }
  camera.position.set(player.x, player.y, player.z); camera.rotation.order = 'YXZ'; camera.rotation.y = player.yaw; camera.rotation.x = player.pitch;
  const now = performance.now(); if (now - lastSent > 45 && socket.readyState === 1) { lastSent = now; socket.send(JSON.stringify({ type: 'update', x: player.x, y: player.y, z: player.z, yaw: player.yaw, pitch: player.pitch, name: document.querySelector('#name-input').value.toUpperCase() })); }
}
function animate() {
  requestAnimationFrame(animate); const dt = Math.min(clock.getDelta(), .05); updateMovement(dt);
  for (const item of remoteMeshes.values()) item.mesh.position.lerp(item.target, Math.min(1, dt * 14));
  for (let i = effects.length - 1; i >= 0; i--) { effects[i].ttl -= dt; effects[i].object.material.opacity = Math.max(0, effects[i].ttl / .12); if (effects[i].ttl <= 0) { scene.remove(effects[i].object); effects.splice(i, 1); } }
  matchSeconds = Math.max(0, matchSeconds - dt); const mins = Math.floor(matchSeconds / 60); const secs = String(Math.floor(matchSeconds % 60)).padStart(2, '0'); document.querySelector('#timer').textContent = `${mins}:${secs}`;
  renderer.render(scene, camera);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
animate();
