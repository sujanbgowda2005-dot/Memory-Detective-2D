"use strict";

const $ = id => document.getElementById(id);
const canvas = $("gameCanvas");
const ctx = canvas.getContext("2d");
const screens = { menu: $("menuScreen"), game: $("gameScreen"), result: $("resultScreen") };

const SETTINGS = {
  easy:   { objects: 6, memory: 22, detection: 40, anomalies: 1 },
  medium: { objects: 8, memory: 18, detection: 34, anomalies: 2 },
  hard:   { objects: 10, memory: 14, detection: 28, anomalies: 3 }
};
const TOTAL_CASES = 5, MAX_LIVES = 3, COLS = 4, ROWS = 3;
const GRID = { left: 65, top: 105, width: 770, height: 360 };
const CELL_W = GRID.width / COLS, CELL_H = GRID.height / ROWS;

const ROOMS = [
  { name: "DETECTIVE OFFICE", wall: "#25374a", floor: "#17283a", accent: "#e2a95c", code: "CAM 01" },
  { name: "ROYAL MUSEUM", wall: "#49374a", floor: "#2d2638", accent: "#e0b86b", code: "CAM 04" },
  { name: "SECRET LABORATORY", wall: "#1c4549", floor: "#143238", accent: "#5ce0d0", code: "CAM 07" },
  { name: "OLD LIBRARY", wall: "#4b382d", floor: "#30251f", accent: "#d8a66e", code: "CAM 02" },
  { name: "ABANDONED MANSION", wall: "#3d3652", floor: "#252338", accent: "#b6a0ff", code: "CAM 09" }
];
const OBJECTS = [
  ["Laptop","💻"],["Book","📕"],["Key","🔑"],["Clock","⏰"],["Phone","📱"],["Camera","📷"],
  ["Diamond","💎"],["Flashlight","🔦"],["Teddy Bear","🧸"],["Gift","🎁"],["Painting","🖼️"],
  ["Potion","🧪"],["Crown","👑"],["Map","🗺️"],["Magnifier","🔍"],["Radio","📻"],
  ["Candle","🕯️"],["Trophy","🏆"],["Backpack","🎒"],["Skull","💀"],["Compass","🧭"],
  ["Microphone","🎤"],["Glasses","👓"],["Gem","💍"]
].map(([name,emoji],id)=>({name,emoji,id}));

let difficulty = "easy", score = 0, lives = MAX_LIVES, caseNumber = 1;
let timeLeft = 0, phase = "menu", currentRoom = ROOMS[0];
let originalScene = [], changedScene = [], targetSlots = [], foundSlots = [];
let hintUsed = false, soundEnabled = true, timerInterval = null, transitionTimeout = null, feedbackTimeout = null;
let audioContext = null, gameToken = 0, casesCleared = 0, totalEvidence = 0, selectedSlots = [];
let bestScore = Number(localStorage.getItem("mdBestScore") || 0);
$("bestScore").textContent = bestScore.toLocaleString();

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove("active"));
  screens[name].classList.add("active");
}
function setStatus(text) { $("statusText").textContent = text; }
function setFeedback(text) { $("feedback").textContent = text; }
function playSound(type="click") {
  if (!soundEnabled) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    if (!audioContext) audioContext = new Audio();
    if (audioContext.state === "suspended") audioContext.resume();
    const osc = audioContext.createOscillator(), gain = audioContext.createGain();
    const now = audioContext.currentTime;
    const tones = { click:440, correct:760, wrong:150, win:980, transition:260 };
    osc.type = type === "wrong" ? "triangle" : "sine";
    osc.frequency.setValueAtTime(tones[type] || 440, now);
    if (type === "win") osc.frequency.exponentialRampToValueAtTime(1400, now + .28);
    gain.gain.setValueAtTime(.08, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + .25);
    osc.connect(gain); gain.connect(audioContext.destination);
    osc.start(now); osc.stop(now + .26);
  } catch (_) {}
}
$("soundBtn").addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  $("soundBtn").innerHTML = soundEnabled ? "🔊 <span>Sound</span>" : "🔇 <span>Muted</span>";
  playSound("click");
});

document.querySelectorAll(".difficulty").forEach(btn => btn.addEventListener("click", () => {
  difficulty = btn.dataset.level;
  document.querySelectorAll(".difficulty").forEach(b => b.classList.toggle("active", b === btn));
  const c = SETTINGS[difficulty];
  $("difficultyInfo").textContent = `${c.objects} objects · ${c.memory}s to memorize · ${c.detection}s to investigate · ${c.anomalies} ${c.anomalies === 1 ? "anomaly" : "anomalies"} per case`;
  playSound();
}));

function randomInt(max) { return Math.floor(Math.random() * max); }
function shuffle(array) {
  const a = [...array];
  for (let i=a.length-1;i>0;i--) { const j=randomInt(i+1); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function makeScene() {
  const count = SETTINGS[difficulty].objects;
  const picks = shuffle(OBJECTS).slice(0,count);
  const slots = shuffle(Array.from({length: COLS*ROWS},(_,i)=>i));
  const scene = Array(COLS*ROWS).fill(null);
  picks.forEach((obj,i)=>scene[slots[i]]={...obj});
  return scene;
}
function makeMystery() {
  const original = makeScene(), changed = original.map(x=>x ? {...x} : null);
  const occupied = original.map((x,i)=>x ? i : -1).filter(i=>i>=0);
  const empty = original.map((x,i)=>!x ? i : -1).filter(i=>i>=0);
  const reserved = new Set(), targets = [], types = [];
  const count = SETTINGS[difficulty].anomalies;
  for (let n=0;n<count;n++) {
    const availableSources = occupied.filter(i=>!reserved.has(i));
    if (!availableSources.length) break;
    const source = availableSources[randomInt(availableSources.length)];
    const possible = empty.filter(i=>!reserved.has(i));
    let type;
    if (possible.length && Math.random() < .45) type = "move";
    else if (Math.random() < .5) type = "replace";
    else type = "disappear";

    if (type === "move") {
      const destination = possible[randomInt(possible.length)];
      changed[destination] = changed[source]; changed[source] = null;
      targets.push(destination); reserved.add(source); reserved.add(destination);
      empty.splice(empty.indexOf(destination),1);
      occupied.splice(occupied.indexOf(source),1);
    } else if (type === "replace") {
      const used = new Set(changed.filter(Boolean).map(x=>x.id));
      const replacement = OBJECTS.filter(x=>!used.has(x.id))[randomInt(OBJECTS.filter(x=>!used.has(x.id)).length)];
      changed[source] = {...replacement}; targets.push(source); reserved.add(source);
      occupied.splice(occupied.indexOf(source),1);
    } else {
      changed[source] = null; targets.push(source); reserved.add(source);
      occupied.splice(occupied.indexOf(source),1);
      empty.push(source);
    }
    types.push(type);
  }
  return { original, changed, targets, types };
}
function roundedRect(x,y,w,h,r,fill,stroke=null) {
  ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.fillStyle=fill; ctx.fill();
  if (stroke) { ctx.strokeStyle=stroke; ctx.lineWidth=1.5; ctx.stroke(); }
}
function drawBackground() {
  const g = ctx.createLinearGradient(0,0,0,520);
  g.addColorStop(0,currentRoom.wall); g.addColorStop(.23,currentRoom.wall); g.addColorStop(.24,currentRoom.floor); g.addColorStop(1,"#111a26");
  ctx.fillStyle=g; ctx.fillRect(0,0,900,520);
  ctx.fillStyle="rgba(0,0,0,.2)"; ctx.fillRect(0,112,900,9);
  // Wall panels and floor perspective
  for(let x=0;x<900;x+=150){ctx.fillStyle="rgba(255,255,255,.025)";ctx.fillRect(x+4,10,2,94);}
  ctx.strokeStyle="rgba(255,255,255,.055)";ctx.lineWidth=1;
  for(let x=0;x<=900;x+=55){ctx.beginPath();ctx.moveTo(x,122);ctx.lineTo(x-25,520);ctx.stroke();}
  for(let y=170;y<520;y+=52){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(900,y);ctx.stroke();}
  // Window / wall clock details
  roundedRect(36,24,140,66,5,"rgba(8,16,26,.45)","rgba(255,255,255,.12)");
  ctx.fillStyle="rgba(255,255,255,.10)";ctx.fillRect(103,25,3,64);ctx.fillRect(37,55,138,3);
  ctx.fillStyle=currentRoom.accent;ctx.font="700 17px 'DM Sans'";ctx.textAlign="left";ctx.fillText(currentRoom.name,198,54);
  ctx.fillStyle="rgba(255,255,255,.55)";ctx.font="11px 'DM Sans'";ctx.fillText("SECURE LOCATION  /  EVIDENCE SCAN",198,76);
  ctx.font="27px Arial";ctx.fillText("📹",820,63);
  ctx.fillStyle="rgba(255,255,255,.25)";ctx.font="10px 'DM Sans'";ctx.fillText("CAMERA ACTIVE",770,91);
}
function slotBounds(index) {
  return {x:GRID.left+(index%COLS)*CELL_W,y:GRID.top+Math.floor(index/COLS)*CELL_H,w:CELL_W,h:CELL_H};
}
function drawScene(scene) {
  ctx.clearRect(0,0,900,520); drawBackground();
  scene.forEach((item,index)=>{
    const c=slotBounds(index), x=c.x+10, y=c.y+9, w=c.w-20, h=c.h-18;
    roundedRect(x+3,y+5,w,h,13,"rgba(0,0,0,.28)");
    const selected = selectedSlots.includes(index);
    const found = foundSlots.includes(index);
    let fill = selected ? "rgba(54,210,157,.18)" : "rgba(10,22,35,.78)";
    let stroke = selected ? "rgba(54,210,157,.85)" : "rgba(160,190,215,.25)";
    if (phase==="detect" && found) { fill="rgba(54,210,157,.18)"; stroke="#35e5a1"; }
    roundedRect(x,y,w,h,13,fill,stroke);
    if (item) {
      ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="48px 'Segoe UI Emoji',Arial";
      ctx.fillText(item.emoji,c.x+c.w/2,c.y+55);
      ctx.fillStyle="#e5edf6";ctx.font="600 13px 'DM Sans'";ctx.fillText(item.name,c.x+c.w/2,c.y+101);
    } else {
      ctx.fillStyle="rgba(255,255,255,.14)";ctx.font="11px 'DM Sans'";ctx.fillText("EMPTY",c.x+c.w/2,c.y+60);
    }
    if (phase==="detect" && found) {
      ctx.fillStyle="#35e5a1";ctx.font="bold 18px Arial";ctx.fillText("✓",c.x+c.w-24,c.y+22);
    }
  });
  if(phase==="detect" && hintUsed) targetSlots.forEach(i=>{
    if(!foundSlots.includes(i)){const c=slotBounds(i);ctx.strokeStyle="#ffcc66";ctx.lineWidth=4;ctx.setLineDash([9,6]);ctx.strokeRect(c.x+7,c.y+7,c.w-14,c.h-14);ctx.setLineDash([]);}
  });
}
function updateHUD() {
  $("caseNumber").innerHTML = `${String(caseNumber).padStart(2,"0")} <small>/ 05</small>`;
  $("score").textContent=String(score).padStart(4,"0");
  $("timer").innerHTML=`${timeLeft}<span>s</span>`;
  $("lives").textContent="♥ ".repeat(lives)+"♡ ".repeat(MAX_LIVES-lives);
  $("timer").classList.toggle("urgent",timeLeft<=7 && phase==="detect");
  $("caseProgress").style.width=`${(casesCleared/TOTAL_CASES)*100}%`;
  $("foundCounter").textContent=`EVIDENCE FOUND ${foundSlots.length} / ${targetSlots.length}`;
  $("evidenceCount").textContent=`${foundSlots.length} / ${targetSlots.length}`;
  $("evidenceProgress").style.width=`${targetSlots.length ? foundSlots.length/targetSlots.length*100 : 0}%`;
}
function clearTimers(){clearInterval(timerInterval);clearTimeout(transitionTimeout);clearTimeout(feedbackTimeout);timerInterval=transitionTimeout=feedbackTimeout=null;}
function countdown(seconds,callback){
  clearInterval(timerInterval);timeLeft=seconds;updateHUD();
  timerInterval=setInterval(()=>{timeLeft--;updateHUD();if(timeLeft<=0){clearInterval(timerInterval);timerInterval=null;callback();}},1000);
}
function startGame(){
  clearTimers();gameToken++;score=0;lives=MAX_LIVES;caseNumber=1;casesCleared=0;totalEvidence=0;
  showScreen("game");startCase();
}
function startCase(){
  clearTimers();gameToken++;
  const mystery=makeMystery();
  currentRoom=ROOMS[(caseNumber-1)%ROOMS.length];
  originalScene=mystery.original;changedScene=mystery.changed;targetSlots=mystery.targets;foundSlots=[];selectedSlots=[];
  hintUsed=false;phase="memory";
  $("transitionOverlay").classList.add("hidden");$("hintBtn").disabled=true;
  $("roomTitle").textContent=currentRoom.name;$("sceneId").textContent=`${currentRoom.code} · SECURE`;
  $("phaseLabel").textContent="MEMORY PHASE";$("missionText").textContent="Memorize the objects and their exact positions.";
  $("objectiveText").textContent="Memorize the room";$("objectiveDetail").textContent=`There are ${SETTINGS[difficulty].objects} objects in this scene. Pay attention to empty spaces and object positions.`;
  $("timerCaption").textContent="MEMORIZE THE SCENE";$("fieldTip").textContent="Look at the empty spaces too. A missing object is still evidence.";
  $("evidenceList").innerHTML='<div class="empty-evidence">◌<span>No evidence collected yet</span></div>';
  setStatus("Study the scene. Every object matters.");setFeedback("Stay sharp, Detective. The clock is running.");
  drawScene(originalScene);updateHUD();
  const token=gameToken;
  countdown(SETTINGS[difficulty].memory,()=>{if(token===gameToken) beginTransition();});
}
function beginTransition(){
  phase="transition";$("phaseLabel").textContent="SCENE COMPROMISED";$("missionText").textContent="The room has been tampered with. Prepare to investigate.";
  $("transitionOverlay").classList.remove("hidden");$("hintBtn").disabled=true;
  setStatus("An unknown person has entered the location.");setFeedback("Evidence feed interrupted...");
  playSound("transition");const token=gameToken;
  transitionTimeout=setTimeout(()=>{if(token===gameToken)beginDetection();},2400);
}
function beginDetection(){
  phase="detect";$("transitionOverlay").classList.add("hidden");$("phaseLabel").textContent="INVESTIGATION PHASE";
  $("missionText").textContent=`Find ${targetSlots.length} suspicious ${targetSlots.length===1?"location":"locations"} before time runs out.`;
  $("objectiveText").textContent="Identify every anomaly";$("objectiveDetail").textContent="Select the tile where an object moved, vanished, or was replaced. Each correct selection is recorded as evidence.";
  $("timerCaption").textContent="INVESTIGATION ACTIVE";$("hintBtn").disabled=false;
  $("sceneId").textContent=`${currentRoom.code} · TAMPER ALERT`;
  setStatus("The scene has changed. Find every anomaly.");setFeedback("Click each changed location. Wrong selections cost one life.");
  drawScene(changedScene);const token=gameToken;
  countdown(SETTINGS[difficulty].detection,()=>{if(token===gameToken) failCase("Time expired. The evidence has gone cold.");});
}
function clickedSlot(event){
  const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)*(canvas.width/rect.width),y=(event.clientY-rect.top)*(canvas.height/rect.height);
  const col=Math.floor((x-GRID.left)/CELL_W),row=Math.floor((y-GRID.top)/CELL_H);
  if(col<0||col>=COLS||row<0||row>=ROWS)return -1;
  return row*COLS+col;
}
canvas.addEventListener("click",event=>{
  if(phase!=="detect")return;
  const slot=clickedSlot(event);if(slot<0)return;
  if(foundSlots.includes(slot))return;
  if(targetSlots.includes(slot)){
    foundSlots.push(slot);selectedSlots.push(slot);totalEvidence++;
    const earned=100+Math.max(0,timeLeft)*3;score+=earned;
    playSound("correct");addEvidence(slot,earned);updateHUD();drawScene(changedScene);
    setFeedback(`Evidence confirmed. +${earned} points. ${targetSlots.length-foundSlots.length} remaining.`);
    if(foundSlots.length===targetSlots.length) completeCase();
  }else{
    lives--;playSound("wrong");updateHUD();
    setFeedback("False lead! That location is unchanged. You lost one life.");
    canvas.classList.remove("shake");void canvas.offsetWidth;canvas.classList.add("shake");
    if(lives<=0) finishGame(false);
  }
});
function addEvidence(slot,points){
  const item=changedScene[slot]||originalScene[slot];
  const label=item?item.name:"Empty location";
  const row=document.createElement("div");row.className="evidence-item";
  row.innerHTML=`<span class="evidence-check">✓</span><span><b>${label}</b><small>ANOMALY CONFIRMED</small></span><strong>+${points}</strong>`;
  const list=$("evidenceList");if(list.querySelector(".empty-evidence"))list.innerHTML="";
  list.appendChild(row);
}
function completeCase(){
  phase="resolved";clearInterval(timerInterval);timerInterval=null;casesCleared++;
  const bonus=150+timeLeft*5;score+=bonus;playSound("win");updateHUD();
  $("phaseLabel").textContent="CASE SOLVED";$("missionText").textContent="All anomalies identified. Evidence secured.";
  $("hintBtn").disabled=true;setStatus("Excellent work. The case is solved.");
  setFeedback(`CASE CLEARED · TIME BONUS +${bonus} POINTS`);
  const token=gameToken;feedbackTimeout=setTimeout(()=>{if(token!==gameToken)return;if(caseNumber>=TOTAL_CASES)finishGame(true);else{caseNumber++;startCase();}},1900);
}
function failCase(message){
  phase="resolved";clearInterval(timerInterval);timerInterval=null;lives--;updateHUD();playSound("wrong");
  setStatus(message);setFeedback("Case failed. The next file is being prepared.");
  $("phaseLabel").textContent="CASE FAILED";$("hintBtn").disabled=true;
  const token=gameToken;feedbackTimeout=setTimeout(()=>{if(token!==gameToken)return;if(lives<=0)finishGame(false);else if(caseNumber>=TOTAL_CASES)finishGame(true);else{caseNumber++;startCase();}},1900);
}
$("hintBtn").addEventListener("click",()=>{
  if(phase!=="detect"||hintUsed)return;
  hintUsed=true;score=Math.max(0,score-30);$("hintBtn").disabled=true;
  $("fieldTip").textContent="Hint activated: highlighted tiles contain the changed evidence.";
  setFeedback("Scanner pulse activated. Check the highlighted locations. −30 points");
  playSound();updateHUD();drawScene(changedScene);
});
function rankFor(points){
  if(points>=2200)return "LEGENDARY DETECTIVE";
  if(points>=1500)return "MASTER INVESTIGATOR";
  if(points>=800)return "SENIOR DETECTIVE";
  return "ROOKIE DETECTIVE";
}
function finishGame(completed){
  clearTimers();gameToken++;phase="result";
  if(score>bestScore){bestScore=score;localStorage.setItem("mdBestScore",String(bestScore));}
  const rank=rankFor(score);
  $("headerRank").textContent=rank;$("finalScore").textContent=score.toLocaleString();
  $("resultBest").textContent=bestScore.toLocaleString();$("bestScore").textContent=bestScore.toLocaleString();
  $("casesCleared").textContent=`${casesCleared} / ${TOTAL_CASES}`;$("totalEvidence").textContent=totalEvidence;
  $("detectiveRank").textContent=rank;
  $("resultIcon").textContent=completed?"★":"⌕";
  $("resultTitle").textContent=completed?"CASE CLOSED.":"INVESTIGATION OVER.";
  $("resultMessage").textContent=completed?"All five case files have been processed. Your attention to detail saved the investigation.":"Your investigation ended before all evidence was recovered. Review the scene and try again.";
  playSound(completed?"win":"wrong");showScreen("result");
}
function returnToMenu(){
  clearTimers();gameToken++;phase="menu";$("transitionOverlay").classList.add("hidden");
  $("bestScore").textContent=bestScore.toLocaleString();showScreen("menu");
}
$("startBtn").addEventListener("click",()=>{playSound();startGame();});
$("playAgainBtn").addEventListener("click",()=>{playSound();startGame();});
$("menuBtn").addEventListener("click",returnToMenu);
$("resultMenuBtn").addEventListener("click",returnToMenu);
showScreen("menu");
console.log("Memory Detective 2.0 loaded.");
