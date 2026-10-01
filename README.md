<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>HyperTag XL v0.1.20 | Momentum Fixed</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.4.0/p5.js"></script>
    <style>
        body { margin: 0; background: #010103; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }
        canvas { border: 1px solid #151525; }
    </style>
</head>
<body>
<script>
const WORLD_W = 5000, WORLD_H = 3200;
const GRAVITY = 0.6, JET_POWER = -1.7, MAX_FUEL = 100, REGEN_RATE = 1.3;
const WALL_FUEL_RECOVERY = 45, DASH_IMPULSE = 50, MAX_VEL = 92, SLIDE_POWER = 0.9; 
const P_WIDTH = 26, P_HEIGHT = 72; 

let p1, p2, itID = "p1", platforms = [], movers = [];
let gameState = "MENU", startTime, camX = 2500, camY = 1600, camZoom = 0.4;
let shake = 0, flash = 0;

function setup() { createCanvas(1200, 600); }

function initLevel() {
    platforms = [
        {x: 0, y: WORLD_H - 40, w: WORLD_W, h: 400}, {x: 0, y: -400, w: WORLD_W, h: 400},        
        {x: -400, y: 0, w: 460, h: WORLD_H}, {x: WORLD_W - 60, y: 0, w: 460, h: WORLD_H}, 
        {x: 2000, y: 2600, w: 1000, h: 80}, {x: 1000, y: 2200, w: 600, h: 80}, 
        {x: 3400, y: 2200, w: 600, h: 80}, {x: 2350, y: 1600, w: 300, h: 1000}, 
        {x: 500, y: 1500, w: 800, h: 60}, {x: 3700, y: 1500, w: 800, h: 60},
        {x: 1500, y: 1100, w: 2000, h: 50}, {x: 2000, y: 600, w: 1000, h: 60},
        {x: 200, y: 700, w: 400, h: 60}, {x: 4400, y: 700, w: 400, h: 60}
    ];
    movers = [
        {x: 2500, y: 1300, w: 800, h: 50, ox: 2500, r: 1500, s: 0.012},
        {x: 2500, y: 400, w: 500, h: 50, ox: 2500, r: 1000, s: -0.018}
    ];
    p1 = new Player(400, 2800, "#00ffff", "p1", {l:65, r:68, j:87, d:83, dash:16}); 
    p2 = new Player(4600, 2800, "#ff2266", "p2", {l:74, r:76, j:73, d:75, dash:80}); 
    itID = random() > 0.5 ? "p1" : "p2";
    startTime = millis();
}

class Player {
    constructor(x, y, col, id, keys) {
        this.x = x; this.y = y; this.vx = 0; this.vy = 0;
        this.col = color(col); this.id = id; this.keys = keys;
        this.fuel = MAX_FUEL; this.jumps = 2; this.canJ = true;
        this.jumpTimer = 0; this.dashCD = 0; this.invinc = 0;
        this.dir = 1; this.isSliding = false; this.history = [];
        this.lastWallJumpTime = 0; // Tracking for momentum
    }

    update() {
        if (this.invinc > 0) this.invinc -= deltaTime;
        let onG = this.checkG();
        let nearWall = this.checkWall(this.x-15, this.y) || this.checkWall(this.x+15, this.y);
        
        this.history.push({x: this.x, y: this.y, s: this.isSliding});
        if (this.history.length > 10) this.history.shift();
        
        this.isSliding = keyIsDown(this.keys.d) && onG;
        let input = 0;
        if (keyIsDown(this.keys.l)) { input = -1; this.dir = -1; }
        else if (keyIsDown(this.keys.r)) { input = 1; this.dir = 1; }
        
        if (this.isSliding) { this.vx += input * SLIDE_POWER; this.vx *= 0.988; }
        else { this.vx += input * 2.8; this.vx *= onG ? 0.75 : 0.95; }
        
        if (keyIsDown(this.keys.dash) && millis() > this.dashCD) { 
            this.vx = this.dir * DASH_IMPULSE; 
            this.dashCD = millis() + 1800; 
            shake = 15; 
        }

        let steps = 10; 
        let stepX = this.vx / steps, stepY = (this.vy + GRAVITY) / steps; 
        for (let s = 0; s < steps; s++) {
            let nextX = this.x + stepX;
            if (!this.checkWall(nextX, this.y)) this.x = nextX; else { this.vx *= -0.3; stepX = 0; }
            let nextY = this.y + stepY;
            if (!this.checkWall(this.x, nextY)) this.y = nextY; else { if (this.vy > 0) { this.vy = 0; this.jumps = 2; } else this.vy = 0; stepY = 0; }
        }

        this.x = constrain(this.x, 60, WORLD_W - 60 - P_WIDTH);
        this.y = constrain(this.y, 0, WORLD_H - 40 - P_HEIGHT);

        if (keyIsDown(this.keys.j)) {
            this.jumpTimer += deltaTime;
            if (this.canJ && (onG || nearWall || this.jumps > 0)) {
                // Wall jump momentum calculation
                if (nearWall && !onG) {
                    let now = millis();
                    let timeDiff = now - this.lastWallJumpTime;
                    // Reward fast clicks: Faster click = higher multiplier (1.0 to 1.9x)
                    let mult = map(constrain(timeDiff, 150, 600), 600, 150, 1.0, 1.9);
                    this.vy = -18 * mult;
                    this.lastWallJumpTime = now;
                    this.fuel = min(MAX_FUEL, this.fuel + WALL_FUEL_RECOVERY);
                    if(mult > 1.4) shake = 8;
                } else {
                    this.vy = -16;
                }
                this.jumps--; this.canJ = false;
            } else if (!onG && this.fuel > 0 && this.jumpTimer > 50) { 
                this.vy += JET_POWER; 
                this.fuel -= 2.4; 
            }
        } else { 
            this.canJ = true; 
            this.jumpTimer = 0; 
            if (onG) this.fuel = min(MAX_FUEL, this.fuel + REGEN_RATE); 
        }
        this.vy += (keyIsDown(this.keys.d) && !onG) ? GRAVITY * 10 : GRAVITY;
        this.vx = constrain(this.vx, -MAX_VEL, MAX_VEL); 
        this.vy = constrain(this.vy, -MAX_VEL, MAX_VEL);
    }

    checkWall(tx, ty) {
        let h = this.isSliding ? P_HEIGHT * 0.5 : P_HEIGHT;
        let off = this.isSliding ? P_HEIGHT * 0.5 : 0;
        let hit = false;
        platforms.concat(movers).forEach(p => { 
            if (tx < p.x + p.w && tx + P_WIDTH > p.x && ty + off < p.y + p.h && ty + off + h > p.y) hit = true; 
        });
        return hit;
    }
    checkG() { return this.checkWall(this.x, this.y + 5); }

    draw() {
        let dH = this.isSliding ? P_HEIGHT * 0.5 : P_HEIGHT, dY = this.isSliding ? this.y + P_HEIGHT * 0.5 : this.y;
        this.history.forEach((h, i) => {
            fill(red(this.col), green(this.col), blue(this.col), map(i, 0, this.history.length, 0, 60));
            noStroke(); rect(h.x, h.s ? h.y + P_HEIGHT*0.5 : h.y, P_WIDTH, h.s ? P_HEIGHT*0.5 : P_HEIGHT);
        });
        push();
        if (this.id === itID) {
            drawingContext.shadowBlur = 45; drawingContext.shadowColor = 'red'; fill(255, 30, 30);
        } else { 
            fill(this.col); if (this.invinc > 0 && frameCount % 6 < 3) fill(255, 200); 
        }
        noStroke(); rect(this.x, dY, P_WIDTH, dH);
        if (this.id === itID) {
            let bob = sin(frameCount * 0.12) * 15;
            fill(255, 0, 0); stroke(255); strokeWeight(2);
            push(); translate(this.x + P_WIDTH/2, dY - 75 + bob);
            beginShape(); vertex(-30, 0); vertex(30, 0); vertex(0, 40); endShape(CLOSE);
            pop();
        }
        pop();
    }
}

function resolveTag() {
    let attacker = (itID === "p1") ? p1 : p2;
    let target = (itID === "p1") ? p2 : p1;
    if (target.invinc > 0) return;

    let aH = attacker.isSliding ? P_HEIGHT * 0.5 : P_HEIGHT;
    let aY = attacker.isSliding ? attacker.y + P_HEIGHT * 0.5 : attacker.y;
    let tH = target.isSliding ? P_HEIGHT * 0.5 : P_HEIGHT;
    let tY = target.isSliding ? target.y + P_HEIGHT * 0.5 : target.y;

    // BOX COLLISION (Reliable)
    if (attacker.x < target.x + P_WIDTH && attacker.x + P_WIDTH > target.x &&
        aY < tY + tH && aY + aH > tY) {
        itID = target.id;
        attacker.invinc = 2000; // Shield to prevent instant re-tag
        shake = 40; flash = 255;
    }
}

function draw() {
    background(2, 2, 8);
    if (gameState === "MENU") {
        textAlign(CENTER); fill(0, 255, 255); textSize(80); text("HYPERTAG XL", width/2, height/2);
        textSize(20); fill(255, 150); text("v0.1.20 | MOMENTUM & HITBOX FIX", width/2, height/2 + 50); text("G: START", width/2, height/2 + 90);
    } else if (gameState === "GAME") {
        let minX = min(p1.x, p2.x), maxX = max(p1.x, p2.x) + P_WIDTH, minY = min(p1.y, p2.y), maxY = max(p1.y, p2.y) + P_HEIGHT;
        camX = lerp(camX, (minX + maxX)/2, 0.1); camY = lerp(camY, (minY + maxY)/2, 0.1);
        camZoom = lerp(camZoom, constrain(min(width / (abs(maxX-minX)+600), height / (abs(maxY-minY)+600)), 0.15, 0.9), 0.08);
        
        push(); translate(width/2, height/2); scale(camZoom); translate(-camX + random(-shake, shake), -camY + random(-shake, shake));
        shake *= 0.9; stroke(15, 20, 45); strokeWeight(2);
        for(let i=0; i<=WORLD_W; i+=500) line(i, 0, i, WORLD_H);
        for(let j=0; j<=WORLD_H; j+=500) line(0, j, WORLD_W, j);
        platforms.forEach(p => { fill(15, 15, 25); stroke(60, 70, 110); strokeWeight(4); rect(p.x, p.y, p.w, p.h); });
        movers.forEach(m => { m.x = m.ox + sin(frameCount * m.s) * m.r; fill(30, 40, 90); rect(m.x, m.y, m.w, m.h); });
        p1.update(); p2.update(); resolveTag(); p1.draw(); p2.draw();
        pop();

        if (flash > 0) { fill(255, 0, 0, flash * 0.2); rect(0, 0, width, height); flash -= 15; }
        let rem = ceil(60 - (millis() - startTime)/1000); if (rem <= 0) gameState = "WIN";
        fill(255); textAlign(CENTER); textSize(40); text(rem, width/2, 50);
        drawFuel(50, 40, p1); drawFuel(width-150, 40, p2);
    } else if (gameState === "WIN") {
        textAlign(CENTER); fill(255); textSize(60); text(((itID === "p1") ? "P2" : "P1") + " WINS", width/2, height/2);
        textSize(20); text("M: MENU", width/2, height/2 + 60);
    }
}
function drawFuel(x, y, p) { noStroke(); fill(40); rect(x, y, 100, 10, 5); fill(p.col); rect(x, y, (p.fuel/MAX_FUEL)*100, 10, 5); }
function keyPressed() {
    if (gameState === "MENU" && (key === 'g' || key === 'G')) { initLevel(); gameState = "GAME"; }
    if (gameState === "WIN" && (key === 'm' || key === 'M')) gameState = "MENU";
}
</script>
</body>
</html>


