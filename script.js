// DOM Elements
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const ui = document.getElementById('ui');
const msg = document.getElementById('msg');
const scoreEl = document.getElementById('sc');
const btn = document.getElementById('btn');

// Game Variables
let width, height, dpr;
let gameState = 'START'; // START, PLAYING, OVER
let frames = 0;
let score = 0;
let speed = 0;
let shake = 0;

// Entities
const player = { x: 0, y: 0, vy: 0, r: 0 };
const input = { active: false };
const obstacles = [];
const particles = [];
const rings = [];

// Audio Context
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;
let thrustOscillator = null;
let thrustGainNode = null;
let isThrustSoundPlaying = false;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// Better Audio System
function initThrustSound() {
    if (!audioCtx) return;
    if (thrustOscillator) return; // Already initialized

    const now = audioCtx.currentTime;
    thrustOscillator = audioCtx.createOscillator();
    thrustGainNode = audioCtx.createGain();

    thrustOscillator.type = 'triangle';
    thrustOscillator.frequency.setValueAtTime(150, now);
    
    // Start with 0 volume
    thrustGainNode.gain.setValueAtTime(0, now);
    
    thrustOscillator.connect(thrustGainNode);
    thrustGainNode.connect(audioCtx.destination);
    thrustOscillator.start(now);
}

function updateThrustSound(isThrusting) {
    if (!audioCtx || !thrustOscillator) return;
    
    const now = audioCtx.currentTime;
    const rampTime = 0.1;

    if (isThrusting) {
        // Ramp up volume and pitch
        thrustGainNode.gain.setTargetAtTime(0.15, now, rampTime);
        thrustOscillator.frequency.setTargetAtTime(300, now, rampTime);
    } else {
        // Ramp down
        thrustGainNode.gain.setTargetAtTime(0, now, rampTime);
        thrustOscillator.frequency.setTargetAtTime(150, now, rampTime);
    }
}

function playSfx(type) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'die') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.4);
        
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        
        osc.start(now);
        osc.stop(now + 0.4);
        
        // Stop thrust sound immediately on death
        if (thrustGainNode) {
            thrustGainNode.gain.setTargetAtTime(0, now, 0.01);
        }
    } else if (type === 'coin') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(2000, now + 0.1);
        
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.1);
        
        osc.start(now);
        osc.stop(now + 0.1);
    }
}

function playBass() {
    if (!audioCtx || gameState !== 'PLAYING') return;
    
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.type = 'square';
    // Simple bassline beat
    const freq = (Math.floor(now * 4) % 4 === 0) ? 65.41 : 32.7;
    
    osc.frequency.setValueAtTime(freq, now);
    
    gain.gain.setValueAtTime(0.08, now); // Slightly lower volume
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    
    osc.start(now);
    osc.stop(now + 0.2);
    
    setTimeout(playBass, 250);
}

// Game Logic
function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    
    if (gameState === 'START') {
        reset();
    }
}

function reset() {
    player.x = width * 0.2;
    player.y = height * 0.5;
    player.vy = 0;
    score = 0;
    speed = 6;
    obstacles.length = 0;
    particles.length = 0;
    rings.length = 0;
    scoreEl.innerText = '0';
    shake = 0;
    input.active = false;
}

function spawnObstacle() {
    const gap = 220;
    const minH = 100;
    const maxH = height - gap - minH;
    const y = Math.random() * (maxH - minH) + minH;
    
    obstacles.push({
        x: width + 50,
        w: 60,
        y: y,
        gap: gap,
        passed: false
    });
    
    if (Math.random() > 0.5) {
        rings.push({
            x: width + 80 + Math.random() * 100,
            y: y + gap / 2,
            r: 15
        });
    }
}

function createExplosion(x, y, color) {
    playSfx('die');
    shake = 25;
    for (let i = 0; i < 30; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 20,
            vy: (Math.random() - 0.5) * 20,
            life: 1,
            color: color || `hsl(${Math.random() * 60 + 180}, 100%, 50%)`
        });
    }
}

function update() {
    let shakeX = 0, shakeY = 0;
    if (shake > 0) {
        shakeX = (Math.random() - 0.5) * shake;
        shakeY = (Math.random() - 0.5) * shake;
        shake *= 0.9;
    }
    
    ctx.save();
    ctx.translate(shakeX, shakeY);

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#0d0221');
    bg.addColorStop(1, '#2a0a40');
    ctx.fillStyle = bg;
    ctx.fillRect(-shakeX, -shakeY, width, height);

    // Sun
    const sunY = height * 0.6;
    ctx.fillStyle = '#f09';
    ctx.shadowBlur = 30;
    ctx.shadowColor = '#f09';
    ctx.beginPath();
    ctx.arc(width / 2, sunY, height * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Sun Stripes
    ctx.fillStyle = bg; // Use gradient for stripes? Or solid color matching bg start
    // Actually the original used the gradient object which works if coordinates match
    // Simplified: just use a dark color
    ctx.fillStyle = '#2a0a40'; 
    for (let i = 0; i < 10; i++) {
        ctx.fillRect(width / 2 - height, sunY + (i * 10) + (i * i), height * 2, i * 2);
    }

    // Grid (Retro Vaporwave style)
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    const gridW = 100;
    const gridOffset = (frames * speed) % gridW;
    
    ctx.beginPath();
    // Vertical lines with perspective
    for (let i = -2; i < width / gridW + 4; i++) {
        let x = (i * gridW - gridOffset + (width / 2 - player.x) * 0.5);
        ctx.moveTo(x, height);
        ctx.lineTo((x - width / 2) * 0.2 + width / 2, height * 0.4);
    }
    // Horizontal lines
    let horizY = 0;
    let z = 1;
    while (horizY < height) {
        let y = height - horizY;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        horizY += z;
        z *= 1.2;
    }
    ctx.stroke();

    if (gameState === 'PLAYING') {
        // Player Physics
        if (input.active) {
            player.vy -= 0.6;
            // Particles for thrust
            particles.push({
                x: player.x - 20,
                y: player.y,
                vx: -5 - Math.random() * 5,
                vy: (Math.random() - 0.5) * 2,
                life: 0.5,
                color: '#0ff'
            });
        }
        
        // Update Audio Engine based on input
        updateThrustSound(input.active);

        player.vy += 0.25; // Gravity
        player.vy *= 0.96; // Drag
        player.y += player.vy;
        player.r = player.vy * 0.06; // Rotation

        // Bounds Check
        if (player.y < 0 || player.y > height) die();
        
        // Spawning
        if (frames % 80 === 0) spawnObstacle();

        // Obstacles Logic
        for (let i = obstacles.length - 1; i >= 0; i--) {
            let o = obstacles[i];
            o.x -= speed;
            
            // Score
            if (!o.passed && o.x < player.x) {
                score++;
                scoreEl.innerText = score;
                o.passed = true;
                if (score % 10 === 0) speed += 0.5;
            }
            
            // Cleanup
            if (o.x < -100) {
                obstacles.splice(i, 1);
                continue;
            }
            
            // Collision
            // Simple AABB collision with margin
            if (player.x + 15 > o.x && player.x - 15 < o.x + o.w) {
                if (player.y - 10 < o.y || player.y + 10 > o.y + o.gap) {
                    die();
                }
            }
        }

        // Rings Logic
        for (let i = rings.length - 1; i >= 0; i--) {
            let r = rings[i];
            r.x -= speed;
            const dx = player.x - r.x;
            const dy = player.y - r.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < 30) {
                score += 5;
                scoreEl.innerText = score;
                playSfx('coin');
                rings.splice(i, 1);
                // Sparkles
                for (let j = 0; j < 10; j++) {
                    particles.push({
                        x: r.x,
                        y: r.y,
                        vx: (Math.random() - 0.5) * 10,
                        vy: (Math.random() - 0.5) * 10,
                        life: 0.8,
                        color: '#ff0'
                    });
                }
            } else if (r.x < -50) {
                rings.splice(i, 1);
            }
        }
    }

    // Draw Rings
    ctx.lineWidth = 3;
    rings.forEach(r => {
        ctx.strokeStyle = '#fd0';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ff0';
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.stroke();
    });

    // Draw Obstacles
    ctx.fillStyle = '#0ff';
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#0ff';
    obstacles.forEach(o => {
        ctx.fillRect(o.x, 0, o.w, o.y); // Top pillar
        ctx.fillRect(o.x, o.y + o.gap, o.w, height); // Bottom pillar
    });

    // Draw Player
    if (gameState !== 'OVER') {
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.rotate(player.r);
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#f0f';
        ctx.fillStyle = '#fff';
        
        // Jet body
        ctx.beginPath();
        ctx.moveTo(20, 0);
        ctx.lineTo(-10, 10);
        ctx.lineTo(-5, 0);
        ctx.lineTo(-10, -10);
        ctx.fill();
        
        // Wings
        ctx.fillStyle = '#f0f';
        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.lineTo(-20, 15);
        ctx.lineTo(-10, 0);
        ctx.lineTo(-20, -15);
        ctx.fill();
        ctx.restore();
    }

    // Draw Particles
    particles.forEach((pt, i) => {
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.life -= 0.03;
        
        if (pt.life <= 0) {
            particles.splice(i, 1);
        } else {
            ctx.globalAlpha = pt.life;
            ctx.fillStyle = pt.color;
            ctx.shadowBlur = 10;
            ctx.fillRect(pt.x, pt.y, 4, 4);
        }
    });
    ctx.globalAlpha = 1;

    ctx.restore();
    frames++;
    requestAnimationFrame(update);
}

function die() {
    gameState = 'OVER';
    createExplosion(player.x, player.y);
    ui.classList.remove('hidden');
    msg.innerHTML = `CRASHED<div class="sub">SCORE: ${score}</div>`;
    btn.innerText = "REBOOT";
    
    // Stop thrust sound
    updateThrustSound(false);
}

function startGame() {
    initAudio();
    initThrustSound();
    
    ui.classList.add('hidden');
    reset();
    gameState = 'PLAYING';
    playBass();
}

// Input Handlers
const handleDown = (e) => {
    // If clicking the button, let it handle itself
    if (e.target === btn) return;
    
    // Prevent scrolling for Space and arrow keys
    if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
    }
    
    if (gameState === 'PLAYING') {
        input.active = true;
    }
};

const handleUp = (e) => {
    // Prevent scrolling for Space and arrow keys
    if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
    }
    input.active = false;
};

// Keyboard Support
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
        // If game is over or not started, space can restart it
        if (gameState !== 'PLAYING' && !ui.classList.contains('hidden')) {
             startGame();
             return;
        }
        handleDown(e);
    }
});

window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
        handleUp(e);
    }
});

// Touch/Mouse Support
window.addEventListener('mousedown', (e) => {
    if (e.target !== btn) handleDown(e);
});
window.addEventListener('mouseup', handleUp);
window.addEventListener('touchstart', (e) => {
    if (e.target !== btn) handleDown(e);
}, { passive: false });
window.addEventListener('touchend', handleUp);

btn.addEventListener('click', startGame);
window.addEventListener('resize', resize);

// Init
resize();
reset();
update();
