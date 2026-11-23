
"use strict";

// ==========================================
// MEMORY DETECTIVE - COMPLETE GAME LOGIC
// ==========================================

// 1. HTML ELEMENTS

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const screens = {
  menu: document.getElementById("menuScreen"),
  game: document.getElementById("gameScreen"),
  result: document.getElementById("resultScreen")
};

const $ = (id) => document.getElementById(id);

const startBtn = $("startBtn");
const soundBtn = $("soundBtn");
const hintBtn = $("hintBtn");
const menuBtn = $("menuBtn");
const playAgainBtn = $("playAgainBtn");
const resultMenuBtn = $("resultMenuBtn");

const difficultyButtons =
  document.querySelectorAll(".difficulty");

// 2. GAME SETTINGS

const SETTINGS = {
  easy: {
    objects: 5,
    memory: 20,
    detection: 30
  },
  medium: {
    objects: 8,
    memory: 15,
    detection: 25
  },
  hard: {
    objects: 12,
    memory: 10,
    detection: 20
  }
};

const TOTAL_CASES = 5;
const MAX_LIVES = 3;

// Different rooms for every investigation
const ROOMS = [
  {
    name: "Detective Office",
    floor: "#24394d",
    wall: "#304b67"
  },
  {
    name: "Royal Museum",
    floor: "#44364b",
    wall: "#634c69"
  },
  {
    name: "Secret Laboratory",
    floor: "#1d4749",
    wall: "#286467"
  },
  {
    name: "Old Library",
    floor: "#47362c",
    wall: "#67503d"
  },
  {
    name: "Mystery Warehouse",
    floor: "#41454b",
    wall: "#59616a"
  },
  {
    name: "Abandoned Mansion",
    floor: "#3d334d",
    wall: "#54466a"
  }
];

// Object pool
const OBJECTS = [
  { name: "Laptop", emoji: "💻" },
  { name: "Book", emoji: "📕" },
  { name: "Key", emoji: "🔑" },
  { name: "Clock", emoji: "⏰" },
  { name: "Phone", emoji: "📱" },
  { name: "Camera", emoji: "📷" },
  { name: "Diamond", emoji: "💎" },
  { name: "Flashlight", emoji: "🔦" },
  { name: "Teddy Bear", emoji: "🧸" },
  { name: "Gift", emoji: "🎁" },
  { name: "Painting", emoji: "🖼️" },
  { name: "Potion", emoji: "🧪" },
  { name: "Crown", emoji: "👑" },
  { name: "Map", emoji: "🗺️" },
  { name: "Magnifier", emoji: "🔍" },
  { name: "Radio", emoji: "📻" },
  { name: "Candle", emoji: "🕯️" },
  { name: "Trophy", emoji: "🏆" },
  { name: "Backpack", emoji: "🎒" },
  { name: "Skull", emoji: "💀" },
  { name: "Compass", emoji: "🧭" },
  { name: "Microphone", emoji: "🎤" },
  { name: "Glasses", emoji: "👓" },
  { name: "Gem", emoji: "💍" }
];

// Canvas layout: 4 columns x 3 rows
const COLS = 4;
const ROWS = 3;
const SLOT_COUNT = COLS * ROWS;

const GRID = {
  left: 75,
  top: 112,
  width: 750,
  height: 360
};

const CELL_W = GRID.width / COLS;
const CELL_H = GRID.height / ROWS;

// 3. GAME STATE

let difficulty = "easy";
let score = 0;
let lives = MAX_LIVES;
let caseNumber = 1;
let timeLeft = 0;
let phase = "menu";
let currentRoom = null;
let originalScene = [];
let changedScene = [];
let changedSlot = -1;
let changeType = "";
let hintUsed = false;
let soundEnabled = true;
let timerInterval = null;
let transitionTimeout = null;
let feedbackTimeout = null;
let audioContext = null;
let gameToken = 0;

const HISTORY_KEY = "memoryDetectiveHistoryV2";
const BEST_KEY = "memoryDetectiveBestV2";

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Game still works if storage is disabled.
  }
}

let mysteryHistory = readStorage(HISTORY_KEY, []);
if (!Array.isArray(mysteryHistory)) {
  mysteryHistory = [];
}

let bestScore = Number(readStorage(BEST_KEY, 0)) || 0;
$("bestScore").textContent = bestScore;

// 4. HELPER FUNCTIONS

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function shuffle(array) {
  const copy = [...array];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function showScreen(name) {
  Object.values(screens).forEach(screen => {
    screen.classList.remove("active");
  });

  screens[name].classList.add("active");
}

function updateHUD() {
  $("caseNumber").textContent =
    `${caseNumber} / ${TOTAL_CASES}`;

  $("score").textContent = score;
  $("timer").textContent = timeLeft;

  $("lives").textContent =
    "❤️".repeat(lives) +
    "🖤".repeat(MAX_LIVES - lives);

  $("timer").classList.toggle(
    "urgent",
    timeLeft <= 5 && phase !== "memory"
  );
}

function setStatus(message) {
  $("statusText").textContent = message;
}

function setFeedback(message) {
  $("feedback").textContent = message;
}

function clearGameTimers() {
  clearInterval(timerInterval);
  clearTimeout(transitionTimeout);
  clearTimeout(feedbackTimeout);

  timerInterval = null;
  transitionTimeout = null;
  feedbackTimeout = null;
}

// 5. SOUND EFFECTS

function playSound(type) {
  if (!soundEnabled) return;

  try {
    const AudioClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioClass) return;

    if (!audioContext) {
      audioContext = new AudioClass();
    }

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    const now = audioContext.currentTime;

    oscillator.type = "sine";

    const frequencies = {
      correct: 700,
      wrong: 180,
      click: 420,
      win: 900
    };

    oscillator.frequency.setValueAtTime(
      frequencies[type] || 400,
      now
    );

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      now + 0.2
    );

    oscillator.start(now);
    oscillator.stop(now + 0.2);
  } catch {
    // Audio is optional.
  }
}

soundBtn.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  soundBtn.textContent = soundEnabled
    ? "🔊 Sound On"
    : "🔇 Sound Off";
});

// 6. DIFFICULTY SELECTION

difficultyButtons.forEach(button => {
  button.addEventListener("click", () => {
    difficulty = button.dataset.level;

    difficultyButtons.forEach(btn => {
      btn.classList.remove("active");
    });

    button.classList.add("active");

    const config = SETTINGS[difficulty];

    $("difficultyInfo").textContent =
      `${config.objects} Objects • ` +
      `${config.memory}s Memory • ` +
      `${config.detection}s Investigation`;

    playSound("click");
  });
});

// 7. RANDOM MYSTERY GENERATOR

function createScene() {
  const config = SETTINGS[difficulty];

  // Randomly select objects and grid positions.
  const objectIndices = shuffle(
    OBJECTS.map((_, index) => index)
  ).slice(0, config.objects);

  const positions = shuffle(
    Array.from({ length: SLOT_COUNT }, (_, i) => i)
  );

  const scene = Array(SLOT_COUNT).fill(null);

  objectIndices.forEach((objectIndex, i) => {
    scene[positions[i]] = {
      ...OBJECTS[objectIndex],
      id: objectIndex
    };
  });

  return scene;
}

function sceneSignature(roomIndex, scene, type, target) {
  const objectIds = scene.map(item =>
    item ? item.id : -1
  );

  return JSON.stringify({
    difficulty,
    roomIndex,
    objects: objectIds,
    type,
    target
  });
}

function generateMystery() {
  let generated = null;

  // Try different combinations to avoid repetition.
  for (let attempt = 0; attempt < 200; attempt++) {
    const roomIndex = randomInt(ROOMS.length);
    const scene = createScene();

    const occupied = scene
      .map((item, index) => item ? index : -1)
      .filter(index => index !== -1);

    const empty = scene
      .map((item, index) => item ? -1 : index)
      .filter(index => index !== -1);

    const source = occupied[randomInt(occupied.length)];

    // Hard mode has all 12 slots occupied.
    const availableTypes = empty.length
      ? ["move", "replace", "disappear"]
      : ["replace", "disappear"];

    const type = availableTypes[
      randomInt(availableTypes.length)
    ];

    const changed = scene.map(item =>
      item ? { ...item } : null
    );

    let target = source;
    let newObjectId = -1;

    if (type === "move") {
      target = empty[randomInt(empty.length)];
      changed[target] = changed[source];
      changed[source] = null;
    }

    if (type === "replace") {
      const usedIds = scene
        .filter(Boolean)
        .map(item => item.id);

      const replacements = OBJECTS
        .map((item, index) => ({ ...item, id: index }))
        .filter(item => !usedIds.includes(item.id));

      const replacement =
        replacements[randomInt(replacements.length)];

      changed[source] = replacement;
      newObjectId = replacement.id;
    }

    if (type === "disappear") {
      changed[source] = null;
    }

    const signature = sceneSignature(
      roomIndex,
      scene,
      type,
      `${source}:${target}:${newObjectId}`
    );

    generated = {
      room: ROOMS[roomIndex],
      original: scene,
      changed,
      target: type === "move" ? target : source,
      type,
      signature
    };

    if (!mysteryHistory.includes(signature)) {
      break;
    }
  }

  // Keep recent history so storage stays small.
  if (generated) {
    mysteryHistory.push(generated.signature);
    mysteryHistory = mysteryHistory.slice(-5000);
    writeStorage(HISTORY_KEY, mysteryHistory);
  }

  return generated;
}

// 8. DRAW THE 2D CRIME SCENE

function roundedRect(x, y, w, h, radius, fill) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawBackground() {
  const room = currentRoom || ROOMS[0];

  // Wall
  ctx.fillStyle = room.wall;
  ctx.fillRect(0, 0, canvas.width, 115);

  // Floor
  ctx.fillStyle = room.floor;
  ctx.fillRect(0, 115, canvas.width, 405);

  // Wall trim
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(0, 108, canvas.width, 12);

  // Floor grid
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 1;

  for (let x = 0; x < canvas.width; x += 45) {
    ctx.beginPath();
    ctx.moveTo(x, 115);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let y = 115; y < canvas.height; y += 45) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Room name
  roundedRect(25, 24, 340, 58, 12, "#101c30");

  ctx.fillStyle = "#37d5ff";
  ctx.font = "bold 23px Arial";
  ctx.textAlign = "left";
  ctx.fillText(room.name, 45, 61);

  // Decorative security camera
  ctx.font = "32px Arial";
  ctx.fillText("📹", 825, 62);
}

function slotBounds(index) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);

  return {
    x: GRID.left + col * CELL_W,
    y: GRID.top + row * CELL_H,
    w: CELL_W,
    h: CELL_H
  };
}

function drawScene(scene) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();

  scene.forEach((item, index) => {
    const cell = slotBounds(index);

    const x = cell.x + 12;
    const y = cell.y + 9;
    const w = cell.w - 24;
    const h = cell.h - 18;

    // Object display tile
    roundedRect(
      x + 3,
      y + 5,
      w,
      h,
      14,
      "rgba(0,0,0,0.25)"
    );

    roundedRect(
      x,
      y,
      w,
      h,
      14,
      "rgba(12,24,43,0.75)"
    );

    ctx.strokeStyle = "rgba(111,179,216,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 14);
    ctx.stroke();

    if (item) {
      // Emoji object
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "49px 'Segoe UI Emoji', Arial";
      ctx.fillText(
        item.emoji,
        cell.x + cell.w / 2,
        cell.y + 47
      );

      // Object name
      ctx.font = "bold 13px Arial";
      ctx.fillStyle = "#dcecff";
      ctx.fillText(
        item.name,
        cell.x + cell.w / 2,
        cell.y + 92
      );
    }
  });

  // Show a hint only during investigation.
  if (phase === "detect" && hintUsed) {
    const cell = slotBounds(changedSlot);

    ctx.strokeStyle = "#ffcc66";
    ctx.lineWidth = 5;
    ctx.setLineDash([10, 7]);

    ctx.beginPath();
    ctx.roundRect(
      cell.x + 5,
      cell.y + 3,
      cell.w - 10,
      cell.h - 6,
      16
    );
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// 9. COUNTDOWN TIMER

function startCountdown(seconds, onComplete) {
  clearInterval(timerInterval);

  timeLeft = seconds;
  updateHUD();

  timerInterval = setInterval(() => {
    timeLeft--;
    updateHUD();

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      onComplete();
    }
  }, 1000);
}

// 10. START THE GAME

function startGame() {
  clearGameTimers();
  gameToken++;

  score = 0;
  lives = MAX_LIVES;
  caseNumber = 1;

  showScreen("game");
  startCase();
}

function startCase() {
  clearGameTimers();
  gameToken++;

  const mystery = generateMystery();

  currentRoom = mystery.room;
  originalScene = mystery.original;
  changedScene = mystery.changed;
  changedSlot = mystery.target;
  changeType = mystery.type;

  hintUsed = false;
  phase = "memory";

  $("transitionOverlay").classList.add("hidden");
  $("hintBtn").disabled = true;

  $("phaseLabel").textContent = "MEMORY PHASE";
  $("roomTitle").textContent = currentRoom.name;

  setStatus("Study the objects and remember their positions.");
  setFeedback("Memorize the scene carefully, Detective.");

  drawScene(originalScene);
  updateHUD();

  const token = gameToken;

  startCountdown(SETTINGS[difficulty].memory, () => {
    if (token === gameToken) {
      beginTransition();
    }
  });
}

// 11. TRANSITION BETWEEN SCENES

function beginTransition() {
  phase = "transition";

  $("phaseLabel").textContent = "SCENE CHANGING";
  $("transitionOverlay").classList.remove("hidden");
  $("hintBtn").disabled = true;

  setStatus("Something has changed in the room!");
  setFeedback("The crime scene is being altered...");

  playSound("click");

  const token = gameToken;

  transitionTimeout = setTimeout(() => {
    if (token === gameToken) {
      beginDetection();
    }
  }, 2000);
}

// 12. INVESTIGATION PHASE

function beginDetection() {
  phase = "detect";

  $("transitionOverlay").classList.add("hidden");
  $("phaseLabel").textContent = "INVESTIGATION PHASE";

  setStatus("Find the changed object before time runs out!");

  setFeedback(
    "Click the changed object. If one disappeared, " +
    "click its previous location."
  );

  $("hintBtn").disabled = false;

  drawScene(changedScene);

  const token = gameToken;

  startCountdown(SETTINGS[difficulty].detection, () => {
    if (token === gameToken) {
      handleWrongAnswer("Time is up!");
    }
  });
}

// 13. DETECT MOUSE / TOUCH CLICK

function getClickedSlot(event) {
  const rect = canvas.getBoundingClientRect();

  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const mouseX = (event.clientX - rect.left) * scaleX;
  const mouseY = (event.clientY - rect.top) * scaleY;

  const col = Math.floor(
    (mouseX - GRID.left) / CELL_W
  );

  const row = Math.floor(
    (mouseY - GRID.top) / CELL_H
  );

  if (
    col < 0 || col >= COLS ||
    row < 0 || row >= ROWS
  ) {
    return -1;
  }

  return row * COLS + col;
}

canvas.addEventListener("click", event => {
  if (phase !== "detect") return;

  const selectedSlot = getClickedSlot(event);

  if (selectedSlot === -1) return;

  if (selectedSlot === changedSlot) {
    handleCorrectAnswer();
  } else {
    handleWrongAnswer("That is not the changed object!");
  }
});

// 14. CORRECT ANSWER

function handleCorrectAnswer() {
  if (phase !== "detect") return;

  phase = "resolved";
  clearInterval(timerInterval);

  const bonus = Math.max(0, timeLeft) * 5;
  const earned = 100 + bonus;

  score += earned;

  playSound("correct");
  updateHUD();

  $("phaseLabel").textContent = "CASE SOLVED";
  $("hintBtn").disabled = true;

  setStatus("Excellent! You discovered the evidence.");
  setFeedback(`Correct! +${earned} points`);

  const token = gameToken;

  feedbackTimeout = setTimeout(() => {
    if (token !== gameToken) return;

    if (caseNumber >= TOTAL_CASES) {
      finishGame(true);
    } else {
      caseNumber++;
      startCase();
    }
  }, 1700);
}

// 15. WRONG ANSWER

function handleWrongAnswer(message) {
  if (phase !== "detect") return;

  phase = "resolved";
  clearInterval(timerInterval);

  lives--;
  playSound("wrong");
  updateHUD();

  $("phaseLabel").textContent = "CASE FAILED";
  $("hintBtn").disabled = true;

  const correctObject =
    changedScene[changedSlot] ||
    originalScene[changedSlot];

  const clueName = correctObject
    ? correctObject.name
    : "unknown object";

  setStatus(message);

  setFeedback(
    `Evidence missed: ${clueName}. ` +
    `Change type: ${changeType}.`
  );

  const token = gameToken;

  feedbackTimeout = setTimeout(() => {
    if (token !== gameToken) return;

    if (lives <= 0) {
      finishGame(false);
    } else if (caseNumber >= TOTAL_CASES) {
      finishGame(true);
    } else {
      caseNumber++;
      startCase();
    }
  }, 2200);
}

// 16. HINT SYSTEM

hintBtn.addEventListener("click", () => {
  if (phase !== "detect" || hintUsed) return;

  hintUsed = true;
  score = Math.max(0, score - 30);

  $("hintBtn").disabled = true;

  playSound("click");

  setFeedback(
    "Hint activated! Check the highlighted area. -30 points"
  );

  updateHUD();
  drawScene(changedScene);
});

// 17. GAME RESULTS

function finishGame(completed) {
  clearGameTimers();
  gameToken++;
  phase = "result";

  if (score > bestScore) {
    bestScore = score;
    writeStorage(BEST_KEY, bestScore);
  }

  $("bestScore").textContent = bestScore;
  $("finalScore").textContent = score;

  if (completed) {
    $("resultIcon").textContent = "🏆";
    $("resultTitle").textContent =
      "Investigation Complete!";

    $("resultMessage").textContent =
      "You completed all five mysteries. " +
      "Your detective skills are impressive!";

    playSound("win");
  } else {
    $("resultIcon").textContent = "🔍";
    $("resultTitle").textContent =
      "Investigation Failed";

    $("resultMessage").textContent =
      "You ran out of lives. " +
      "Try again and solve new mysteries!";
  }

  let rank = "Rookie Detective";

  if (score >= 900) {
    rank = "Legendary Detective";
  } else if (score >= 650) {
    rank = "Master Detective";
  } else if (score >= 350) {
    rank = "Senior Investigator";
  }

  $("detectiveRank").textContent = `Rank: ${rank}`;

  showScreen("result");
}

// 18. BUTTON EVENTS

startBtn.addEventListener("click", () => {
  playSound("click");
  startGame();
});

playAgainBtn.addEventListener("click", () => {
  playSound("click");
  startGame();
});

function returnToMenu() {
  clearGameTimers();
  gameToken++;
  phase = "menu";

  $("transitionOverlay").classList.add("hidden");
  $("bestScore").textContent = bestScore;

  showScreen("menu");
}

menuBtn.addEventListener("click", returnToMenu);
resultMenuBtn.addEventListener("click", returnToMenu);

// 19. INITIALIZE

showScreen("menu");
console.log("Memory Detective game loaded successfully!");
