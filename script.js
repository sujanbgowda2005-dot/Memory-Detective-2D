
"use strict";

/* ==========================================
   MEMORY DETECTIVE 2D
   COMPLETE GAME + DIFFICULTY DASHBOARD
   ========================================== */

const $ = id => document.getElementById(id);

const canvas = $("gameCanvas");
const ctx = canvas.getContext("2d");

const screens = {
  menu: $("menuScreen"),
  game: $("gameScreen"),
  result: $("resultScreen")
};

/* GAME SETTINGS */

const SETTINGS = {
  easy: {
    objects: 5,
    memory: 25,
    detection: 35
  },
  medium: {
    objects: 8,
    memory: 20,
    detection: 30
  },
  hard: {
    objects: 12,
    memory: 15,
    detection: 25
  }
};

const TOTAL_CASES = 5;
const MAX_LIVES = 3;

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

/* CANVAS SETTINGS */

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

/* GAME STATE */

let difficulty = "easy";
let score = 0;
let lives = MAX_LIVES;
let caseNumber = 1;
let timeLeft = 0;

let phase = "menu";
let currentRoom = ROOMS[0];

let originalScene = [];
let changedScene = [];

let changedSlot = -1;
let changeType = "";
let sourceSlot = -1;

let hintUsed = false;
let soundEnabled = true;

let timerInterval = null;
let transitionTimeout = null;
let feedbackTimeout = null;

let audioContext = null;
let gameToken = 0;
let previousCountdownNumber = null;

/* ==========================================
   NEW: DIFFICULTY SCORE STORAGE
   ========================================== */

const SCORE_STORAGE_KEY =
  "memoryDetectiveDifficultyScoresV1";

const HISTORY_KEY =
  "memoryDetectiveHistoryV2";

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);

    return raw === null
      ? fallback
      : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify(value)
    );
  } catch {
    console.warn("Browser storage unavailable.");
  }
}

function emptyRecord() {
  return {
    best: 0,
    games: 0,
    last: 0
  };
}

const savedRecords = readStorage(
  SCORE_STORAGE_KEY,
  {}
);

const difficultyScores = {};

for (const level of Object.keys(SETTINGS)) {
  const old = savedRecords &&
    typeof savedRecords === "object"
    ? savedRecords[level]
    : null;

  difficultyScores[level] = {
    best: Math.max(0, Number(old?.best) || 0),
    games: Math.max(0, Number(old?.games) || 0),
    last: Math.max(0, Number(old?.last) || 0)
  };
}

/*
  Previous versions stored only one overall
  best score, without its difficulty.

  We intentionally do not assign that score
  to Easy, Medium, or Hard because its
  difficulty cannot be verified.
*/

function saveDifficultyScore(level, finalScore) {
  const record = difficultyScores[level];

  const previousBest = record.best;

  record.games += 1;
  record.last = finalScore;
  record.best = Math.max(
    record.best,
    finalScore
  );

  writeStorage(
    SCORE_STORAGE_KEY,
    difficultyScores
  );

  updateDashboard();

  return finalScore > previousBest;
}

function updateDashboard() {
  $("easyBest").textContent =
    difficultyScores.easy.best;

  $("mediumBest").textContent =
    difficultyScores.medium.best;

  $("hardBest").textContent =
    difficultyScores.hard.best;

  const record = difficultyScores[difficulty];

  const labels = {
    easy: "🟢 EASY MODE RECORDS",
    medium: "🟡 MEDIUM MODE RECORDS",
    hard: "🔴 HARD MODE RECORDS"
  };

  $("dashboardTitle").textContent =
    labels[difficulty];

  $("dashboardBest").textContent =
    record.best;

  $("dashboardGames").textContent =
    record.games;

  $("dashboardLast").textContent =
    record.last;

  $("dashboardMessage").textContent =
    record.games === 0
      ? `No ${difficulty} games completed yet.`
      : `Your highest ${difficulty} score is ${record.best}.`;

  document.querySelectorAll(
    ".score-card"
  ).forEach(card => {
    card.classList.toggle(
      "selected",
      card.dataset.scoreLevel === difficulty
    );
  });
}

/* ==========================================
   DIFFICULTY SELECTION
   ========================================== */

function selectDifficulty(level) {
  if (!SETTINGS[level]) return;

  difficulty = level;

  document.querySelectorAll(
    ".difficulty"
  ).forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.level === level
    );
  });

  const config = SETTINGS[level];

  $("difficultyInfo").textContent =
    `${config.objects} Objects • ` +
    `${config.memory}s Memory • ` +
    `${config.detection}s Investigation`;

  updateDashboard();
}

document.querySelectorAll(
  ".difficulty"
).forEach(button => {
  button.addEventListener("click", () => {
    selectDifficulty(button.dataset.level);
    playSound("click");
  });
});

document.querySelectorAll(
  ".score-card"
).forEach(card => {
  card.addEventListener("click", () => {
    selectDifficulty(card.dataset.scoreLevel);
    playSound("click");
  });
});

/* ==========================================
   HELPERS
   ========================================== */

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function shuffle(array) {
  const copy = [...array];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);

    [copy[i], copy[j]] = [
      copy[j],
      copy[i]
    ];
  }

  return copy;
}

function showScreen(name) {
  Object.values(screens).forEach(screen => {
    screen.classList.remove("active");
  });

  screens[name].classList.add("active");
}

function setStatus(message) {
  $("statusText").textContent = message;
}

function setFeedback(message) {
  $("feedback").textContent = message;
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
    timeLeft > 0 && timeLeft <= 5
  );
}

/* ==========================================
   SOUND EFFECTS
   ========================================== */

function playSound(type) {
  if (!soundEnabled) return;

  try {
    const AudioClass =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioClass) return;

    if (!audioContext) {
      audioContext = new AudioClass();
    }

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    const oscillator =
      audioContext.createOscillator();

    const gain =
      audioContext.createGain();

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    const frequencies = {
      correct: 700,
      wrong: 180,
      click: 420,
      win: 900,
      countdown: 850
    };

    const now = audioContext.currentTime;

    oscillator.type =
      type === "countdown"
        ? "square"
        : "sine";

    oscillator.frequency.setValueAtTime(
      frequencies[type] || 400,
      now
    );

    gain.gain.setValueAtTime(
      type === "countdown" ? 0.07 : 0.12,
      now
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      now + 0.18
    );

    oscillator.start(now);
    oscillator.stop(now + 0.18);

  } catch {
    // Audio is optional.
  }
}

$("soundBtn").addEventListener(
  "click",
  () => {
    soundEnabled = !soundEnabled;

    $("soundBtn").textContent =
      soundEnabled
        ? "🔊 Sound On"
        : "🔇 Sound Off";
  }
);

/* ==========================================
   COUNTDOWN
   ========================================== */

function updateLastFiveCountdown(seconds) {
  const overlay = $("lastFiveCountdown");
  const digit = $("countdownDigit");

  if (seconds >= 1 && seconds <= 5) {
    overlay.classList.remove("hidden");

    if (previousCountdownNumber !== seconds) {
      digit.textContent = seconds;

      digit.classList.remove(
        "countdown-pop"
      );

      void digit.offsetWidth;

      digit.classList.add(
        "countdown-pop"
      );

      playSound("countdown");

      previousCountdownNumber = seconds;
    }
  } else {
    overlay.classList.add("hidden");
    digit.classList.remove("countdown-pop");
    previousCountdownNumber = null;
  }
}

function hideCountdown() {
  updateLastFiveCountdown(0);
}

/* ==========================================
   GAME TIMERS
   ========================================== */

function clearGameTimers() {
  clearInterval(timerInterval);
  clearTimeout(transitionTimeout);
  clearTimeout(feedbackTimeout);

  timerInterval = null;
  transitionTimeout = null;
  feedbackTimeout = null;

  hideCountdown();

  $("answerFeedback").classList.add(
    "hidden"
  );

  $("actualAnswerOverlay").classList.add(
    "hidden"
  );
}

function startCountdown(seconds, onComplete) {
  clearInterval(timerInterval);

  timeLeft = seconds;
  updateHUD();

  updateLastFiveCountdown(timeLeft);

  const token = gameToken;

  timerInterval = setInterval(() => {
    if (token !== gameToken) {
      clearInterval(timerInterval);
      return;
    }

    timeLeft = Math.max(0, timeLeft - 1);

    updateHUD();
    updateLastFiveCountdown(timeLeft);

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;

      hideCountdown();
      onComplete();
    }
  }, 1000);
}

/* ==========================================
   RANDOM MYSTERY GENERATOR
   ========================================== */

function createScene() {
  const count = SETTINGS[difficulty].objects;

  const selectedObjects = shuffle(
    OBJECTS.map((_, index) => index)
  ).slice(0, count);

  const positions = shuffle(
    Array.from(
      { length: SLOT_COUNT },
      (_, index) => index
    )
  );

  const scene = Array(
    SLOT_COUNT
  ).fill(null);

  selectedObjects.forEach((id, index) => {
    scene[positions[index]] = {
      ...OBJECTS[id],
      id
    };
  });

  return scene;
}

let mysteryHistory = readStorage(
  HISTORY_KEY,
  []
);

if (!Array.isArray(mysteryHistory)) {
  mysteryHistory = [];
}

function generateMystery() {
  let mystery;

  for (let attempt = 0; attempt < 200; attempt++) {
    const roomIndex = randomInt(ROOMS.length);
    const scene = createScene();

    const occupied = [];
    const empty = [];

    scene.forEach((item, index) => {
      if (item) {
        occupied.push(index);
      } else {
        empty.push(index);
      }
    });

    const source =
      occupied[randomInt(occupied.length)];

    const types = empty.length
      ? ["move", "replace", "disappear"]
      : ["replace", "disappear"];

    const type = types[
      randomInt(types.length)
    ];

    const changed = scene.map(item =>
      item ? { ...item } : null
    );

    let target = source;
    let replacementId = -1;

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
        .map((item, id) => ({
          ...item,
          id
        }))
        .filter(item =>
          !usedIds.includes(item.id)
        );

      const replacement = replacements[
        randomInt(replacements.length)
      ];

      changed[source] = replacement;
      replacementId = replacement.id;
    }

    if (type === "disappear") {
      changed[source] = null;
    }

    const signature = JSON.stringify({
      difficulty,
      roomIndex,
      objects: scene.map(item =>
        item ? item.id : -1
      ),
      type,
      source,
      target,
      replacementId
    });

    mystery = {
      room: ROOMS[roomIndex],
      original: scene,
      changed,
      source,
      target,
      type,
      signature
    };

    if (!mysteryHistory.includes(signature)) {
      break;
    }
  }

  mysteryHistory.push(mystery.signature);

  mysteryHistory = mysteryHistory.slice(-5000);

  writeStorage(
    HISTORY_KEY,
    mysteryHistory
  );

  return mystery;
}

/* ==========================================
   CANVAS DRAWING
   ========================================== */

function roundedRect(x, y, w, h, radius, fill) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
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

function drawBackground() {
  ctx.fillStyle = currentRoom.wall;

  ctx.fillRect(
    0, 0,
    canvas.width,
    115
  );

  ctx.fillStyle = currentRoom.floor;

  ctx.fillRect(
    0, 115,
    canvas.width,
    canvas.height - 115
  );

  ctx.fillStyle = "rgba(0,0,0,0.25)";

  ctx.fillRect(
    0, 108,
    canvas.width,
    12
  );

  ctx.strokeStyle =
    "rgba(255,255,255,0.045)";

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

  roundedRect(
    25, 24, 340, 58,
    12, "#101c30"
  );

  ctx.fillStyle = "#37d5ff";
  ctx.font = "bold 23px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillText(
    currentRoom.name,
    45, 61
  );

  ctx.font = "32px Arial";
  ctx.fillText("📹", 825, 62);
}

function drawScene(scene) {
  ctx.clearRect(
    0, 0,
    canvas.width,
    canvas.height
  );

  drawBackground();

  scene.forEach((item, index) => {
    const cell = slotBounds(index);

    const x = cell.x + 12;
    const y = cell.y + 9;
    const w = cell.w - 24;
    const h = cell.h - 18;

    roundedRect(
      x + 3, y + 5,
      w, h, 14,
      "rgba(0,0,0,0.25)"
    );

    roundedRect(
      x, y, w, h, 14,
      "rgba(12,24,43,0.75)"
    );

    ctx.strokeStyle =
      "rgba(111,179,216,0.35)";

    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 14);
    ctx.stroke();

    if (item) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.font =
        "49px 'Segoe UI Emoji', Arial";

      ctx.fillText(
        item.emoji,
        cell.x + cell.w / 2,
        cell.y + 47
      );

      ctx.font = "bold 13px Arial";
      ctx.fillStyle = "#dcecff";

      ctx.fillText(
        item.name,
        cell.x + cell.w / 2,
        cell.y + 92
      );
    }
  });

  if (phase === "detect" && hintUsed) {
    highlightSlot(
      changedSlot,
      "#ffcc66",
      true
    );
  }
}

function highlightSlot(
  index,
  color,
  dashed = false
) {
  if (index < 0 || index >= SLOT_COUNT) {
    return;
  }

  const cell = slotBounds(index);

  ctx.save();

  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 15;

  if (dashed) {
    ctx.setLineDash([10, 7]);
  }

  ctx.beginPath();

  ctx.roundRect(
    cell.x + 5,
    cell.y + 3,
    cell.w - 10,
    cell.h - 6,
    16
  );

  ctx.stroke();
  ctx.restore();
}

/* ==========================================
   GAME FLOW
   ========================================== */

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

  sourceSlot = mystery.source;
  changedSlot = mystery.target;
  changeType = mystery.type;

  hintUsed = false;
  phase = "memory";

  $("transitionOverlay").classList.add(
    "hidden"
  );

  $("hintBtn").disabled = true;

  $("phaseLabel").textContent =
    "MEMORY PHASE";

  $("roomTitle").textContent =
    currentRoom.name;

  setStatus(
    "Study the objects and remember their positions."
  );

  setFeedback(
    "Memorize the scene carefully, Detective."
  );

  drawScene(originalScene);
  updateHUD();

  startCountdown(
    SETTINGS[difficulty].memory,
    beginTransition
  );
}

function beginTransition() {
  phase = "transition";

  hideCountdown();

  $("phaseLabel").textContent =
    "SCENE CHANGING";

  $("transitionOverlay").classList.remove(
    "hidden"
  );

  $("hintBtn").disabled = true;

  setStatus(
    "Something has changed in the room!"
  );

  setFeedback(
    "The crime scene is being altered..."
  );

  playSound("click");

  const token = gameToken;

  transitionTimeout = setTimeout(() => {
    if (token === gameToken) {
      beginDetection();
    }
  }, 2000);
}

function beginDetection() {
  phase = "detect";

  $("transitionOverlay").classList.add(
    "hidden"
  );

  $("phaseLabel").textContent =
    "INVESTIGATION PHASE";

  setStatus(
    "Find the changed object before time runs out!"
  );

  setFeedback(
    "Click the changed object. If one disappeared, " +
    "click its previous location."
  );

  $("hintBtn").disabled = false;

  drawScene(changedScene);

  startCountdown(
    SETTINGS[difficulty].detection,
    () => handleWrongAnswer("Time is up!")
  );
}

/* ==========================================
   CANVAS CLICK
   ========================================== */

function getClickedSlot(event) {
  const rect = canvas.getBoundingClientRect();

  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const x =
    (event.clientX - rect.left) * scaleX;

  const y =
    (event.clientY - rect.top) * scaleY;

  const col = Math.floor(
    (x - GRID.left) / CELL_W
  );

  const row = Math.floor(
    (y - GRID.top) / CELL_H
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
    handleWrongAnswer(
      "That is not the changed object!"
    );
  }
});

/* ==========================================
   RIGHT / WRONG FEEDBACK
   ========================================== */

function showAnswerFeedback(isCorrect, callback) {
  const box = $("answerFeedback");
  const text = $("answerFeedbackText");

  box.classList.remove(
    "hidden",
    "correct",
    "wrong"
  );

  box.classList.add(
    isCorrect ? "correct" : "wrong"
  );

  text.textContent = isCorrect
    ? "Right Answer!"
    : "Wrong Answer!";

  text.classList.remove("feedback-pop");
  void text.offsetWidth;
  text.classList.add("feedback-pop");

  const token = gameToken;

  clearTimeout(feedbackTimeout);

  feedbackTimeout = setTimeout(() => {
    if (token !== gameToken) return;

    box.classList.add("hidden");
    callback();
  }, 2000);
}

/* ==========================================
   ACTUAL CORRECT ANSWER
   ========================================== */

function positionName(slot) {
  const row = Math.floor(slot / COLS) + 1;
  const col = (slot % COLS) + 1;

  return `Row ${row}, Column ${col}`;
}

function getActualAnswer() {
  if (changeType === "move") {
    const item = changedScene[changedSlot];

    return {
      name: `${item.emoji} ${item.name}`,
      description:
        `${item.name} moved from ` +
        `${positionName(sourceSlot)} to ` +
        `${positionName(changedSlot)}.`
    };
  }

  if (changeType === "replace") {
    const oldItem = originalScene[changedSlot];
    const newItem = changedScene[changedSlot];

    return {
      name: `${newItem.emoji} ${newItem.name}`,
      description:
        `${oldItem.emoji} ${oldItem.name} was replaced ` +
        `by ${newItem.emoji} ${newItem.name} at ` +
        `${positionName(changedSlot)}.`
    };
  }

  const item = originalScene[changedSlot];

  return {
    name: `${item.emoji} ${item.name}`,
    description:
      `${item.name} disappeared from ` +
      `${positionName(changedSlot)}.`
  };
}

function showActualAnswer(callback) {
  const answer = getActualAnswer();

  $("actualAnswerObject").textContent =
    answer.name;

  $("actualAnswerDescription").textContent =
    answer.description;

  $("actualAnswerOverlay").classList.remove(
    "hidden"
  );

  $("phaseLabel").textContent =
    "ANSWER REVEALED";

  setStatus(
    `Actual answer: ${answer.name}`
  );

  setFeedback(answer.description);

  drawScene(changedScene);

  highlightSlot(
    changedSlot,
    "#35e5a1"
  );

  if (changeType === "move") {
    highlightSlot(
      sourceSlot,
      "#37d5ff",
      true
    );
  }

  const token = gameToken;

  clearTimeout(feedbackTimeout);

  feedbackTimeout = setTimeout(() => {
    if (token !== gameToken) return;

    $("actualAnswerOverlay").classList.add(
      "hidden"
    );

    callback();
  }, 3000);
}

/* ==========================================
   CORRECT ANSWER
   ========================================== */

function handleCorrectAnswer() {
  if (phase !== "detect") return;

  phase = "resolved";

  clearInterval(timerInterval);
  timerInterval = null;

  hideCountdown();

  const bonus =
    Math.max(0, timeLeft) * 5;

  const earned = 100 + bonus;

  score += earned;

  playSound("correct");
  updateHUD();

  $("phaseLabel").textContent =
    "CASE SOLVED";

  $("hintBtn").disabled = true;

  setStatus(
    "Excellent! You discovered the evidence."
  );

  setFeedback(
    `Correct! +${earned} points`
  );

  showAnswerFeedback(true, () => {
    showActualAnswer(() => {
      advanceToNextCase();
    });
  });
}

/* ==========================================
   WRONG ANSWER
   ========================================== */

function handleWrongAnswer(message) {
  if (phase !== "detect") return;

  phase = "resolved";

  clearInterval(timerInterval);
  timerInterval = null;

  hideCountdown();

  lives = Math.max(0, lives - 1);

  playSound("wrong");
  updateHUD();

  $("phaseLabel").textContent =
    "CASE FAILED";

  $("hintBtn").disabled = true;

  setStatus(message);

  setFeedback(
    "Wrong answer! One life lost."
  );

  showAnswerFeedback(false, () => {
    showActualAnswer(() => {
      advanceToNextCase();
    });
  });
}

/* ==========================================
   HINT SYSTEM
   ========================================== */

$("hintBtn").addEventListener(
  "click",
  () => {
    if (phase !== "detect" || hintUsed) {
      return;
    }

    hintUsed = true;

    score = Math.max(0, score - 30);

    $("hintBtn").disabled = true;

    playSound("click");

    setFeedback(
      "Hint activated! Highlighted area. -30 points"
    );

    updateHUD();
    drawScene(changedScene);
  }
);

/* ==========================================
   NEXT CASE
   ========================================== */

function advanceToNextCase() {
  if (lives <= 0) {
    finishGame(false);
    return;
  }

  if (caseNumber >= TOTAL_CASES) {
    finishGame(true);
    return;
  }

  caseNumber++;
  startCase();
}

/* ==========================================
   GAME RESULT + SAVE HIGH SCORE
   ========================================== */

function finishGame(completed) {
  clearGameTimers();

  gameToken++;
  phase = "result";

  // NEW: Save score under current difficulty.
  const isNewRecord = saveDifficultyScore(
    difficulty,
    score
  );

  const record = difficultyScores[difficulty];

  $("finalScore").textContent = score;

  $("resultBest").textContent =
    record.best;

  $("resultDifficulty").textContent =
    `${difficulty.toUpperCase()} MODE`;

  $("newRecordMessage").textContent =
    isNewRecord
      ? "🏆 NEW HIGH SCORE!"
      : "Keep playing to beat your record!";

  if (completed) {
    $("resultIcon").textContent = "🏆";

    $("resultTitle").textContent =
      "Investigation Complete!";

    $("resultMessage").textContent =
      "You completed all five mysteries. " +
      "Excellent detective work!";

    playSound("win");
  } else {
    $("resultIcon").textContent = "🔍";

    $("resultTitle").textContent =
      "Investigation Failed";

    $("resultMessage").textContent =
      "You ran out of lives. Try again!";
  }

  let rank = "Rookie Detective";

  if (score >= 900) {
    rank = "Legendary Detective";
  } else if (score >= 650) {
    rank = "Master Detective";
  } else if (score >= 350) {
    rank = "Senior Investigator";
  }

  $("detectiveRank").textContent =
    `Rank: ${rank}`;

  showScreen("result");
}

/* ==========================================
   BUTTON EVENTS
   ========================================== */

$("startBtn").addEventListener(
  "click",
  () => {
    playSound("click");
    startGame();
  }
);

$("playAgainBtn").addEventListener(
  "click",
  () => {
    playSound("click");
    startGame();
  }
);

function returnToMenu() {
  clearGameTimers();

  gameToken++;
  phase = "menu";

  $("transitionOverlay").classList.add(
    "hidden"
  );

  updateDashboard();
  showScreen("menu");
}

$("menuBtn").addEventListener(
  "click",
  returnToMenu
);

$("resultMenuBtn").addEventListener(
  "click",
  returnToMenu
);

/* ==========================================
   INITIALIZE
   ========================================== */

selectDifficulty("easy");
showScreen("menu");

console.log(
  "Memory Detective 2D loaded successfully!"
);

console.log(
  "Difficulty dashboard enabled."
);
