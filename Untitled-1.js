// =====================================
// LIQUID MUSIC
// =====================================

const TWO_PI = Math.PI * 2;
const POINT_COUNT = 220;
const MAX_PARTICLES = 2400;

let sensitivity = 7;

let mode = 0;
let autoMode = false;
let modeBlend = 0;
let lastModeChange = 0;

let audioContext = null;
let analyser = null;
let frequencyData = null;
let previousSpectrum = null;

let audioSource = null;
let audioStream = null;
let audioPlayer = null;
let audioURL = null;
let monitorGain = null;

let bass = 0;
let mid = 0;
let treble = 0;
let volume = 0;

let previousBass = 0;
let previousMid = 0;
let previousTreble = 0;

let bassAttack = 0;
let midAttack = 0;
let highAttack = 0;
let spectralFlux = 0;

let beatPulse = 0;
let highPulse = 0;

let lastBurst = -100;
let lastRipple = -100;

let fluid = [];
let particles = [];
let blobs = [];
let ripples = [];
let sparks = [];
let dissolveDots = [];

let centerX = 0;
let centerY = 0;
let baseRadius = 100;
let fluidTime = 0;
let frameAudio = 0;

// =====================================
// INITIALIZATION
// =====================================

function setup() {
  const container = document.getElementById("visualizer");
  if (!container) return;

  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent(container);

  pixelDensity(1);
  frameRate(60);
  noiseDetail(4, 0.5);

  centerX = width / 2;
  centerY = height / 2;

  baseRadius = min(width, height) * 0.21;

  initializeFluid();

  background(232, 229, 223);
}

function initializeFluid() {
  fluid = [];

  for (let i = 0; i < POINT_COUNT; i++) {
    fluid.push({
      radius: baseRadius,
      velocity: 0
    });
  }
}

// =====================================
// MAIN LOOP
// =====================================

function draw() {
  background(232, 229, 223, 95);

  updateAudio();
  updateFluid();

  updateParticles();
  updateBlobs();
  updateRipples();
  updateSparks();
  updateDissolve();

  drawRipples();
  drawFluid();
  drawInternalParticles();
  drawBlobs();
  drawParticles();
  drawSparks();
  drawDissolve();

  modeBlend = min(1, modeBlend + 0.028);

  if (
    autoMode &&
    frameCount - lastModeChange > 480 &&
    audioSource &&
    frameAudio > 0.085
  ) {
    let options;

    if (volume < 0.11) {
      options = [1, 2];
    } else if (frameAudio > 0.28) {
      options = [3, 4];
    } else {
      options = [0, 2, 4];
    }

    setMode(random(options));
  }
}

// =====================================
// AUDIO ANALYSIS
// =====================================

function updateAudio() {
  if (!analyser || !audioSource || !frequencyData || !previousSpectrum) {
    bass = lerp(bass, 0.03, 0.08);
    mid = lerp(mid, 0.02, 0.08);
    treble = lerp(treble, 0.01, 0.08);
    volume = lerp(volume, 0, 0.08);

    bassAttack = 0;
    midAttack = 0;
    highAttack = 0;
    spectralFlux = 0;
    frameAudio = 0;

    return;
  }

  analyser.getByteFrequencyData(frequencyData);

  let low = 0;
  let middle = 0;
  let high = 0;

  let lc = 0;
  let mc = 0;
  let hc = 0;
  let flux = 0;

  const binHz = audioContext.sampleRate / analyser.fftSize;

  for (let i = 1; i < frequencyData.length; i++) {
    const hz = i * binHz;

    if (hz > 12000) break;

    const value = frequencyData[i] / 255;

    if (hz < 180) {
      low += value;
      lc++;
    } else if (hz < 2500) {
      middle += value;
      mc++;
    } else {
      high += value;
      hc++;
    }

    const difference = value - previousSpectrum[i];

    if (difference > 0) {
      flux += difference;
    }

    previousSpectrum[i] = value;
  }

  const rawBass = low / max(1, lc);
  const rawMid = middle / max(1, mc);
  const rawHigh = high / max(1, hc);

  bass = lerp(bass, rawBass, 0.45);
  mid = lerp(mid, rawMid, 0.45);
  treble = lerp(treble, rawHigh, 0.5);

  volume = bass * 0.4 + mid * 0.3 + treble * 0.3;

  bassAttack = max(0, bass - previousBass);
  midAttack = max(0, mid - previousMid);
  highAttack = max(0, treble - previousTreble);

  spectralFlux = flux / max(1, lc + mc + hc);

  previousBass = bass;
  previousMid = mid;
  previousTreble = treble;
}

// =====================================
// FLUID PHYSICS
// =====================================

function updateFluid() {
  const reaction =
    bassAttack * 2 +
    midAttack * 1.5 +
    highAttack * 2.5 +
    spectralFlux * 3;

  const amplified = reaction * sensitivity;

  frameAudio = amplified;

  fluidTime +=
    0.007 +
    volume * 0.04 +
    amplified * 0.008;

  if (audioSource && amplified > 0.025) {
    beatPulse = max(
      beatPulse,
      min(1.8, amplified * 1.5)
    );

    highPulse = max(
      highPulse,
      min(1.5, highAttack * sensitivity * 5)
    );

    emitFineParticles(amplified);

    if (
      amplified > 0.25 &&
      frameCount - lastBurst > 10
    ) {
      createBurst(constrain(amplified, 0.3, 1.8));
      lastBurst = frameCount;
    }

    if (
      amplified > 0.12 &&
      frameCount - lastRipple > 8
    ) {
      createRipple(amplified);
      lastRipple = frameCount;
    }

    if (mode === 4 && amplified > 0.045) {
      spawnDissolve(amplified);
    }
  }

  beatPulse *= 0.84;
  highPulse *= 0.75;

  const targets = [];
  const velocities = [];

  for (let i = 0; i < POINT_COUNT; i++) {
    const angle = i / POINT_COUNT * TWO_PI;

    const n1 = noise(
      cos(angle) * 1.2 + 10,
      sin(angle) * 1.2 + 10,
      fluidTime * 0.6
    ) - 0.5;

    const n2 = noise(
      cos(angle) * 2.7 + 30,
      sin(angle) * 2.7 + 30,
      fluidTime
    ) - 0.5;

    const n3 = noise(
      cos(angle) * 5 + 60,
      sin(angle) * 5 + 60,
      fluidTime * 1.3
    ) - 0.5;

    let deformation =
      n1 * baseRadius * 0.42 +
      n2 * baseRadius * 0.17 +
      n3 * baseRadius * 0.06 * (1 + highPulse * 2);

    let expansion =
      bass * baseRadius * 0.24 +
      beatPulse * baseRadius * 0.16;

    // BREATH
    if (mode === 1) {
      const wave =
        sin(fluidTime * 2.1 + angle * 2) * 0.045 +
        sin(fluidTime * 1.2 - angle * 3) * 0.025;

      deformation += wave * baseRadius * modeBlend;

      expansion +=
        baseRadius *
        (0.025 + 0.055 * beatPulse) *
        modeBlend;
    }

    // FRAGMENT
    if (mode === 3) {
      deformation +=
        n2 * baseRadius * 0.13 * modeBlend;
    }

    // DISSOLVE
    if (mode === 4) {
      deformation +=
        n3 * baseRadius * 0.10 * modeBlend;
    }

    targets[i] =
      baseRadius + deformation + expansion;
  }

  for (let i = 0; i < POINT_COUNT; i++) {
    const p = fluid[i];

    const left =
      fluid[(i - 1 + POINT_COUNT) % POINT_COUNT];

    const right =
      fluid[(i + 1) % POINT_COUNT];

    const left3 =
      fluid[(i - 3 + POINT_COUNT) % POINT_COUNT];

    const right3 =
      fluid[(i + 3) % POINT_COUNT];

    const tension =
      (left.radius + right.radius - 2 * p.radius) * 0.25 +
      (left3.radius + right3.radius - 2 * p.radius) * 0.04;

    const spring =
      (targets[i] - p.radius) * 0.045;

    velocities[i] =
      (p.velocity + spring + tension) * 0.87;
  }

  for (let i = 0; i < POINT_COUNT; i++) {
    fluid[i].velocity = velocities[i];

    fluid[i].radius = constrain(
      fluid[i].radius + velocities[i],
      baseRadius * 0.5,
      baseRadius * 1.9
    );
  }
}

// =====================================
// FLUID RADIUS
// =====================================

function getFluidRadius(angle) {
  const a = ((angle % TWO_PI) + TWO_PI) % TWO_PI;

  const indexFloat = a / TWO_PI * POINT_COUNT;
  const index = floor(indexFloat);

  return lerp(
    fluid[index % POINT_COUNT].radius,
    fluid[(index + 1) % POINT_COUNT].radius,
    indexFloat - index
  );
}

// =====================================
// PARTICLES
// =====================================

function emitFineParticles(power) {
  const count = floor(constrain(power * 22, 1, 28));

  for (let i = 0; i < count; i++) {
    const angle = random(TWO_PI);
    const radius = getFluidRadius(angle);
    const speed = random(0.5, 2.2) + power * 2;

    spawnParticle(
      centerX + cos(angle) * radius,
      centerY + sin(angle) * radius,
      cos(angle) * speed + random(-0.5, 0.5),
      sin(angle) * speed + random(-0.5, 0.5),
      random(0.6, 2.8),
      random(70, 150)
    );
  }
}

function spawnParticle(x, y, vx, vy, radius, life) {
  if (particles.length >= MAX_PARTICLES) {
    particles.splice(0, 100);
  }

  particles.push({
    x, y, vx, vy,
    radius,
    life,
    maxLife: life,
    seed: random(1000)
  });
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    const flowX =
      noise(p.seed, p.x * 0.003, fluidTime * 0.4) - 0.5;

    const flowY =
      noise(p.seed + 100, p.y * 0.003, fluidTime * 0.4) - 0.5;

    p.vx = p.vx * 0.958 + flowX * 0.075;
    p.vy = p.vy * 0.958 + flowY * 0.075;

    // ORBIT
    if (mode === 2) {
      const dx = p.x - centerX;
      const dy = p.y - centerY;
      const distance = max(1, sqrt(dx * dx + dy * dy));

      p.vx += -dy / distance * 0.095 * modeBlend;
      p.vy += dx / distance * 0.095 * modeBlend;
    }

    p.x += p.vx;
    p.y += p.vy;
    p.life--;

    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

// =====================================
// BURSTS
// =====================================

function createBurst(power) {
  const direction = random(TWO_PI);
  const spread = random(0.2, 0.5);
  const count = floor(40 + power * 110);
  const radius = getFluidRadius(direction);

  blobs.push({
    x: centerX + cos(direction) * radius,
    y: centerY + sin(direction) * radius,
    vx: cos(direction) * (2 + power * 5),
    vy: sin(direction) * (2 + power * 5),
    radius: random(8, 18),
    life: 100,
    maxLife: 100,
    seed: random(1000)
  });

  for (let i = 0; i < count; i++) {
    const angle =
      direction + randomGaussian() * spread;

    const r = getFluidRadius(angle);
    const speed = random(1, 5) * (1 + power);

    spawnParticle(
      centerX + cos(angle) * r,
      centerY + sin(angle) * r,
      cos(angle) * speed + random(-1, 1),
      sin(angle) * speed + random(-1, 1),
      random(1, 5),
      random(80, 170)
    );
  }

  for (let i = 0; i < POINT_COUNT; i++) {
    const angle = i / POINT_COUNT * TWO_PI;

    const difference = atan2(
      sin(angle - direction),
      cos(angle - direction)
    );

    fluid[i].velocity -=
      power * 14 *
      exp(
        -difference * difference /
        (2 * 0.16 * 0.16)
      );
  }

  for (let i = 0; i < 25; i++) {
    const angle = direction + random(-0.7, 0.7);
    const speed = random(2, 7);

    sparks.push({
      x: centerX + cos(direction) * radius,
      y: centerY + sin(direction) * radius,
      vx: cos(angle) * speed,
      vy: sin(angle) * speed,
      life: random(12, 35),
      maxLife: 35
    });
  }

  if (sparks.length > 400) {
    sparks.splice(0, sparks.length - 400);
  }

  if (mode === 3) {
    for (let i = 0; i < 3; i++) {
      blobs.push({
        x: centerX + cos(direction) * radius,
        y: centerY + sin(direction) * radius,
        vx: random(-5, 5),
        vy: random(-5, 5),
        radius: random(5, 13),
        life: 110,
        maxLife: 110,
        seed: random(1000)
      });
    }
  }
}

// =====================================
// BLOBS
// =====================================

function updateBlobs() {
  for (let i = blobs.length - 1; i >= 0; i--) {
    const b = blobs[i];

    b.vx =
      b.vx * 0.96 +
      (noise(b.seed, fluidTime) - 0.5) * 0.12;

    b.vy =
      b.vy * 0.96 +
      (noise(b.seed + 10, fluidTime) - 0.5) * 0.12;

    b.x += b.vx;
    b.y += b.vy;
    b.life--;

    if (b.life % 10 === 0) {
      for (let j = 0; j < 3; j++) {
        spawnParticle(
          b.x + random(-b.radius, b.radius),
          b.y + random(-b.radius, b.radius),
          b.vx + random(-1, 1),
          b.vy + random(-1, 1),
          random(0.8, 3),
          random(60, 120)
        );
      }
    }

    if (b.life <= 0) {
      blobs.splice(i, 1);
    }
  }
}

// =====================================
// RIPPLES
// =====================================

function createRipple(power) {
  ripples.push({
    radius: baseRadius * 0.8,
    speed: 3 + power * 5,
    life: 45,
    maxLife: 45,
    strength: power
  });

  if (ripples.length > 15) {
    ripples.shift();
  }
}

function updateRipples() {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];

    r.radius += r.speed;
    r.life--;

    if (r.life <= 0) {
      ripples.splice(i, 1);
    }
  }
}

// =====================================
// SPARKS
// =====================================

function updateSparks() {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];

    s.x += s.vx;
    s.y += s.vy;

    s.vx *= 0.94;
    s.vy *= 0.94;

    s.life--;

    if (s.life <= 0) {
      sparks.splice(i, 1);
    }
  }
}

// =====================================
// DISSOLVE
// =====================================

function spawnDissolve(power) {
  const count = min(48, floor(power * 38));

  for (let i = 0; i < count; i++) {
    const angle = random(TWO_PI);
    const radius = getFluidRadius(angle);
    const speed = random(0.2, 2.4);

    dissolveDots.push({
      x: centerX + cos(angle) * radius,
      y: centerY + sin(angle) * radius,
      vx: cos(angle) * speed,
      vy: sin(angle) * speed,
      life: random(40, 105),
      maxLife: 105,
      size: random(0.7, 2.4),
      seed: random(999)
    });
  }

  if (dissolveDots.length > 1100) {
    dissolveDots.splice(
      0,
      dissolveDots.length - 1100
    );
  }
}

function updateDissolve() {
  for (let i = dissolveDots.length - 1; i >= 0; i--) {
    const p = dissolveDots[i];

    p.vx =
      p.vx * 0.974 +
      (noise(p.seed, fluidTime * 0.3) - 0.5) * 0.035;

    p.vy =
      p.vy * 0.974 +
      (noise(p.seed + 100, fluidTime * 0.3) - 0.5) * 0.035;

    p.x += p.vx;
    p.y += p.vy;
    p.life--;

    if (p.life <= 0) {
      dissolveDots.splice(i, 1);
    }
  }
}

// =====================================
// DRAW FLUID
// =====================================

function drawFluid() {
  noStroke();

  drawingContext.shadowColor =
    "rgba(0,0,0,0.25)";

  drawingContext.shadowBlur =
    20 + beatPulse * 18;

  fill(8, 9, 12);

  beginShape();

  for (let i = 0; i < POINT_COUNT + 3; i++) {
    const index = i % POINT_COUNT;
    const angle = index / POINT_COUNT * TWO_PI;
    const radius = fluid[index].radius;

    curveVertex(
      centerX + cos(angle) * radius,
      centerY + sin(angle) * radius
    );
  }

  endShape(CLOSE);

  drawingContext.shadowBlur = 0;
}

// =====================================
// INTERNAL PARTICLES
// =====================================

function drawInternalParticles() {
  noStroke();

  for (let i = 0; i < 1100; i++) {
    const angle = i * 2.399963229728653;
    const normalizedRadius = sqrt((i + 0.5) / 1100);
    const wobble = noise(i * 0.03, fluidTime) - 0.5;

    const radius =
      getFluidRadius(angle) *
      (normalizedRadius * 0.9 + wobble * 0.03);

    const rotation =
      angle +
      fluidTime * 0.08 * (1 - normalizedRadius);

    const x = centerX + cos(rotation) * radius;
    const y = centerY + sin(rotation) * radius;

    fill(
      105,
      112,
      125,
      30 + beatPulse * 45
    );

    circle(
      x,
      y,
      i % 7 === 0 ? 2.2 : 1.1
    );
  }
}

// =====================================
// DRAW PARTICLES
// =====================================

function drawParticles() {
  noStroke();

  for (const p of particles) {
    const remaining =
      constrain(p.life / p.maxLife, 0, 1);

    const fade =
      remaining * remaining * (3 - 2 * remaining);

    fill(8, 9, 12, 255 * fade);

    circle(
      p.x,
      p.y,
      p.radius * 2 * (0.3 + fade * 0.7)
    );
  }
}

// =====================================
// DRAW BLOBS
// =====================================

function drawBlobs() {
  noStroke();

  for (const b of blobs) {
    const remaining =
      constrain(b.life / b.maxLife, 0, 1);

    const fade =
      remaining * remaining * (3 - 2 * remaining);

    fill(8, 9, 12, 255 * fade);

    ellipse(
      b.x,
      b.y,
      b.radius * 2 * fade,
      b.radius * 1.7 * fade
    );
  }
}

// =====================================
// DRAW RIPPLES
// =====================================

function drawRipples() {
  noFill();

  for (const r of ripples) {
    const fade = r.life / r.maxLife;

    stroke(
      35,
      40,
      50,
      fade * 60 * r.strength
    );

    strokeWeight(1 + fade * 2);

    ellipse(
      centerX,
      centerY,
      r.radius * 2
    );
  }

  noStroke();
}

// =====================================
// DRAW SPARKS
// =====================================

function drawSparks() {
  noStroke();

  for (const s of sparks) {
    const fade =
      constrain(s.life / s.maxLife, 0, 1);

    fill(100, 110, 125, fade * 150);

    circle(
      s.x,
      s.y,
      1.5 + fade * 2
    );
  }
}

// =====================================
// DRAW DISSOLVE
// =====================================

function drawDissolve() {
  noStroke();

  for (const p of dissolveDots) {
    const remaining =
      constrain(p.life / p.maxLife, 0, 1);

    const fade =
      remaining * remaining * (3 - 2 * remaining);

    fill(10, 11, 14, fade * 200);

    circle(
      p.x,
      p.y,
      p.size * 2 * fade
    );
  }
}

// =====================================
// MODE CONTROL
// =====================================

function setMode(n) {
  mode = ((n % 5) + 5) % 5;

  modeBlend = 0;
  lastModeChange = frameCount;

  const buttons = document.querySelectorAll(".mode-button");
  buttons.forEach((button, index) => {
    button.classList.toggle(
      "active",
      index === mode
    );
  });
}

function toggleAuto() {
  autoMode = !autoMode;
  lastModeChange = frameCount;

  const autoButton = document.getElementById("auto");
  if (autoButton) {
    autoButton.classList.toggle(
      "active",
      autoMode
    );
  }
}

function keyPressed() {
  if (key >= "1" && key <= "5") {
    autoMode = false;

    const autoButton = document.getElementById("auto");
    if (autoButton) {
      autoButton.classList.remove("active");
    }

    setMode(Number(key) - 1);
  }

  if (key === " ") {
    toggleAuto();
    return false;
  }
}

// =====================================
// AUDIO SETUP
// =====================================

async function setupAudio() {
  if (!audioContext) {
    const AudioCtor =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioCtor) {
      console.warn("Web Audio API is not supported in this browser.");
      return;
    }

    audioContext = new AudioCtor();

    analyser = audioContext.createAnalyser();

    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.35;

    frequencyData = new Uint8Array(
      analyser.frequencyBinCount
    );

    previousSpectrum = new Float32Array(
      analyser.frequencyBinCount
    );

    monitorGain = audioContext.createGain();
    monitorGain.gain.value = 0;

    analyser.connect(monitorGain);
    monitorGain.connect(audioContext.destination);
  }

  await audioContext.resume();
}

function disconnectAudio() {
  if (audioSource) {
    audioSource.disconnect();
    audioSource = null;
  }

  if (audioStream) {
    audioStream.getTracks().forEach(
      track => track.stop()
    );

    audioStream = null;
  }

  if (audioPlayer) {
    audioPlayer.pause();
    audioPlayer.src = "";
    audioPlayer = null;
  }

  if (audioURL) {
    URL.revokeObjectURL(audioURL);
    audioURL = null;
  }

  if (previousSpectrum) {
    previousSpectrum.fill(0);
  }

  if (monitorGain) {
    monitorGain.gain.value = 0;
  }
}

// =====================================
// BUTTON EVENTS
// =====================================

function bindUIEvents() {
  const modeButtons = document.querySelectorAll(".mode-button");
  const autoButton = document.getElementById("auto");
  const captureButton = document.getElementById("capture");
  const fileInput = document.getElementById("file");
  const stopButton = document.getElementById("stop");

  modeButtons.forEach(button => {
    button.addEventListener("click", () => {
      autoMode = false;

      if (autoButton) {
        autoButton.classList.remove("active");
      }

      setMode(Number(button.dataset.mode));
    });
  });

  if (autoButton) {
    autoButton.addEventListener("click", toggleAuto);
  }

  if (captureButton) {
    captureButton.addEventListener(
      "click",
      async () => {
        try {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            console.warn("Screen capture is not supported in this browser.");
            return;
          }

          await setupAudio();

          const stream =
            await navigator.mediaDevices.getDisplayMedia({
              video: true,
              audio: true
            });

          if (!stream.getAudioTracks().length) {
            stream.getTracks().forEach(track => track.stop());
            return;
          }

          disconnectAudio();

          audioStream = stream;

          audioSource = audioContext.createMediaStreamSource(stream);
          audioSource.connect(analyser);

          monitorGain.gain.value = 0;

          stream.getTracks().forEach(track => {
            track.addEventListener("ended", () => {
              if (audioStream === stream) {
                disconnectAudio();
              }
            });
          });
        } catch (error) {
          console.error(error);
        }
      }
    );
  }

  if (fileInput) {
    fileInput.addEventListener(
      "change",
      async event => {
        const file = event.target.files[0];
        if (!file) return;

        try {
          await setupAudio();
          disconnectAudio();

          audioURL = URL.createObjectURL(file);

          audioPlayer = new Audio(audioURL);
          audioPlayer.loop = true;

          audioSource = audioContext.createMediaElementSource(audioPlayer);
          audioSource.connect(analyser);

          monitorGain.gain.value = 1;

          await audioPlayer.play();
        } catch (error) {
          console.error(error);
        }
      }
    );
  }

  if (stopButton) {
    stopButton.addEventListener(
      "click",
      () => {
        disconnectAudio();
      }
    );
  }
}

if (typeof document !== "undefined") {
  bindUIEvents();
}

// =====================================
// RESIZE
// =====================================

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);

  const oldRadius = baseRadius;

  centerX = width / 2;
  centerY = height / 2;

  baseRadius = min(width, height) * 0.21;

  const ratio = baseRadius / oldRadius;

  for (const p of fluid) {
    p.radius *= ratio;
  }
}
