/* ═══════════════════════════════════════════════════════
   CarbonWalk · NU HealthyZerocarbon
   script.js — Tab routing, step tracking, carbon math,
               tree calc, history, badges, map timer
   ═══════════════════════════════════════════════════════ */
 
'use strict';
 
/* ──────────────────────────────────────────────
   CONSTANTS & FORMULAS
────────────────────────────────────────────── */
const STEP_LENGTH_M      = 0.762;          // avg stride in metres
const CAL_PER_STEP       = 0.04;           // kcal per step
const CO2_PER_KM_CAR_G   = 150;           // grams CO₂ per km car
const CO2_PER_STEP_G     = (STEP_LENGTH_M / 1000) * CO2_PER_KM_CAR_G; // ~0.1143 g
const CO2_PER_TREE_G     = 21800;         // 21.8 kg CO₂ absorbed per year (tree)
const RING_CIRCUMFERENCE = 502;           // 2π × 80
 
const DAILY_GOAL_DEFAULT = 10000;
const DEMO_LOGIN_EMAIL = 'alex@nu.ac.th';
const DEMO_LOGIN_PASSWORD = '111';
 
/* ──────────────────────────────────────────────
   STATE
────────────────────────────────────────────── */
const state = {
  loggedIn: false,
  userName: 'Alex',
  steps: 0,
  dailyGoal: DAILY_GOAL_DEFAULT,
  tracking: false,
  trackInterval: null,
 
  // Map timer
  mapRunning: false,
  mapSeconds: 0,
  mapInterval: null,
 
  // Lifetime (mock seeded data)
  lifetimeSteps:  128450,
  lifetimeCO2g:   19300,   // g
  lifetimeTrees:  Math.floor(19300 / CO2_PER_TREE_G),
 
  streak: 7,
  ecoPoints: 450,
};
 
/* ──────────────────────────────────────────────
   DOM HELPERS
────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const qs = sel => document.querySelector(sel);
 
function setText(id, val) {
  const el = $(id);
  if (el) el.textContent = val;
}
 
function showToast(msg, duration = 2800) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  // force reflow
  void toast.offsetWidth;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 400);
  }, duration);
}
 
/* ──────────────────────────────────────────────
   SVG GRADIENT (injected once)
────────────────────────────────────────────── */
function injectSVGDefs() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  svg.innerHTML = `
    <defs>
      <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stop-color="#34d399"/>
        <stop offset="100%" stop-color="#059669"/>
      </linearGradient>
    </defs>`;
  document.body.prepend(svg);
}
 
/* ──────────────────────────────────────────────
   LOGIN
────────────────────────────────────────────── */
function initLogin() {
  $('btn-login').addEventListener('click', () => {
    const email = $('login-email').value.trim();
    const pass  = $('login-password').value.trim();
 
    const btn = $('btn-login');
    if (!email || !pass) {
      showToast('⚠️ Please enter your email and password');
      return;
    }
 
    if (email !== DEMO_LOGIN_EMAIL || pass !== DEMO_LOGIN_PASSWORD) {
      showToast('⚠️ Incorrect login. Use alex@nu.ac.th / 111');
      return;
    }
 
    // Animate button
    btn.textContent = '🌿 Logging in…';
    btn.disabled = true;
 
    setTimeout(() => {
      state.loggedIn = true;
      // Extract name from email
      const namePart = email.split('@')[0];
      state.userName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
 
      const loginPage = $('page-login');
      const appShell = $('app-shell');
      if (loginPage) {
        loginPage.classList.remove('active');
        loginPage.classList.add('hidden');
      }
      if (appShell) {
        appShell.classList.remove('hidden');
      }
      $('user-name-home').textContent = state.userName;
      $('profile-name-display').textContent = state.userName + ' Walker';
 
      showToast(`🌱 Welcome back, ${state.userName}! Let's walk!`);
      initApp();
      switchTab('home');
      btn.disabled = false;
      btn.textContent = 'Let\'s Walk! 🚀';
    }, 900);
  });
 
  // Enter key support
  [$('login-email'), $('login-password')].forEach(el => {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') $('btn-login').click();
    });
  });
}
 
/* ──────────────────────────────────────────────
   TAB NAVIGATION
────────────────────────────────────────────── */
function initTabs() {
  // Bottom nav (mobile)
  document.querySelectorAll('.bnav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab, 'bnav'));
  });
 
  // Top nav (desktop)
  document.querySelectorAll('.top-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab, 'topnav'));
  });
}
 
function switchTab(tabId, source) {
  // If target is already active, scroll content to top instead of re-rendering
  const target = $('tab-' + tabId);
  const current = document.querySelector('.tab-content.active');
  if (current && target && current.id === target.id) {
    const content = document.querySelector('.content-area');
    if (content) content.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  // Hide all tabs and show target
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  if (target) target.classList.add('active');

  // Update bnav
  document.querySelectorAll('.bnav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });

  // Update top nav
  document.querySelectorAll('.top-nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });

  // Ensure content area is at top when switching
  const content = document.querySelector('.content-area');
  if (content) content.scrollTo({ top: 0, behavior: 'smooth' });
}
 
/* ──────────────────────────────────────────────
   STEP TRACKER (home)
────────────────────────────────────────────── */
function initStepTracker() {
  $('btn-start-stop').addEventListener('click', toggleTracking);
  $('btn-reset').addEventListener('click', resetTracking);
}
 
function toggleTracking() {
  if (state.tracking) {
    stopTracking();
  } else {
    startTracking();
  }
}
 
function startTracking() {
  state.tracking = true;
  const btn = $('btn-start-stop');
  btn.textContent = '⏸ Pause Walk';
  btn.classList.add('tracking');
 
  // Simulate steps: ~80–120 steps per 5-second tick
  state.trackInterval = setInterval(() => {
    const newSteps = Math.floor(Math.random() * 8) + 4; // ~4-12 per tick
    state.steps += newSteps;
    if (state.steps > state.dailyGoal) state.steps = state.dailyGoal;
    updateDashboard();
 
    // Milestone toasts
    const milestones = [1000, 2000, 3000, 5000, 7500, 10000];
    milestones.forEach(m => {
      if (state.steps >= m && state.steps - newSteps < m) {
        showToast(`🎉 ${m.toLocaleString()} steps reached! You're amazing!`);
      }
    });
  }, 400); // faster for demo feel
}
 
function stopTracking() {
  state.tracking = false;
  clearInterval(state.trackInterval);
  const btn = $('btn-start-stop');
  btn.textContent = '▶ Start Walk';
  btn.classList.remove('tracking');
}
 
function resetTracking() {
  stopTracking();
  state.steps = 0;
  updateDashboard();
  showToast('🔄 Steps reset. Ready for a fresh walk!');
}
 
/* ──────────────────────────────────────────────
   DASHBOARD CALCULATIONS & UI UPDATE
────────────────────────────────────────────── */
function updateDashboard() {
  const s = state.steps;
  const goal = state.dailyGoal;
 
  // Ring progress
  const pct = Math.min(s / goal, 1);
  const offset = RING_CIRCUMFERENCE * (1 - pct);
  const ring = $('ring-progress');
  if (ring) ring.style.strokeDashoffset = offset;
 
  // Numbers
  setText('ring-steps', s.toLocaleString());
 
  const km    = (s * STEP_LENGTH_M / 1000).toFixed(2);
  const cal   = Math.round(s * CAL_PER_STEP);
  const mins  = Math.round((s * STEP_LENGTH_M / 1000) / 5 * 60); // assume 5 km/h
 
  setText('stat-km', km);
  setText('stat-cal', cal);
  setText('stat-min', mins);
 
  // Carbon saved
  const co2g   = (s * CO2_PER_STEP_G).toFixed(0);
  const co2km  = (s * CO2_PER_STEP_G / CO2_PER_KM_CAR_G).toFixed(2);
  setText('carbon-grams', Number(co2g).toLocaleString());
  setText('carbon-km-equiv', co2km);
 
  // Carbon bar (daily cap = goal steps worth of CO₂)
  const carbonPct = Math.min((co2g / (goal * CO2_PER_STEP_G)) * 100, 100);
  const carbonBar = $('carbon-bar');
  if (carbonBar) carbonBar.style.width = carbonPct + '%';
 
  // Tree conversion
  updateTreeWidget(Number(co2g));
 
  // Map sync
  setText('map-km', km + ' km');
  setText('map-co2', co2g + 'g');
 
  // Challenges update
  updateChallenges();
}
 
function updateTreeWidget(co2g) {
  const totalCO2 = co2g;
  const fullTrees = Math.floor(totalCO2 / CO2_PER_TREE_G);
  const remainder = totalCO2 % CO2_PER_TREE_G;
  const treePct   = Math.round((remainder / CO2_PER_TREE_G) * 100);
 
  setText('tree-count', fullTrees);
  setText('tree-ring-pct', treePct + '%');
  setText('tree-co2-left', ((CO2_PER_TREE_G - remainder) / 1000).toFixed(1) + ' kg');
 
  // Progress ring
  const treeRingOffset = 201 * (1 - treePct / 100);
  const fill = $('tree-ring-fill');
  if (fill) fill.style.strokeDashoffset = treeRingOffset;
 
  // Tree emoji growth stage
  const treeEmoji = $('tree-emoji');
  if (treeEmoji) {
    if (treePct < 20)       treeEmoji.textContent = '🌱';
    else if (treePct < 50)  treeEmoji.textContent = '🌿';
    else if (treePct < 80)  treeEmoji.textContent = '🪴';
    else                    treeEmoji.textContent = '🌳';
  }
}
 
/* ──────────────────────────────────────────────
   CHALLENGE STRIP (Home)
────────────────────────────────────────────── */
const miniChallenges = [
  { icon: '👣', name: '1K Steps',    target: 1000,  unit: 'steps' },
  { icon: '🌿', name: '5K Steps',    target: 5000,  unit: 'steps' },
  { icon: '🏅', name: 'Goal Crush',  target: 10000, unit: 'steps' },
  { icon: '🌍', name: '100g CO₂',    target: 100,   unit: 'co2'   },
  { icon: '🌳', name: 'First Tree',  target: CO2_PER_TREE_G, unit: 'co2' },
  { icon: '🔥', name: '7-Day Streak',target: 7,     unit: 'streak'},
];
 
function buildChallengeStrip() {
  const strip = $('challenge-strip');
  if (!strip) return;
  strip.innerHTML = miniChallenges.map((c, i) => `
    <div class="challenge-mini ${getChallengeStatus(c) ? 'done' : ''}" id="mini-ch-${i}">
      <span class="challenge-mini-icon">${c.icon}</span>
      <div class="challenge-mini-name">${c.name}</div>
      <div class="challenge-mini-prog" id="mini-prog-txt-${i}">${getMiniProgress(c)}</div>
      <div class="mini-prog-bar-bg">
        <div class="mini-prog-bar-fill" id="mini-bar-${i}" style="width:${getMiniPct(c)}%"></div>
      </div>
    </div>
  `).join('');
}
 
function updateChallenges() {
  miniChallenges.forEach((c, i) => {
    const el = $(`mini-ch-${i}`);
    const bar = $(`mini-bar-${i}`);
    const txt = $(`mini-prog-txt-${i}`);
    if (!el) return;
    const done = getChallengeStatus(c);
    el.classList.toggle('done', done);
    if (bar) bar.style.width = getMiniPct(c) + '%';
    if (txt) txt.textContent = getMiniProgress(c);
  });
}
 
function getCurrentVal(c) {
  if (c.unit === 'steps')  return state.steps;
  if (c.unit === 'co2')    return state.steps * CO2_PER_STEP_G;
  if (c.unit === 'streak') return state.streak;
  return 0;
}
 
function getChallengeStatus(c) { return getCurrentVal(c) >= c.target; }
 
function getMiniPct(c) {
  return Math.min(Math.round((getCurrentVal(c) / c.target) * 100), 100);
}
 
function getMiniProgress(c) {
  if (getChallengeStatus(c)) return '✅ Done!';
  const cur = Math.round(getCurrentVal(c));
  const tar = c.unit === 'co2' ? (c.target / 1000).toFixed(1) + 'kg' : c.target.toLocaleString();
  const curFmt = c.unit === 'co2' ? (cur / 1000).toFixed(2) + 'kg' : cur.toLocaleString();
  return `${curFmt} / ${tar}`;
}
 
/* ──────────────────────────────────────────────
   BADGES (Achievements page)
────────────────────────────────────────────── */
const badgesData = [
  { icon: '👣', name: 'First Step',    req: 'Walk 1 step',          unlocked: true  },
  { icon: '🌱', name: 'Seedling',      req: '1,000 steps',          unlocked: true  },
  { icon: '🌿', name: 'Eco Walker',    req: '5,000 steps in a day', unlocked: true  },
  { icon: '🏅', name: 'Goal Getter',   req: 'Hit daily goal',       unlocked: false },
  { icon: '🔥', name: 'On Fire',       req: '7-day streak',         unlocked: false },
  { icon: '🌳', name: 'Tree Saver',    req: 'Save first tree',      unlocked: false },
  { icon: '🌍', name: 'Eco Warrior',   req: '1 kg CO₂ saved',       unlocked: false },
  { icon: '🚶', name: 'Marathoner',    req: '42 km total',          unlocked: false },
  { icon: '🏆', name: 'Champion',      req: '30-day streak',        unlocked: false },
  { icon: '💚', name: 'Green Hero',    req: '10 trees saved',       unlocked: false },
  { icon: '⚡', name: 'Speed Walker',  req: '<12 min/km pace',      unlocked: false },
  { icon: '🌙', name: 'Night Walker',  req: 'Walk after 9 PM',      unlocked: false },
];
 
function buildBadgesGrid() {
  const grid = $('badges-grid');
  if (!grid) return;
  grid.innerHTML = badgesData.map(b => `
    <div class="badge-card ${b.unlocked ? 'unlocked' : 'locked'}">
      ${b.unlocked ? '<span class="badge-unlocked-mark">✅</span>' : ''}
      <span class="badge-icon">${b.icon}</span>
      <span class="badge-name">${b.name}</span>
      <span class="badge-req">${b.req}</span>
    </div>
  `).join('');
}
 
/* ──────────────────────────────────────────────
   CHALLENGES LIST (Achievements page)
────────────────────────────────────────────── */
const challengesData = [
  { icon: '🚶', name: 'Daily 10K',    desc: 'Walk 10,000 steps today',        prog: state.steps, total: 10000, pts: 100 },
  { icon: '🌍', name: 'Carbon Buster', desc: 'Save 500g of CO₂ today',        prog: Math.round(state.steps * CO2_PER_STEP_G), total: 500, pts: 80 },
  { icon: '📏', name: 'Five KM Club', desc: 'Walk 5 km without stopping',      prog: 0, total: 5000, pts: 120 },
  { icon: '🔥', name: 'Streak Week',  desc: 'Walk 7 days in a row',            prog: state.streak, total: 7, pts: 200 },
  { icon: '🌱', name: 'Green Seed',   desc: 'Grow your first virtual tree',     prog: Math.round(state.steps * CO2_PER_STEP_G), total: CO2_PER_TREE_G, pts: 150 },
];
 
function buildChallengesList() {
  const list = $('challenges-list');
  if (!list) return;
  list.innerHTML = challengesData.map(c => {
    const pct = Math.min(Math.round((c.prog / c.total) * 100), 100);
    const done = pct >= 100;
    return `
      <div class="challenge-card ${done ? 'completed' : ''}">
        <span class="challenge-icon">${c.icon}</span>
        <div class="challenge-info">
          <span class="challenge-name">${c.name} ${done ? '✅' : ''}</span>
          <span class="challenge-desc">${c.desc}</span>
          <div class="challenge-prog-bar-bg">
            <div class="challenge-prog-bar-fill" style="width:${pct}%"></div>
          </div>
        </div>
        <span class="challenge-pts">+${c.pts}✨</span>
      </div>
    `;
  }).join('');
}
 
/* ──────────────────────────────────────────────
   HISTORY PAGE
────────────────────────────────────────────── */
const weekData = [
  { day: 'Mon', steps: 8420  },
  { day: 'Tue', steps: 11230 },
  { day: 'Wed', steps: 6800  },
  { day: 'Thu', steps: 9950  },
  { day: 'Fri', steps: 12100 },
  { day: 'Sat', steps: 7300  },
  { day: 'Sun', steps: state.steps, isToday: true },
];
 
const logData = [
  { day: 16, month: 'May', steps: state.steps,  km: (state.steps * STEP_LENGTH_M / 1000).toFixed(1), co2: Math.round(state.steps * CO2_PER_STEP_G), emoji: '🌟' },
  { day: 15, month: 'May', steps: 12100, km: 9.2,  co2: 1380, emoji: '🔥' },
  { day: 14, month: 'May', steps: 7300,  km: 5.6,  co2: 833,  emoji: '🌿' },
  { day: 13, month: 'May', steps: 9950,  km: 7.6,  co2: 1136, emoji: '💪' },
  { day: 12, month: 'May', steps: 6800,  km: 5.2,  co2: 777,  emoji: '😊' },
  { day: 11, month: 'May', steps: 11230, km: 8.6,  co2: 1282, emoji: '🌳' },
  { day: 10, month: 'May', steps: 8420,  km: 6.4,  co2: 961,  emoji: '🏅' },
];
 
function buildWeekChart() {
  const barsEl = $('week-bars');
  const daysEl = $('week-days');
  if (!barsEl || !daysEl) return;
 
  const maxSteps = Math.max(...weekData.map(d => d.steps), 1);
 
  barsEl.innerHTML = weekData.map(d => {
    const h = Math.round((d.steps / maxSteps) * 88);
    const val = d.steps >= 1000 ? (d.steps / 1000).toFixed(1) + 'k' : d.steps;
    return `
      <div class="week-bar-col ${d.isToday ? 'today' : ''}">
        <div class="week-bar-val">${val}</div>
        <div class="week-bar-fill" style="height:${h}px"></div>
      </div>
    `;
  }).join('');
 
  daysEl.innerHTML = weekData.map(d =>
    `<div class="week-day-label ${d.isToday ? 'today' : ''}">${d.day}</div>`
  ).join('');
}
 
function buildLogList() {
  const list = $('log-list');
  if (!list) return;
  list.innerHTML = logData.map(d => `
    <div class="log-item">
      <div class="log-date-badge">
        <span class="log-date-day">${d.day}</span>
        <span class="log-date-month">${d.month}</span>
      </div>
      <div class="log-info">
        <span class="log-steps">👣 ${d.steps.toLocaleString()} steps · ${d.km} km</span>
        <span class="log-meta">🌍 ${d.co2}g CO₂ saved · 🔥 ${Math.round(d.steps * CAL_PER_STEP)} kcal</span>
      </div>
      <span class="log-emoji">${d.emoji}</span>
    </div>
  `).join('');
}
 
function buildCumulStats() {
  const totalSteps = logData.reduce((a, d) => a + d.steps, 0) + state.lifetimeSteps;
  const totalKm    = (totalSteps * STEP_LENGTH_M / 1000).toFixed(0);
  const totalCO2g  = Math.round(totalSteps * CO2_PER_STEP_G);
  const totalTrees = Math.floor(totalCO2g / CO2_PER_TREE_G);
 
  setText('total-steps-all', totalSteps.toLocaleString());
  setText('total-km-all',    totalKm + ' km');
  setText('total-co2-all',   (totalCO2g / 1000).toFixed(1) + ' kg');
  setText('total-trees-all', totalTrees);
}
 
/* ──────────────────────────────────────────────
   MAP TIMER
────────────────────────────────────────────── */
function initMapControls() {
  $('btn-map-start').addEventListener('click', startMapTracking);
  $('btn-map-pause').addEventListener('click', pauseMapTracking);
  $('btn-map-stop').addEventListener('click', stopMapTracking);
}
 
function startMapTracking() {
  if (state.mapRunning) return;
  state.mapRunning = true;
  // Sync with step tracker
  if (!state.tracking) startTracking();
 
  state.mapInterval = setInterval(() => {
    state.mapSeconds++;
    updateMapTimer();
  }, 1000);
 
  showToast('🛰️ GPS tracking started!');
}
 
function pauseMapTracking() {
  if (!state.mapRunning) return;
  state.mapRunning = false;
  clearInterval(state.mapInterval);
  stopTracking();
  showToast('⏸ Walk paused');
}
 
function stopMapTracking() {
  state.mapRunning = false;
  clearInterval(state.mapInterval);
  stopTracking();
  state.mapSeconds = 0;
  updateMapTimer();
  showToast('💾 Route saved! Great walk! 🌿');
}
 
function updateMapTimer() {
  const s = state.mapSeconds;
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  setText('map-time', `${mm}:${ss}`);
 
  // Pace calculation
  const km = parseFloat((state.steps * STEP_LENGTH_M / 1000).toFixed(2));
  if (km > 0 && s > 0) {
    const paceSecPerKm = Math.round(s / km);
    const pm = Math.floor(paceSecPerKm / 60);
    const ps = paceSecPerKm % 60;
    setText('map-pace', `${pm}:${String(ps).padStart(2,'0')}`);
  }
}
 
/* ──────────────────────────────────────────────
   PROFILE — GOAL SETTING
────────────────────────────────────────────── */
function initProfile() {
  const STEPS = [5000, 6000, 7000, 8000, 10000, 12000, 15000, 20000];
  let goalIdx = STEPS.indexOf(state.dailyGoal);
  if (goalIdx < 0) goalIdx = 4;
 
  function updateGoalDisplay() {
    state.dailyGoal = STEPS[goalIdx];
    setText('pref-goal-val', STEPS[goalIdx].toLocaleString());
    setText('goal-display', STEPS[goalIdx].toLocaleString());
    updateDashboard();
  }
 
  $('goal-minus').addEventListener('click', () => {
    if (goalIdx > 0) { goalIdx--; updateGoalDisplay(); showToast(`🎯 Goal set to ${STEPS[goalIdx].toLocaleString()} steps`); }
  });
  $('goal-plus').addEventListener('click', () => {
    if (goalIdx < STEPS.length - 1) { goalIdx++; updateGoalDisplay(); showToast(`🎯 Goal set to ${STEPS[goalIdx].toLocaleString()} steps`); }
  });
 
  // Dark mode toggle
  $('toggle-dark').addEventListener('change', e => {
    document.body.classList.toggle('dark', e.target.checked);
    showToast(e.target.checked ? '🌙 Dark mode on' : '☀️ Light mode on');
  });
 
  // Logout
  $('btn-logout').addEventListener('click', () => {
    showToast('👋 Logged out. See you soon!');
    setTimeout(() => {
      $('app-shell').classList.add('hidden');
      $('page-login').classList.add('active');
      $('login-email').value = '';
      $('login-password').value = '';
      $('btn-login').textContent = "Let's Walk! 🚀";
      $('btn-login').disabled = false;
      state.steps = 0;
      stopTracking();
      updateDashboard();
      // returning to login
    }, 1200);
  });
}
 
/* ──────────────────────────────────────────────
   MAIN APP INIT
────────────────────────────────────────────── */
function initApp() {
  updateDashboard();
  buildChallengeStrip();
  buildBadgesGrid();
  buildChallengesList();
  buildWeekChart();
  buildLogList();
  buildCumulStats();
  initMapControls();
  initProfile();
}
 
/* ──────────────────────────────────────────────
   BOOT
────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  injectSVGDefs();
  initLogin();
  initTabs();
  // No falling leaves
 
  // Demo: auto-fill login for quick testing
  setTimeout(() => {
    if ($('login-email') && !$('login-email').value) {
      $('login-email').value = DEMO_LOGIN_EMAIL;
      $('login-password').value = DEMO_LOGIN_PASSWORD;
    }
  }, 600);
});