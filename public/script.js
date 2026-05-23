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
const EMISSION_FACTOR_GRID_KG_PER_KWH = 0.5; // kg CO₂e per kWh (approx. Thai grid average)
const EMISSION_FACTOR_VEHICLE_G_PER_KM = 150; // grams CO₂e per km for motorized baseline travel
const CO2_PER_KM_CAR_G   = EMISSION_FACTOR_VEHICLE_G_PER_KM;
const CO2_PER_STEP_G     = (STEP_LENGTH_M / 1000) * CO2_PER_KM_CAR_G; // ~0.1143 g
const CO2_PER_TREE_G     = 21800;         // 21.8 kg CO₂ absorbed per year (tree)
const TONNE_IN_KG        = 1000;
const RING_CIRCUMFERENCE = 502;           // 2π × 80

function toTonne(kg) {
  return kg / TONNE_IN_KG;
}

function formatTonneCO2(kg, digits = 3) {
  return toTonne(kg).toFixed(digits) + ' tCO₂e';
}

function formatCO2ForDisplay(kg) {
  if (kg >= 1) return `${kg.toFixed(2)} kg CO₂e`;
  const t = kg / 1000;
  if (t >= 0.001) return `${t.toFixed(3)} tCO₂e`;
  if (kg >= 0.1) return `${kg.toFixed(2)} kg CO₂e`;
  if (kg > 0) return `${Math.round(kg * 1000)} g CO₂e`;
  return '0 g CO₂e';
}

const DAILY_GOAL_DEFAULT = 5000;

/* ──────────────────────────────────────────────
   STATE
────────────────────────────────────────────── */
const state = {
  loggedIn: false,
  userName: 'Alex',
  joinedAt: null,
  steps: 0,
  dailyGoal: DAILY_GOAL_DEFAULT,
  tracking: false,
  trackInterval: null,
  geoWatchId: null,
  lastPosition: null,
  currentMapPos: null,
  leafletMap: null,
  leafletMarker: null,
  leafletPolyline: null,
  leafletRoutePoints: [],
  mapDistanceM: 0,
  totalWalkSeconds: 0,
  routePoints: [],
  mapStartLocation: null,
  routePlannerMap: null,
  routePlannerPlaces: [],
  routePlannerMarkers: [],
  routePlannerStartCoords: null,
  routePlannerStartLabel: '',
  routePlannerEndCoords: null,
  routePlannerEndLabel: '',
  routePlannerSelection: 'start',
  routePlannerStartMarker: null,
  routePlannerEndMarker: null,
  routePlannerRouteLine: null,
  routePlannerDirectionsService: null,
  routePlannerDirectionsRenderer: null,
  routePlannerRouteDistanceKm: null,

  // Map timer
  mapRunning: false,
  mapSeconds: 0,
  mapInterval: null,

  // Lifetime (mock seeded data)
  lifetimeSteps:  0,
  lifetimeCO2g:   0,
  lifetimeTrees:  0,

  streak: 0,
  ecoPoints: 0,
  profileLevel: 1,
  profileRank: 'Eco Seedling',
  profileImpactKm: 0,
  profileImpactCO2kg: 0,
  mapChoice: null,
  mapChoiceConfirmed: false,
  dailyDate: null,
  todaySteps: 0,
  todayKm: 0,
  todayCalories: 0,
  todayMinutes: 0,
  todayCO2g: 0,
  todayTrees: 0,
  sessionStartSteps: 0,
  lastWalkDate: null,
  activeChallenges: [],
  challengeWeekStart: null,
};

let greetingUpdateTimer = null;

/* ──────────────────────────────────────────────
   DOM HELPERS
────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const qs = sel => document.querySelector(sel);

function setText(id, val) {
  const el = $(id);
  if (el) el.textContent = val;
}

function formatMonthYear(value) {
  if (!value) return '';
  let date = value;
  if (typeof date === 'object' && date.toDate) {
    date = date.toDate();
  }
  if (typeof date === 'string' || typeof date === 'number') {
    date = new Date(date);
  }
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatFullDate(value) {
  if (!value) return '';
  let date = value;
  if (typeof date === 'object' && date.toDate) {
    date = date.toDate();
  }
  if (typeof date === 'string' || typeof date === 'number') {
    date = new Date(date);
  }
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function getLocalDateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getJoinedDate() {
  let joinedDate = state.joinedAt || currentUser?.metadata?.creationTime;
  if (joinedDate && joinedDate.toDate) joinedDate = joinedDate.toDate();
  if (typeof joinedDate === 'string' || typeof joinedDate === 'number') {
    joinedDate = new Date(joinedDate);
  }
  if (!(joinedDate instanceof Date) || Number.isNaN(joinedDate.getTime())) {
    joinedDate = new Date();
  }
  state.joinedAt = joinedDate;
  return joinedDate;
}

function maybeResetDailyStats() {
  const today = getLocalDateString();
  if (state.dailyDate !== today) {
    state.dailyDate = today;
    state.steps = 0;
    state.todaySteps = 0;
    state.todayKm = 0;
    state.todayCalories = 0;
    state.todayMinutes = 0;
    state.todayCO2g = 0;
    state.todayTrees = 0;
    state.sessionStartSteps = 0;
    if (typeof saveUserData === 'function') {
      saveUserData().catch(err => console.error('Failed to save daily reset state', err));
    }
  }
}

function buildWeekDataFromLogs() {
  const today = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dayKey = getLocalDateString(d);
    days.push({
      key: dayKey,
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      steps: 0,
      isToday: dayKey === getLocalDateString(today),
    });
  }

  const totalsByDay = logData.reduce((acc, entry) => {
    if (!entry.date) return acc;
    const dateKey = getLocalDateString(new Date(entry.date));
    acc[dateKey] = (acc[dateKey] || 0) + (entry.steps || 0);
    return acc;
  }, {});

  days.forEach(day => {
    day.steps = totalsByDay[day.key] || 0;
  });

  weekData.splice(0, weekData.length, ...days.map(d => ({ day: d.label, steps: d.steps, isToday: d.isToday })));
}

function updateUserDailySummary(sessionSteps, sessionKm, sessionKcal, sessionMin, sessionCo2) {
  maybeResetDailyStats();
  state.todaySteps = (state.todaySteps || 0) + sessionSteps;
  state.todayKm = Number((state.todayKm + sessionKm).toFixed(2));
  state.todayCalories += sessionKcal;
  state.todayMinutes += sessionMin;
  state.todayCO2g += sessionCo2;
  state.todayTrees = Math.floor(state.todayCO2g / CO2_PER_TREE_G);
  state.lifetimeSteps = (state.lifetimeSteps || 0) + sessionSteps;
  state.lifetimeCO2g = (state.lifetimeCO2g || 0) + sessionCo2;
  state.lifetimeTrees = Math.floor(state.lifetimeCO2g / CO2_PER_TREE_G);
}

function getStreakStorageKeys() {
  const userId = state.userId || (window.firebaseAuth?.currentUser?.uid || 'guest');
  return {
    dateKey: `cw-last-streak-date-${userId}`,
    countKey: `cw-streak-count-${userId}`
  };
}

function loadStreakFromStorage() {
  const today = getLocalDateString();
  const yesterday = getLocalDateString(new Date(Date.now() - 86400000));
  const { dateKey, countKey } = getStreakStorageKeys();
  const storedDate = localStorage.getItem(dateKey);
  const storedCount = parseInt(localStorage.getItem(countKey), 10) || 0;

  if (storedDate === today) {
    state.streak = storedCount;
  } else if (storedDate === yesterday) {
    state.streak = Math.max(storedCount + 1, 1);
  } else {
    state.streak = 1;
  }

  localStorage.setItem(dateKey, today);
  localStorage.setItem(countKey, state.streak);
}

function saveStreakToStorage() {
  const { dateKey, countKey } = getStreakStorageKeys();
  localStorage.setItem(dateKey, getLocalDateString());
  localStorage.setItem(countKey, state.streak);
}

function updateStreak() {
  setText('tb-streak', state.streak);
  setText('ps-streak', state.streak);
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

function initLeafletMap() {
  if (!window.L) return;
  const mapContainer = $('leaflet-map');
  if (!mapContainer) return;
  if (state.leafletMap) return;

  state.leafletMap = L.map('leaflet-map', {
    zoomControl: true,
    attributionControl: false,
    scrollWheelZoom: true,
    doubleClickZoom: true,
    touchZoom: true,
  }).setView([0, 0], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(state.leafletMap);

  state.leafletPolyline = L.polyline([], {
    color: '#059669',
    weight: 4,
    opacity: 0.9,
    lineCap: 'round',
  }).addTo(state.leafletMap);
}

function updateLeafletMap(lat, lon) {
  if (!state.leafletMap) return;

  const latlng = [lat, lon];

  if (!state.leafletMarker) {
    state.leafletMarker = L.marker(latlng).addTo(state.leafletMap);
  } else {
    state.leafletMarker.setLatLng(latlng);
  }

  const overlayLabel = $('map-overlay-label');
  if (overlayLabel && state.mapRunning && state.lastPosition) {
    const lat = state.lastPosition.lat.toFixed(5);
    const lon = state.lastPosition.lon.toFixed(5);
    overlayLabel.textContent = `🛰️ Live location: ${lat}, ${lon}`;
  }

  const lastLatLng = state.leafletRoutePoints[state.leafletRoutePoints.length - 1];
  if (!lastLatLng || getDistanceMeters(lastLatLng[0], lastLatLng[1], lat, lon) > 1) {
    state.leafletRoutePoints.push(latlng);
    state.leafletPolyline.setLatLngs(state.leafletRoutePoints);
  }

  if (state.leafletRoutePoints.length === 1) {
    state.leafletMap.setView(latlng, 16);
  } else {
    state.leafletMap.panTo(latlng, { animate: true, duration: 0.3 });
  }
}

function initRoutePlannerMap() {
  const container = $('route-planner-leaflet');
  if (!container || state.routePlannerMap) return;

  const campusCenter = { lat: 16.747625, lng: 100.195274 };
  state.routePlannerMap = L.map(container, {
    center: [campusCenter.lat, campusCenter.lng],
    zoom: 16,
    zoomControl: true,
    scrollWheelZoom: true,
    doubleClickZoom: true,
    touchZoom: true,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors',
  }).addTo(state.routePlannerMap);

  state.routePlannerRouteLine = L.polyline([], {
    color: '#059669',
    weight: 6,
    opacity: 0.9,
    lineCap: 'round',
  }).addTo(state.routePlannerMap);

  state.routePlannerPlaces = [
    { label: 'มหาวิทยาลัยนเรศวร', coords: { lat: 16.747625, lng: 100.195274 } },
    { label: 'โรงพยาบาลมหาวิทยาลัยนเรศวร', coords: { lat: 16.7489345, lng: 100.1895072 } },
    { label: 'คณะแพทยศาสตร์', coords: { lat: 16.74812288, lng: 100.1888527 } },
    { label: 'คณะทันตแพทยศาสตร์', coords: { lat: 16.74646623, lng: 100.1891853 } },
    { label: 'คณะเภสัชศาสตร์', coords: { lat: 16.74642955, lng: 100.1902523 } },
    { label: 'คณะพยาบาลศาสตร์', coords: { lat: 16.74541832, lng: 100.1893244 } },
    { label: 'คณะวิทยาศาสตร์การแพทย์', coords: { lat: 16.74540437, lng: 100.1913545 } },
    { label: 'คณะวิศวกรรมศาสตร์', coords: { lat: 16.7438485, lng: 100.1965447 } },
    { label: 'คณะบริหารธุรกิจ เศรษฐศาสตร์และการสื่อสาร', coords: { lat: 16.74876895, lng: 100.1965233 } },
    { label: 'คณะนิติศาสตร์', coords: { lat: 16.74877705, lng: 100.1959695 } },
    { label: 'คณะมนุษยศาสตร์', coords: { lat: 16.7491191, lng: 100.1942957 } },
    { label: 'คณะสังคมศาสตร์', coords: { lat: 16.749103, lng: 100.1962997 } },
    { label: 'คณะศึกษาศาสตร์', coords: { lat: 16.74734428, lng: 100.1942014 } },
    { label: 'คณะสถาปัตยกรรมศาสตร์', coords: { lat: 16.74598996, lng: 100.194697 } },
    { label: 'คณะสาธารณสุขศาสตร์', coords: { lat: 16.74515817, lng: 100.1897298 } },
    { label: 'คณะเกษตรศาสตร์ ทรัพยากรธรรมชาติและสิ่งแวดล้อม', coords: { lat: 16.74619511, lng: 100.1957609 } },
    { label: 'คณะวิทยาศาสตร์', coords: { lat: 16.74186833, lng: 100.1941494 } },
    { label: 'คณะสหเวชศาสตร์', coords: { lat: 16.74591514, lng: 100.189145 } },
    { label: 'กองการศึกษาทั่วไป (อาคารมิ่งขวัญ)', coords: { lat: 16.74865122, lng: 100.1930625 } },
    { label: 'กองคลัง (อาคารมิ่งขวัญ)', coords: { lat: 16.74856025, lng: 100.1995516 } },
    { label: 'กองกิจการนิสิต (อาคารขวัญเมือง)', coords: { lat: 16.73722898, lng: 100.199538 } },
    { label: 'กองบริการการศึกษา (อาคารเรียนรวม QS)', coords: { lat: 16.74675773, lng: 100.192665 } },
    { label: 'กองบริการเทคโนโลยีสารสนเทศและการสื่อสาร (CITCOMS)', coords: { lat: 16.74749687, lng: 100.1953487 } },
    { label: 'โรงละครเฉลิมพระเกียรติ (อาคารเรียนรวม QS)', coords: { lat: 16.74579912, lng: 100.1930326 } },
    { label: 'ศูนย์แสดงนิทรรศการและการจัดประชุม สมเด็จพระนเรศวรมหาราช (อาคารปราบไตรจักร / KNECC)', coords: { lat: 16.7480637466524, lng: 100.185722248863 } },
    { label: 'อาคารกิจกรรมด้านศิลปวัฒนธรรม', coords: { lat: 16.7400546, lng: 100.1991185 } },
    { label: 'ศูนย์หนังสือจุฬาลงกรณ์ มหาวิทยาลัยนเรศวร', coords: { lat: 16.74516214, lng: 100.1933652 } },
    { label: 'สถานพัฒนาวิชาการด้านภาษา (ศูนย์ภาษา NULC)', coords: { lat: 16.74763596, lng: 100.1952932 } },
    { label: 'สำนักหอสมุด', coords: { lat: 16.7456707, lng: 100.1942182 } },
    { label: 'ศูนย์อาหาร NU Canteen', coords: { lat: 16.74421437, lng: 100.1933666 } },
    { label: 'ศูนย์อาหาร NU Square', coords: { lat: 16.7374144, lng: 100.1990618 } },
    { label: 'สถานีขนส่งมวลชน มหาวิทยาลัยนเรศวร', coords: { lat: 16.73842819, lng: 100.1999646 } },
    { label: 'โครงการหอพักนิสิตมหาวิทยาลัยนเรศวร (NU Dorm)', coords: { lat: 16.73710804, lng: 100.2001635 } },
    { label: 'ที่ทำการไปรษณีย์ (สาขามน.)', coords: { lat: 16.74404823, lng: 100.1899471 } },
    { label: 'พิพิธภัณฑ์ผ้า', coords: { lat: 16.75083859, lng: 100.1936 } },
    { label: 'โรงพยาบาลทันตกรรม', coords: { lat: 16.74711018, lng: 100.1892119 } },
    { label: 'โรงเรียนสาธิตมหาวิทยาลัยนเรศวร (ปฐมวัยและประถมศึกษา)', coords: { lat: 16.74788331, lng: 100.1937801 } },
    { label: 'ลานกิจกรรมกลางแจ้ง (ศิลป์ศาลา)', coords: { lat: 16.74755774, lng: 100.1972816 } },
    { label: 'วิทยาลัยการจัดการระบบสุขภาพ', coords: { lat: 16.74249516, lng: 100.1916771 } },
    { label: 'วิทยาลัยนานาชาติ', coords: { lat: 16.74553955, lng: 100.1935566 } },
    { label: 'วิทยาลัยพลังงานทดแทนและสมาร์ดกริดเทคโนโลยี', coords: { lat: 16.73755746, lng: 100.1947059 } },
    { label: 'วิทยาลัยเพื่อการค้นคว้าระดับรากฐาน', coords: { lat: 16.74215518, lng: 100.1924192 } },
    { label: 'วิทยาลัยโลจิสติกส์และโซ่อุปทาน', coords: { lat: 16.74450039, lng: 100.1964117 } },
    { label: 'จุดรับพระราชทานปริญญาบัตร (อาคาร KNECC)', coords: { lat: 16.748058, lng: 100.186203 } },
    { label: 'ศูนย์อาหารเพราพิลาส', coords: { lat: 16.74404823, lng: 100.1899471 } },
    { label: 'สถานปฏิบัติการเภสัชกรรมชุมชน สาขา2', coords: { lat: 16.74404383, lng: 100.1991642 } },
    { label: 'สถานสัตว์ทดลองเพื่อการวิจัย', coords: { lat: 16.742703, lng: 100.191095 } },
    { label: 'สระว่ายน้ำสุพรรณกัลยา', coords: { lat: 16.74670579, lng: 100.1973966 } },
    { label: 'อาคารกีฬาในร่ม (ข้างสระว่ายน้ำสุพรรณกัลยา)', coords: { lat: 16.74704482, lng: 100.1970935 } },
    { label: 'อาคารขวัญเมือง', coords: { lat: 16.73735898, lng: 100.199783 } },
    { label: 'อาคารเฉลิมพระเกียรติ 72 พรรษา (อาคารเรียนรวม QS)', coords: { lat: 16.74656966, lng: 100.1924747 } },
    { label: 'อาคารปราบไตรจักร', coords: { lat: 16.74775674, lng: 100.1934428 } },
    { label: 'อาคารปราบไตรจักร 2', coords: { lat: 16.74896496, lng: 100.1963112 } },
    { label: 'อาคารเพราพิลาส', coords: { lat: 16.74407093, lng: 100.1901394 } },
    { label: 'อาคารมหาธรรมราชา', coords: { lat: 16.74152796, lng: 100.1921852 } },
    { label: 'อาคารวิสุทธิกษัตริย์', coords: { lat: 16.75062657, lng: 100.1941497 } },
    { label: 'อาคารสำนักงานอธิการบดี', coords: { lat: 16.74805887, lng: 100.1918917 } },
    { label: 'อาคารอเนกประสงค์', coords: { lat: 16.75068289, lng: 100.1931716 } },
    { label: 'อาคารเอกาทศรถ', coords: { lat: 16.74245519, lng: 100.1916032 } },
  ];

  // Populate route start and end select dropdowns
  const startSelect = $('route-start-select');
  const endSelect = $('route-end-select');
  
  const selectHTML = `<option value="">เลือกสถานที่</option>${state.routePlannerPlaces.map((place, index) => `<option value="${index}">${place.label}</option>`).join('')}`;
  
  if (startSelect) {
    startSelect.innerHTML = selectHTML;
    startSelect.addEventListener('change', event => {
      if (!event.target.value) return;
      const index = Number(event.target.value);
      const place = state.routePlannerPlaces[index];
      if (place) {
        state.routePlannerMap.panTo([place.coords.lat, place.coords.lng]);
        state.routePlannerSelection = 'start';
        setRoutePlannerPoint(place.coords.lat, place.coords.lng, place.label);
        updateRoutePlannerSelectionUI();
      }
    });
  }
  
  if (endSelect) {
    endSelect.innerHTML = selectHTML;
    endSelect.addEventListener('change', event => {
      if (!event.target.value) return;
      const index = Number(event.target.value);
      const place = state.routePlannerPlaces[index];
      if (place) {
        state.routePlannerMap.panTo([place.coords.lat, place.coords.lng]);
        state.routePlannerSelection = 'end';
        setRoutePlannerPoint(place.coords.lat, place.coords.lng, place.label);
        updateRoutePlannerSelectionUI();
      }
    });
  }

  state.routePlannerPlaces.forEach((place) => {
    L.circleMarker([place.coords.lat, place.coords.lng], {
      radius: 6,
      color: '#059669',
      fillColor: '#10b981',
      fillOpacity: 0.9,
      weight: 2,
      interactive: false,
    }).addTo(state.routePlannerMap);
  });

  updateRoutePlannerSelectionUI();
}

function createRoutePlannerMarker(label, latlng, color) {
  const icon = L.divIcon({
    html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:${color};color:#fff;font-weight:700;font-size:14px;border:2px solid #fff;box-shadow:0 0 8px rgba(0,0,0,0.16)">${label}</div>`,
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
  return L.marker(latlng, { icon }).addTo(state.routePlannerMap);
}

function setRoutePlannerPoint(lat, lng, label = '') {
  const formatted = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  if (state.routePlannerSelection === 'start') {
    state.routePlannerStartCoords = { lat, lng };
    state.routePlannerStartLabel = label || '';

    if (!state.routePlannerStartMarker) {
      state.routePlannerStartMarker = createRoutePlannerMarker('A', [lat, lng], '#059669');
    } else {
      state.routePlannerStartMarker.setLatLng([lat, lng]);
    }

    const startInput = $('route-start');
    if (startInput) startInput.value = label || `A @ ${formatted}`;

    const startSelect = $('route-start-select');
    if (startSelect && label) {
      const idx = state.routePlannerPlaces.findIndex(p => p.label === label);
      if (idx >= 0) startSelect.value = idx;
    }
    showToast('📍 จุดเริ่มต้นเลือกแล้ว');
  } else {
    state.routePlannerEndCoords = { lat, lng };
    state.routePlannerEndLabel = label || '';

    if (!state.routePlannerEndMarker) {
      state.routePlannerEndMarker = createRoutePlannerMarker('B', [lat, lng], '#10b981');
    } else {
      state.routePlannerEndMarker.setLatLng([lat, lng]);
    }

    const endInput = $('route-end');
    if (endInput) endInput.value = label || `B @ ${formatted}`;

    const endSelect = $('route-end-select');
    if (endSelect && label) {
      const idx = state.routePlannerPlaces.findIndex(p => p.label === label);
      if (idx >= 0) endSelect.value = idx;
    }
    showToast('🎯 จุดปลายทางเลือกแล้ว');
  }
  updateRoutePlannerLine();
  updateRoutePlannerSelectionUI();
  updateStartWalkButtonState();
}

function setRoutePlannerSelection(mode) {
  state.routePlannerSelection = mode;
  updateRoutePlannerSelectionUI();
}

function updateRoutePlannerSelectionUI() {
  const startBtn = $('btn-select-route-start');
  const endBtn = $('btn-select-route-end');
  const hint = $('route-planner-map-hint');
  const coords = $('route-planner-map-coords');

  if (startBtn && endBtn) {
    startBtn.classList.toggle('active', state.routePlannerSelection === 'start');
    endBtn.classList.toggle('active', state.routePlannerSelection === 'end');
  }

  if (hint) {
    hint.textContent = state.routePlannerSelection === 'start'
      ? '📍 เลือกจุดเริ่มต้นจากรายการด้านล่าง'
      : '🎯 เลือกจุดปลายทางจากรายการด้านล่าง';
  }

  if (coords) {
    const startText = state.routePlannerStartCoords
      ? `A: ${state.routePlannerStartLabel || `${state.routePlannerStartCoords.lat.toFixed(5)}, ${state.routePlannerStartCoords.lng.toFixed(5)}`}`
      : 'A ยังไม่เลือก';
    const endText = state.routePlannerEndCoords
      ? `B: ${state.routePlannerEndLabel || `${state.routePlannerEndCoords.lat.toFixed(5)}, ${state.routePlannerEndCoords.lng.toFixed(5)}`}`
      : 'B ยังไม่เลือก';
    coords.textContent = `${startText} • ${endText}`;
  }
}

function handleRoutePlannerMapClick(event) {
  if (!event || !event.latlng) return;

  const lat = event.latlng.lat;
  const lng = event.latlng.lng;

  if (!state.routePlannerStartCoords || (state.routePlannerStartCoords && state.routePlannerEndCoords)) {
    state.routePlannerSelection = 'start';
  } else {
    state.routePlannerSelection = 'end';
  }

  setRoutePlannerPoint(lat, lng, '');
}

function updateRoutePlannerLine() {
  if (!state.routePlannerRouteLine) return;
  if (state.routePlannerStartCoords && state.routePlannerEndCoords) {
    state.routePlannerRouteLine.setLatLngs([]);
    requestWalkingRoute(state.routePlannerStartCoords, state.routePlannerEndCoords)
      .then(({ distanceKm, durationMin, path }) => {
        state.routePlannerRouteDistanceKm = distanceKm;
        if (Array.isArray(path) && path.length) {
          state.routePlannerRouteLine.setLatLngs(path.map(p => [p.lat, p.lng]));
          const bounds = L.latLngBounds(path.map(p => [p.lat, p.lng]));
          state.routePlannerMap.fitBounds(bounds.pad(0.12));
        }
      })
      .catch(() => {
        state.routePlannerRouteLine.setLatLngs([]);
        if (state.routePlannerStartCoords && state.routePlannerEndCoords) {
          const bounds = L.latLngBounds([
            [state.routePlannerStartCoords.lat, state.routePlannerStartCoords.lng],
            [state.routePlannerEndCoords.lat, state.routePlannerEndCoords.lng],
          ]);
          state.routePlannerMap.fitBounds(bounds.pad(0.12));
        }
        state.routePlannerRouteDistanceKm = null;
      });
  } else {
    state.routePlannerRouteLine.setLatLngs([]);
    state.routePlannerRouteDistanceKm = null;
  }
}

function requestWalkingRoute(origin, destination) {
  return new Promise((resolve, reject) => {
    const originLat = origin.lat;
    const originLng = origin.lng;
    const destLat = destination.lat;
    const destLng = destination.lng;
    const url = `https://router.project-osrm.org/route/v1/foot/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=false`;

    fetch(url)
      .then(response => response.json())
      .then(data => {
        if (!data || data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
          return reject('NO_ROUTE');
        }
        const route = data.routes[0];
        const path = route.geometry.coordinates.map(coord => ({ lat: coord[1], lng: coord[0] }));
        resolve({
          distanceKm: route.distance / 1000,
          durationMin: Math.round(route.duration / 60),
          path,
        });
      })
      .catch(err => reject(err));
  });
}

function getRoutePathFromDirections(route) {
  if (!route) return [];
  if (Array.isArray(route.overview_path) && route.overview_path.length > 2) {
    return route.overview_path.map(p => ({ lat: p.lat(), lng: p.lng() }));
  }
  if (route.overview_polyline && route.overview_polyline.points) {
    return decodePolyline(route.overview_polyline.points);
  }
  const legs = route.legs || [];
  for (const leg of legs) {
    if (Array.isArray(leg.steps) && leg.steps.length) {
      const path = [];
      leg.steps.forEach(step => {
        if (Array.isArray(step.path) && step.path.length) {
          step.path.forEach(p => path.push({ lat: p.lat(), lng: p.lng() }));
        }
      });
      if (path.length) return path;
    }
  }
  return [];
}

function decodePolyline(encoded) {
  const path = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += deltaLat;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += deltaLng;

    path.push({ lat: lat * 1e-5, lng: lng * 1e-5 });
  }

  return path;
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const toRad = v => v * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function parseLatLng(text) {
  const match = text.match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  return [parseFloat(match[1]), parseFloat(match[2])];
}

/* ──────────────────────────────────────────────
   LOGIN
────────────────────────────────────────────── */
/* ──────────────────────────────────────────────
   PAGE NAVIGATION
────────────────────────────────────────────── */
function resetUserState() {
  // Clear all user-specific state when logging out
  state.userId = null;
  state.userName = null;
  state.joinedAt = null;
  state.steps = 0;
  state.dailyGoal = DAILY_GOAL_DEFAULT;
  state.lifetimeSteps = 0;
  state.lifetimeCO2g = 0;
  state.lifetimeTrees = 0;
  state.streak = 0;
  state.ecoPoints = 0;
  state.profileLevel = 1;
  state.profileRank = 'Eco Seedling';
  state.profileImpactKm = 0;
  state.profileImpactCO2kg = 0;
  state.dailyDate = null;
  state.todayKm = 0;
  state.todayCalories = 0;
  state.todayMinutes = 0;
  state.todayCO2g = 0;
  state.todayTrees = 0;
  state.activeChallenges = [];
  state.challengeWeekStart = null;
  state.loggedIn = false;
  console.log('✅ User state cleared on logout');
}

function showLoginPage() {
  const loginPage = $('page-login');
  const signupPage = $('page-signup');
  const appShell = $('app-shell');
  
  if (loginPage) {
    loginPage.classList.remove('hidden');
    loginPage.classList.add('active');
  }
  if (signupPage) signupPage.classList.add('hidden');
  if (appShell) appShell.classList.add('hidden');
  
  // Clear user state
  resetUserState();
  
  // Clear forms
  const loginEmail = $('login-email');
  const loginPassword = $('login-password');
  if (loginEmail) loginEmail.value = '';
  if (loginPassword) loginPassword.value = '';
}

function showSignupPage() {
  const loginPage = $('page-login');
  const signupPage = $('page-signup');
  
  if (loginPage) {
    loginPage.classList.add('hidden');
    loginPage.classList.remove('active');
  }
  if (signupPage) {
    signupPage.classList.remove('hidden');
    signupPage.classList.add('active');
  }
  
  // Clear forms
  const signupName = $('signup-name');
  const signupEmail = $('signup-email');
  const signupPassword = $('signup-password');
  const signupConfirmPassword = $('signup-confirm-password');
  if (signupName) signupName.value = '';
  if (signupEmail) signupEmail.value = '';
  if (signupPassword) signupPassword.value = '';
  if (signupConfirmPassword) signupConfirmPassword.value = '';
}

function showApp() {
  const loginPage = $('page-login');
  const signupPage = $('page-signup');
  const appShell = $('app-shell');
  
  if (loginPage) {
    loginPage.classList.remove('active');
    loginPage.classList.add('hidden');
  }
  if (signupPage) {
    signupPage.classList.remove('active');
    signupPage.classList.add('hidden');
  }
  if (appShell) {
    appShell.classList.remove('hidden');
    appShell.classList.add('active');
  }
  
  // Ensure the home tab is visible
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  const homeTab = $('tab-home');
  if (homeTab) homeTab.classList.add('active');
  const homeNavButton = document.querySelector('.top-nav-btn[data-tab="home"]');
  if (homeNavButton) {
    document.querySelectorAll('.top-nav-btn').forEach(btn => btn.classList.remove('active'));
    homeNavButton.classList.add('active');
  }
  
  state.loggedIn = true;
  maybeResetDailyStats();
  
  if ($('user-name-home')) {
    $('user-name-home').textContent = state.userName;
  }
  if ($('profile-name-display')) {
    $('profile-name-display').textContent = state.userName;
  }
  updateGreeting();
  if ($('profile-joined')) {
    const joinedDate = getJoinedDate();
    const joinedText = formatFullDate(joinedDate);
    $('profile-joined').textContent = `🌱 Eco walker since ${joinedText}`;
  }
  
  // Update streak display immediately for new account
  updateStreak();
  
  console.log('✅ showApp() called — app shell should now be visible');
  initApp();
}

/* ──────────────────────────────────────────────
   FIREBASE AUTHENTICATION UI
────────────────────────────────────────────── */
function initLogin() {
  // Login button
  $('btn-login').addEventListener('click', async () => {
    const email = $('login-email').value.trim();
    const pass  = $('login-password').value.trim();

    if (!email || !pass) {
      showToast('⚠️ Please enter your email and password');
      return;
    }

    try {
      await loginUser(email, pass);
    } catch (error) {
      console.error('Login failed:', error);
    }
  });

  // Enter key support
  [$('login-email'), $('login-password')].forEach(el => {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') $('btn-login').click();
    });
  });

  // Link to signup
  const linkToSignup = $('link-to-signup');
  if (linkToSignup) {
    linkToSignup.addEventListener('click', (e) => {
      e.preventDefault();
      showSignupPage();
    });
  }
  
  // Forgot password
  const linkForgot = $('link-forgot-password');
  if (linkForgot) {
    linkForgot.addEventListener('click', async (e) => {
      e.preventDefault();
      // Use email in login field if present
      const defaultEmail = $('login-email') ? $('login-email').value.trim() : '';
      let email = defaultEmail;
      if (!email) {
        email = window.prompt('Enter your email address to receive a password reset link:');
        if (!email) return;
      }
      try {
        await sendPasswordReset(email);
      } catch (err) {
        console.error('sendPasswordReset failed', err);
      }
    });
  }
}

function initSignup() {
  $('btn-signup').addEventListener('click', async () => {
    const name = $('signup-name').value.trim();
    const email = $('signup-email').value.trim();
    const pass  = $('signup-password').value.trim();
    const passConfirm = $('signup-confirm-password').value.trim();

    // Validation
    if (!name || !email || !pass || !passConfirm) {
      showToast('⚠️ Please fill in all fields');
      return;
    }

    if (pass.length < 8) {
      showToast('⚠️ Password must be at least 8 characters long');
      return;
    }

    if (pass !== passConfirm) {
      showToast('⚠️ Passwords do not match');
      return;
    }

    try {
      await registerUser(email, pass, name);
    } catch (error) {
      console.error('Signup failed:', error);
    }
  });

  // Enter key support
  const signupFields = [$('signup-name'), $('signup-email'), $('signup-password'), $('signup-confirm-password')];
  signupFields.forEach(el => {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') $('btn-signup').click();
    });
  });

  // Link to login
  const linkToLogin = $('link-to-login');
  if (linkToLogin) {
    linkToLogin.addEventListener('click', (e) => {
      e.preventDefault();
      showLoginPage();
    });
  }
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
  if (tabId === 'map' && !state.mapChoiceConfirmed) {
    showMapChoiceModal();
    return;
  }

  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  // Show target
  const target = $('tab-' + tabId);
  if (target) target.classList.add('active');

  const activeNavTab = tabId === 'route-planner' ? 'map' : tabId;

  // Update bnav
  document.querySelectorAll('.bnav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === activeNavTab);
  });

  // Update top nav
  document.querySelectorAll('.top-nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === activeNavTab);
  });

  if ((tabId === 'map' && state.leafletMap) || (tabId === 'route-planner' && state.routePlannerMap)) {
    setTimeout(() => {
      if (tabId === 'map' && state.leafletMap) state.leafletMap.invalidateSize();
      if (tabId === 'route-planner' && state.routePlannerMap) {
        state.routePlannerMap.invalidateSize();
      }
    }, 200);
  }
}

function showMapChoiceModal() {
  const modal = $('map-choice-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  state.mapChoice = state.mapChoice || 'live';
  document.querySelectorAll('.map-choice-option').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.choice === state.mapChoice);
  });
}

function hideMapChoiceModal() {
  const modal = $('map-choice-modal');
  if (!modal) return;
  modal.classList.add('hidden');
}

function selectMapChoice(choice) {
  state.mapChoice = choice;
  document.querySelectorAll('.map-choice-option').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.choice === choice);
  });
}

function confirmMapChoice() {
  if (!state.mapChoice) return;
  state.mapChoiceConfirmed = true;
  hideMapChoiceModal();
  
  // Add badges based on selected mode
  if (state.mapChoice === 'live') {
    // Live Walk Tracker mode badges
    addBadgesToCollection([0, 1, 2, 6, 7, 8, 10]); // First Step, Seedling, Eco Walker, Eco Warrior, Marathoner, Champion, Speed Walker
    switchTab('map');
  } else if (state.mapChoice === 'route') {
    // Route Planner mode badges
    addBadgesToCollection([0, 1, 2, 3, 5, 6, 7]); // First Step, Seedling, Eco Walker, Goal Getter, Tree Saver, Eco Warrior, Marathoner
    switchTab('route-planner');
  } else if (state.mapChoice === 'stairs') {
    // Stairs Challenge mode badges
    addBadgesToCollection([0, 1, 4, 9, 10]); // First Step, Seedling, On Fire, Green Hero, Speed Walker
    switchTab('stairs');
  }
}

function startTracking() {
  if (state.tracking) return;
  if (!navigator.geolocation) {
    showToast('📡 GPS ไม่รองรับในเบราว์เซอร์นี้');
    return;
  }

  maybeResetDailyStats();
  state.sessionStartSteps = state.steps;
  state.tracking = true;
  navigator.geolocation.getCurrentPosition(handlePositionUpdate, handleGeoError, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 15000,
  });

  state.geoWatchId = navigator.geolocation.watchPosition(handlePositionUpdate, handleGeoError, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 15000,
  });
}

async function stopTracking() {
  if (!state.tracking) return;
  state.tracking = false;
  if (state.geoWatchId !== null) {
    navigator.geolocation.clearWatch(state.geoWatchId);
    state.geoWatchId = null;
  }

  const now = new Date();
  const today = getLocalDateString(now);
  const sessionSteps = Math.max(0, state.steps - (state.sessionStartSteps || 0));
  const sessionKm = Number((state.mapDistanceM / 1000).toFixed(2));
  const sessionKcal = Math.round((state.mapDistanceM / STEP_LENGTH_M) * CAL_PER_STEP);
  const sessionMin = Math.floor(state.mapSeconds / 60);
  const sessionCo2 = Math.round(sessionKm * CO2_PER_KM_CAR_G);

  if (sessionSteps === 0 && sessionKm === 0 && sessionMin === 0) {
    return;
  }

  updateUserDailySummary(sessionSteps, sessionKm, sessionKcal, sessionMin, sessionCo2);

  if (state.userId && window.saveUserLogEntry) {
    const entry = {
      steps: sessionSteps,
      km: sessionKm,
      co2: sessionCo2,
      kcal: sessionKcal,
      minutes: sessionMin,
      emoji: '🚶',
      date: now.toISOString(),
    };
    try {
      await window.saveUserLogEntry(entry);
      setLogData([entry].concat(logData));
    } catch (e) {
      console.error('Failed to save user log entry', e);
    }
  }

  if (typeof updateStreakAfterWalk === 'function') {
    try {
      await updateStreakAfterWalk();
    } catch (e) {
      console.error('Failed to update streak after walk', e);
    }
  }

  if (typeof saveUserData === 'function') {
    try {
      await saveUserData();
    } catch (e) {
      console.error('Failed to save user summary after stopTracking', e);
    }
  }

  if (typeof updateProfile === 'function') {
    updateProfile();
  }
}

function handlePositionUpdate(position) {
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;

  if (!state.mapStartLocation) {
    state.mapStartLocation = { lat, lon };
    state.routePoints = [getRelativeMapPosition(lat, lon)];
  }

  state.currentMapPos = getRelativeMapPosition(lat, lon);

  if (state.lastPosition) {
    const deltaM = getDistanceMeters(state.lastPosition.lat, state.lastPosition.lon, lat, lon);
    if (deltaM > 0.5) {
      state.mapDistanceM += deltaM;
      const stepDelta = Math.round(deltaM / STEP_LENGTH_M);
      state.steps += stepDelta;
      updateDashboard();
      updateMapStats();
    }
  }

  state.lastPosition = { lat, lon };
  updateMapRoute(lat, lon);
  updateMapView();
  updateMapStats();
  updateLeafletMap(lat, lon);
}

function handleGeoError(error) {
  const message = {
    1: '⚠️ กรุณาอนุญาตให้เข้าถึงตำแหน่ง',
    2: '⚠️ ไม่สามารถค้นหาตำแหน่งได้',
    3: '⚠️ ใช้เวลาโหลดตำแหน่งนานเกินไป',
  }[error.code] || '⚠️ เกิดข้อผิดพลาด GPS';
  showToast(message);
}

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = deg => deg * Math.PI / 180;
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getRelativeMapPosition(lat, lon) {
  const toRad = deg => deg * Math.PI / 180;
  const origin = state.mapStartLocation || { lat, lon };
  const deltaLon = lon - origin.lon;
  const deltaLat = lat - origin.lat;
  const xMeters = deltaLon * 111320 * Math.cos(toRad(lat));
  const yMeters = deltaLat * 110540;
  const MAX_SPAN = 300; // meters shown inside the map frame
  const xPct = 50 + Math.max(Math.min((xMeters / MAX_SPAN) * 40, 40), -40);
  const yPct = 50 - Math.max(Math.min((yMeters / MAX_SPAN) * 40, 40), -40);
  return { x: xPct, y: yPct };
}

function updateMapRoute(lat, lon) {
  const pos = getRelativeMapPosition(lat, lon);
  state.currentMapPos = pos;
  const last = state.routePoints[state.routePoints.length - 1];
  const distanceSinceLast = last ? Math.hypot(pos.x - last.x, pos.y - last.y) : 0;
  if (!last || distanceSinceLast > 0.2) {
    state.routePoints.push(pos);
    if (state.routePoints.length > 40) {
      state.routePoints.shift();
    }
  }
  updateMapView();
}

function updateMapView() {
  const poly = $('map-route-polyline');
  const pin = $('current-pin');
  const label = $('map-overlay-label');
  if (poly) {
    const points = state.routePoints.map(p => `${p.x},${p.y}`).join(' ');
    poly.setAttribute('points', points);
  }
  if (pin) {
    const current = state.currentMapPos || state.routePoints[state.routePoints.length - 1];
    if (current) {
      pin.style.left = `${current.x}%`;
      pin.style.top = `${current.y}%`;
      pin.classList.remove('hidden');
    } else {
      pin.classList.add('hidden');
    }
  }
  if (label) {
    if (state.mapRunning && state.lastPosition) {
      const lat = state.lastPosition.lat.toFixed(5);
      const lon = state.lastPosition.lon.toFixed(5);
      label.textContent = `🛰️ Live location: ${lat}, ${lon}`;
    } else if (state.mapRunning) {
      label.textContent = '🛰️ GPS tracking live — ตำแหน่งของคุณอัปเดตเรียลไทม์';
    } else {
      label.textContent = '🛰️ GPS Map (connect device to activate)';
    }
  }

  const coordsEl = $('map-coordinates-display');
  if (coordsEl && !coordsEl.classList.contains('hidden') && state.lastPosition) {
    const lat = state.lastPosition.lat.toFixed(5);
    const lon = state.lastPosition.lon.toFixed(5);
    coordsEl.textContent = `${lat}, ${lon}`;
  }
}

function resetMapView() {
  state.routePoints = [];
  state.mapStartLocation = null;
  state.currentMapPos = null;
  state.leafletRoutePoints = [];
  const poly = $('map-route-polyline');
  const pin = $('current-pin');
  if (poly) poly.setAttribute('points', '');
  if (pin) {
    pin.style.left = '50%';
    pin.style.top = '50%';
    pin.classList.add('hidden');
  }
  if (state.leafletPolyline) {
    state.leafletPolyline.setLatLngs([]);
  }
  state.liveRouteCoords = [];
}

/* ──────────────────────────────────────────────
   DASHBOARD CALCULATIONS & UI UPDATE
───────────────────────────────────────────── */
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

  const liveDistanceKm = state.mapDistanceM > 0 ? state.mapDistanceM / 1000 : (s * STEP_LENGTH_M / 1000);
  const liveCalories   = Math.round((state.mapDistanceM > 0 ? state.mapDistanceM / STEP_LENGTH_M : s) * CAL_PER_STEP);
  const liveTotalSeconds = ((state.todayMinutes || 0) * 60) + state.mapSeconds;
  const liveMinutes    = Math.floor(liveTotalSeconds / 60);

  setText('stat-km', liveDistanceKm.toFixed(2));
  setText('stat-cal', liveCalories);
  setText('stat-min', liveMinutes);

  // Carbon saved
  // Baseline/project approach: baseline = motorized travel emissions for same distance,
  // project = walking/emission-free step travel, reduction = baseline - project.
  const baselineCo2g = state.mapDistanceM > 0 ? Math.round(liveDistanceKm * CO2_PER_KM_CAR_G) : Math.round(s * CO2_PER_STEP_G);
  const baselineCo2kg = baselineCo2g / 1000;
  const co2km  = state.mapDistanceM > 0 ? liveDistanceKm.toFixed(2) : (s * CO2_PER_STEP_G / CO2_PER_KM_CAR_G).toFixed(2);
  setText('carbon-grams', baselineCo2kg.toFixed(2));
  setText('carbon-km-equiv', co2km);

  // Update eco points / profile metrics from today’s saved carbon
  state.ecoPoints = baselineCo2g;
  state.profileImpactKm = Number(liveDistanceKm.toFixed(2));
  state.profileImpactCO2kg = baselineCo2kg;
  state.profileLevel = 1 + Math.floor(state.ecoPoints / 1000);
  const rankNames = ['Eco Seedling', 'Eco Walker', 'Green Hero', 'Climate Champion'];
  state.profileRank = rankNames[Math.min(rankNames.length - 1, state.profileLevel - 1)];

  // Carbon bar (daily cap = goal steps worth of CO₂)
  const carbonPct = Math.min((baselineCo2g / (goal * CO2_PER_STEP_G)) * 100, 100);
  const carbonBar = $('carbon-bar');
  if (carbonBar) carbonBar.style.width = carbonPct + '%';

  // Tree conversion
  updateTreeWidget(baselineCo2g);

  // Map sync
  const mapKm = liveDistanceKm.toFixed(2);
  setText('map-km', `${mapKm} km`);
  setText('map-co2', `${baselineCo2g}g`);

  // Challenges update
  updateChallenges();
  evaluateBadges();
  // Rebuild full challenges list so progress reflects current `state`
  buildChallengesList();
  updateProfile();
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
const allBadgesAvailable = [
  { icon: '👣', name: 'First Step',    req: 'Walk 1 step',          unlocked: false },
  { icon: '🌱', name: 'Seedling',      req: '1,000 steps',          unlocked: false },
  { icon: '🌿', name: 'Eco Walker',    req: '5,000 steps in a day', unlocked: false },
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

// Dynamically available badges (starts empty, gets added as user progresses)
let badgesData = [];

function ensureAllBadgesPresent() {
  if (!Array.isArray(badgesData)) {
    badgesData = [];
  }
  const complete = allBadgesAvailable.map(defaultBadge => {
    const saved = badgesData.find(b => b.name === defaultBadge.name);
    return {
      ...defaultBadge,
      unlocked: !!saved?.unlocked
    };
  });
  badgesData = complete;
}

function addBadgesToCollection(badgeIndices) {
  badgeIndices.forEach(idx => {
    if (idx >= 0 && idx < allBadgesAvailable.length && !badgesData.some(b => b.name === allBadgesAvailable[idx].name)) {
      badgesData.push({ ...allBadgesAvailable[idx] });
    }
  });
  updateAchievementsHeader();
  buildBadgesGrid();
}

function unlockBadge(badgeName) {
  const badge = badgesData.find(b => b.name === badgeName);
  if (badge && !badge.unlocked) {
    badge.unlocked = true;
    updateAchievementsHeader();
    buildBadgesGrid();
    showToast(`🎉 ปลดล็อกเป้าหมายใหม่: ${badgeName}`);
    if (typeof saveUserData === 'function') {
      saveUserData().catch(err => console.error('Failed to save unlocked badge', err));
    }
  }
}

function buildBadgesGrid() {
  ensureAllBadgesPresent();
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

function getCurrentWalkingPaceMinPerKm() {
  if (state.mapDistanceM > 0 && state.mapSeconds > 0) {
    return state.mapSeconds / (state.mapDistanceM / 1000);
  }
  return Infinity;
}

function hasNightWalkHistory() {
  return Array.isArray(logData) && logData.some(entry => {
    if (!entry.date) return false;
    const date = new Date(entry.date);
    if (Number.isNaN(date.getTime())) return false;
    const hour = date.getHours();
    return hour >= 21 || hour <= 5;
  });
}

function shouldAutoUnlockBadge(badge) {
  switch (badge.name) {
    case 'First Step':
      return (state.todaySteps || state.steps || 0) >= 1;
    case 'Seedling':
      return (state.todaySteps || state.steps || 0) >= 1000;
    case 'Eco Walker':
      return (state.todaySteps || 0) >= 5000;
    case 'Goal Getter':
      return (state.todaySteps || 0) >= (state.dailyGoal || DAILY_GOAL_DEFAULT);
    case 'On Fire':
      return (state.streak || 0) >= 7;
    case 'Tree Saver':
      return (state.todayTrees || 0) >= 1 || (state.todayCO2g || 0) >= CO2_PER_TREE_G || (state.lifetimeTrees || 0) >= 1;
    case 'Eco Warrior':
      return (state.todayCO2g || 0) >= 1000 || (state.lifetimeCO2g || 0) >= 1000;
    case 'Marathoner':
      return (state.lifetimeSteps || 0) >= 42000;
    case 'Champion':
      return (state.streak || 0) >= 30;
    case 'Green Hero':
      return (state.lifetimeTrees || 0) >= 10;
    case 'Speed Walker':
      return getCurrentWalkingPaceMinPerKm() > 0 && getCurrentWalkingPaceMinPerKm() < 12;
    case 'Night Walker':
      return hasNightWalkHistory() || ((new Date()).getHours() >= 21 && (state.todaySteps || 0) > 0);
    default:
      return false;
  }
}

function evaluateBadges() {
  if (!Array.isArray(badgesData)) return;
  badgesData.forEach(badge => {
    if (!badge.unlocked && shouldAutoUnlockBadge(badge)) {
      unlockBadge(badge.name);
    }
  });
}

/* ──────────────────────────────────────────────
   CHALLENGES LIST (Achievements page) - dynamic progress
────────────────────────────────────────────── */
let challengesData = [
  { icon: '🚶', name: 'Daily 10K',    desc: 'Walk 10,000 steps today', unit: 'steps',  target: 10000, pts: 100 },
  { icon: '🌍', name: 'Carbon Buster', desc: 'Save 500g of CO₂ today', unit: 'co2g',   target: 500,   pts: 80  },
  { icon: '📏', name: 'Five KM Club', desc: 'Walk 5 km without stopping', unit: 'distance', target: 5,    pts: 120 },
  { icon: '🔥', name: 'Streak Week',  desc: 'Walk 7 days in a row', unit: 'streak', target: 7, pts: 200 },
  { icon: '🌱', name: 'Green Seed',   desc: 'Grow your first virtual tree', unit: 'co2g', target: CO2_PER_TREE_G, pts: 150 },
];

function getChallengeProg(c) {
  switch (c.unit) {
    case 'steps':
      return state.steps;
    case 'co2g':
      // approximate today's CO2 saved from steps (grams)
      return Math.round(state.steps * CO2_PER_STEP_G);
    case 'distance':
      // prefer map distance if available, otherwise derive from steps
      return state.mapDistanceM > 0 ? (state.mapDistanceM / 1000) : (state.steps * STEP_LENGTH_M / 1000);
    case 'streak':
      return state.streak;
    default:
      return 0;
  }
}

function buildChallengesList() {
  const list = $('challenges-list');
  if (!list) return;
  list.innerHTML = challengesData.map(c => {
    const prog = getChallengeProg(c);
    const pct = Math.min(Math.round((prog / c.target) * 100), 100);
    const done = pct >= 100;
    const progLabel = c.unit === 'distance' ? `${prog.toFixed(1)} km` : (c.unit === 'co2g' ? `${(prog/1000).toFixed(2)} kg` : prog.toLocaleString());
    return `
      <div class="challenge-card ${done ? 'completed' : ''}">
        <span class="challenge-icon">${c.icon}</span>
        <div class="challenge-info">
          <span class="challenge-name">${c.name} ${done ? '✅' : ''}</span>
          <span class="challenge-desc">${c.desc}</span>
          <div class="challenge-prog-bar-bg">
            <div class="challenge-prog-bar-fill" style="width:${pct}%"></div>
          </div>
          <div class="challenge-prog-label">${progLabel} / ${c.unit === 'co2g' ? (c.target/1000).toFixed(2) + ' kg' : (c.unit === 'distance' ? c.target + ' km' : c.target.toLocaleString())}</div>
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
  { day: 'Mon', steps: 0  },
  { day: 'Tue', steps: 0 },
  { day: 'Wed', steps: 0  },
  { day: 'Thu', steps: 0  },
  { day: 'Fri', steps: 0 },
  { day: 'Sat', steps: 0  },
  { day: 'Sun', steps: 0, isToday: true },
];

let logData = [];

function syncLifetimeStatsFromLogs() {
  if (!Array.isArray(logData) || !logData.length) return;

  const logTotalSteps = logData.reduce((sum, entry) => sum + (entry.steps || 0), 0);
  const logTotalCO2g = logData.reduce((sum, entry) => sum + (entry.co2 || 0), 0);
  const logTotalTrees = Math.floor(logTotalCO2g / CO2_PER_TREE_G);

  if (!Number.isFinite(state.lifetimeSteps) || state.lifetimeSteps < logTotalSteps) {
    state.lifetimeSteps = logTotalSteps;
  }
  if (!Number.isFinite(state.lifetimeCO2g) || state.lifetimeCO2g < logTotalCO2g) {
    state.lifetimeCO2g = logTotalCO2g;
  }
  if (!Number.isFinite(state.lifetimeTrees) || state.lifetimeTrees < logTotalTrees) {
    state.lifetimeTrees = logTotalTrees;
  }
}

function setLogData(newLogs) {
  logData = Array.isArray(newLogs) ? newLogs : [];
  buildLogList();
  buildCumulStats();
  buildWeekDataFromLogs();
  buildWeekChart();
  syncLifetimeStatsFromLogs();
  updateProfile();
}

// expose to other scripts
window.setLogData = setLogData;

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

  if (!logData.length) {
    list.innerHTML = `
      <div class="log-empty">
        <div class="log-empty-icon">📓</div>
        <h4>ยังไม่มีบันทึกการเดิน</h4>
        <p>เมื่อใช้งานแอปและเริ่มเดินจริง ระบบจะบันทึกข้อมูลประจำวันให้อัตโนมัติ</p>
        <p class="log-empty-note">วันที่ · ก้าว · ระยะทาง · CO₂ saved · แคลอรี่</p>
      </div>
    `;
    return;
  }

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

function updateAchievementsHeader() {
  ensureAllBadgesPresent();
  setText('ach-unlocked', badgesData.filter(b => b.unlocked).length);
  setText('ach-total', badgesData.length);
  setText('ach-points', state.ecoPoints);
}

function updateGreeting() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning!' : hour < 18 ? 'Good afternoon!' : 'Good evening!';
  const greetingEl = document.querySelector('.greeting-sub');
  if (greetingEl) greetingEl.textContent = greeting;
}

function updateProfile() {
  // Ensure name and joined date in UI are updated whenever profile data changes
  if ($('profile-name-display')) $('profile-name-display').textContent = state.userName || 'User';
  if ($('user-name-home')) $('user-name-home').textContent = state.userName || 'User';
  updateGreeting();
  if ($('profile-joined')) {
    const joinedDate = getJoinedDate();
    const joinedText = formatFullDate(joinedDate);
    $('profile-joined').textContent = `🌱 Eco walker since ${joinedText}`;
  }

  const levelBadge = $('profile-level-badge');
  if (levelBadge) levelBadge.textContent = `Lv.${state.profileLevel}`;
  const profileRankEl = $('profile-rank');
  if (profileRankEl) profileRankEl.textContent = state.profileRank;
  setText('level-num', state.profileLevel);
  setText('level-current-points', state.ecoPoints + ' pts');
  setText('ps-total-steps', state.lifetimeSteps.toLocaleString());
  setText('ps-total-co2', (state.lifetimeCO2g / 1000).toFixed(1) + ' kg');
  setText('ps-total-trees', state.lifetimeTrees);
  setText('ps-streak', state.streak);
  setText('tb-streak', state.streak);

  const fill = $('level-bar-fill');
  if (fill) {
    const pct = Math.min(Math.round((state.ecoPoints / 1000) * 100), 100);
    fill.style.width = pct + '%';
  }

  const impactKm = state.profileImpactKm || Number((state.lifetimeCO2g / CO2_PER_KM_CAR_G).toFixed(2));
  const impactCO2kg = state.profileImpactCO2kg || Number((state.lifetimeCO2g / 1000).toFixed(1));
  const impactBig = $('impact-big');
  if (impactBig) impactBig.textContent = `🚗 ${impactKm} km`;
  const ecoText = $('impact-eco-text');
  if (ecoText) ecoText.textContent = `${impactCO2kg.toFixed(1)} kg`;
  updateAchievementsHeader();
}

function buildCumulStats() {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 6); // last 7 days including today
  cutoff.setHours(0, 0, 0, 0);

  const recentLogs = logData.filter(entry => {
    if (!entry || !entry.date) return false;
    const date = new Date(entry.date);
    if (Number.isNaN(date.getTime())) return false;
    return date >= cutoff;
  });

  const totalSteps = recentLogs.reduce((a, d) => a + (d.steps || 0), 0);
  const totalKm    = recentLogs.reduce((a, d) => a + (typeof d.km === 'number' ? d.km : ((d.steps || 0) * STEP_LENGTH_M / 1000)), 0);
  const totalCO2g  = recentLogs.reduce((a, d) => a + (typeof d.co2 === 'number' ? d.co2 : Math.round((d.steps || 0) * CO2_PER_STEP_G)), 0);
  const totalTrees = Math.floor(totalCO2g / CO2_PER_TREE_G);

  setText('total-steps-all', totalSteps.toLocaleString());
  setText('total-km-all',    totalKm.toFixed(2) + ' km');
  setText('total-co2-all',   (totalCO2g / 1000).toFixed(1) + ' kg');
  setText('total-trees-all', totalTrees);
}

/* ──────────────────────────────────────────────
   MAP TIMER
────────────────────────────────────────────── */
function initMapControls() {
  const startBtn = $('btn-map-start');
  const pauseBtn = $('btn-map-pause');
  const stopBtn = $('btn-map-stop');
  if (startBtn) startBtn.addEventListener('click', startMapTracking);
  if (pauseBtn) pauseBtn.addEventListener('click', pauseMapTracking);
  const coordsBtn = $('btn-show-coordinates');
  if (coordsBtn) coordsBtn.addEventListener('click', showCurrentCoordinates);
  if (stopBtn) stopBtn.addEventListener('click', stopMapTracking);
}

function showCurrentCoordinates() {
  const coordsEl = $('map-coordinates-display');
  const label = $('map-overlay-label');
  if (!coordsEl) return;

  if (state.lastPosition) {
    const lat = state.lastPosition.lat.toFixed(5);
    const lon = state.lastPosition.lon.toFixed(5);
    coordsEl.textContent = `${lat}, ${lon}`;
    coordsEl.classList.remove('hidden');

    if (label) label.textContent = '📍 ตำแหน่งปัจจุบันของคุณ';

    if (state.leafletMap) {
      state.leafletMap.setView([state.lastPosition.lat, state.lastPosition.lon], state.leafletMap.getZoom() || 15, {
        animate: true,
        duration: 0.7,
      });
    }

    showToast('Location Update📍');
  } else {
    coordsEl.classList.add('hidden');
    showToast('ยังไม่มีตำแหน่ง GPS กรุณาเริ่มติดตามก่อน');
  }
}

function startMapTracking() {
  if (state.mapRunning) return;
  state.mapRunning = true;

  // If this is a new route after stop, the map values should start from zero
  if (state.mapSeconds === 0 && state.mapDistanceM === 0) {
    state.lastPosition = null;
    resetMapView();
  }

  if (!state.tracking) startTracking();

  state.mapInterval = setInterval(() => {
    state.mapSeconds++;
    updateMapTimer();
  }, 1000);

  updateMapView();
  updateMapStats();
  showToast('🛰️ GPS tracking started!');
}

function pauseMapTracking() {
  if (!state.mapRunning) return;
  state.mapRunning = false;
  clearInterval(state.mapInterval);
  stopTracking();
  state.lastPosition = null;
  showToast('⏸ Walk paused');
}

function stopMapTracking() {
  if (!state.mapRunning && state.mapSeconds === 0 && state.mapDistanceM === 0) return;

  state.mapRunning = false;
  clearInterval(state.mapInterval);
  stopTracking();

  state.totalWalkSeconds += state.mapSeconds;
  state.lastPosition = null;
  state.mapSeconds = 0;
  state.mapDistanceM = 0;

  resetMapView();
  updateMapTimer();
  updateMapStats();
  updateDashboard();
  showToast('💾 Route saved! Great walk! 🌿');
}

function updateMapTimer() {
  const s = state.mapSeconds;
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  setText('map-time', `${mm}:${ss}`);

  const km = state.mapDistanceM / 1000;
  if (km > 0 && s > 0) {
    const paceSecPerKm = Math.round(s / km);
    const pm = Math.floor(paceSecPerKm / 60);
    const ps = paceSecPerKm % 60;
    setText('map-pace', `${pm}:${String(ps).padStart(2,'0')}`);
  } else {
    setText('map-pace', '0:00');
  }

  updateDashboard();
}

function updateMapStats() {
  const km = (state.mapDistanceM / 1000).toFixed(2);
  setText('map-km', `${km} km`);

  const co2g = Math.round((state.mapDistanceM / 1000) * CO2_PER_KM_CAR_G);
  setText('map-co2', `${co2g}g`);

  updateDashboard();
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
  $('btn-logout').addEventListener('click', async () => {
    // Save user data before logging out
    if (state.userId) {
      await saveUserData();
    }
    
    await logoutUser();
    
    setTimeout(() => {
      showLoginPage();
      state.steps = 0;
      state.mapChoice = null;
      state.mapChoiceConfirmed = false;
      state.loggedIn = false;
      state.userId = null;
      stopTracking();
      updateDashboard();
    }, 800);
  });
}

/* ──────────────────────────────────────────────
   MAIN APP INIT
────────────────────────────────────────────── */
function initApp() {
  // Always use the current state.streak from Firestore or defaults
  // Don't load from localStorage here since state.streak was just set from Firestore in loadUserData()
  updateStreak();  // Display the current user's streak
  updateGreeting();
  if (!greetingUpdateTimer) {
    greetingUpdateTimer = setInterval(updateGreeting, 60000);
  }
  updateDashboard();
  buildChallengeStrip();
  buildBadgesGrid();
  buildChallengesList();
  buildWeekChart();
  buildLogList();
  buildCumulStats();
  initMapControls();
  initMapChoice();
  initLeafletMap();
  initRoutePlannerMap();
  initRoutePlannerControls();
  initProfile();
}

function initMapChoice() {
  document.querySelectorAll('.map-choice-option').forEach(btn => {
    btn.addEventListener('click', () => selectMapChoice(btn.dataset.choice));
  });
  const confirmBtn = $('btn-confirm-map-choice');
  const cancelBtn = $('btn-cancel-map-choice');
  const calcBtn = $('btn-calc-route');
  const changeModeBtn = $('btn-change-map-mode');
  const changeModeRouteBtn = $('btn-change-map-mode-route');

  if (confirmBtn) confirmBtn.addEventListener('click', confirmMapChoice);
  if (cancelBtn) cancelBtn.addEventListener('click', () => hideMapChoiceModal());
  if (calcBtn) calcBtn.addEventListener('click', calculateRouteSavings);
  if (changeModeBtn) changeModeBtn.addEventListener('click', showMapChoiceModal);
  if (changeModeRouteBtn) changeModeRouteBtn.addEventListener('click', showMapChoiceModal);
}

function initRoutePlannerControls() {
  const startBtn = $('btn-select-route-start');
  const endBtn = $('btn-select-route-end');
  const liveWalkBtn = $('btn-start-livewalk');
  const startSelect = $('route-start-select');
  const endSelect = $('route-end-select');
  const weightInput = $('route-weight');
  const fuelPriceInput = $('route-fuel-price');
  
  if (startBtn) startBtn.addEventListener('click', () => setRoutePlannerSelection('start'));
  if (endBtn) endBtn.addEventListener('click', () => setRoutePlannerSelection('end'));
  
  // Add validation listeners
  if (startSelect) startSelect.addEventListener('change', updateStartWalkButtonState);
  if (endSelect) endSelect.addEventListener('change', updateStartWalkButtonState);
  if (weightInput) weightInput.addEventListener('change', updateStartWalkButtonState);
  if (fuelPriceInput) fuelPriceInput.addEventListener('change', updateStartWalkButtonState);
  
  if (liveWalkBtn) {
    liveWalkBtn.addEventListener('click', () => {
      state.mapChoice = 'live';
      state.mapChoiceConfirmed = true;
      switchTab('map');
    });
  }
  
  // Initial button state check
  updateStartWalkButtonState();
}

function updateStartWalkButtonState() {
  const liveWalkBtn = $('btn-start-livewalk');
  const startSelect = $('route-start-select');
  const endSelect = $('route-end-select');
  const weightInput = $('route-weight');
  
  if (!liveWalkBtn) return;
  
  // Check if all required fields are filled
  const startValue = startSelect?.value?.trim() || '';
  const endValue = endSelect?.value?.trim() || '';
  const weightValue = weightInput?.value?.trim() || '';
  
  const isValid = startValue && endValue && weightValue;
  
  if (isValid) {
    liveWalkBtn.disabled = false;
    liveWalkBtn.style.opacity = '1';
    liveWalkBtn.style.cursor = 'pointer';
  } else {
    liveWalkBtn.disabled = true;
    liveWalkBtn.style.opacity = '0.6';
    liveWalkBtn.style.cursor = 'not-allowed';
    // Hide button if selections are incomplete (force recalculation)
    liveWalkBtn.classList.add('hidden');
  }
}

async function calculateRouteSavings() {
  const start = $('route-start').value.trim();
  const end = $('route-end').value.trim();
  const weight = Number($('route-weight').value) || 60;
  const fuelPrice = Number($('route-fuel-price').value) || 42;
  const result = $('route-result');
  const resultText = $('route-result-text');

  if (!start || !end) {
    showToast('กรุณาเลือกจุด A และ B จากแผนที่หรือรายการสถานที่');
    return;
  }

  let distanceKm = 0;
  let durationMin = 0;
  let displayStart = start;
  let displayEnd = end;

  if (state.routePlannerStartCoords && state.routePlannerEndCoords) {
    displayStart = state.routePlannerStartLabel || `A @ ${state.routePlannerStartCoords.lat.toFixed(5)}, ${state.routePlannerStartCoords.lng.toFixed(5)}`;
    displayEnd = state.routePlannerEndLabel || `B @ ${state.routePlannerEndCoords.lat.toFixed(5)}, ${state.routePlannerEndCoords.lng.toFixed(5)}`;
    try {
      const route = await requestWalkingRoute(state.routePlannerStartCoords, state.routePlannerEndCoords);
      distanceKm = route.distanceKm;
      durationMin = route.durationMin;
    } catch (error) {
      distanceKm = getDistanceKm(
        state.routePlannerStartCoords.lat,
        state.routePlannerStartCoords.lng,
        state.routePlannerEndCoords.lat,
        state.routePlannerEndCoords.lng
      );
      showToast('ไม่สามารถค้นหาเส้นทางเดินบนถนนได้ ใช้ระยะทางตรงแทน');
    }
  } else {
    try {
      const route = await requestWalkingRoute(start, end);
      distanceKm = route.distanceKm;
      durationMin = route.durationMin;
      displayStart = start;
      displayEnd = end;
    } catch (error) {
      const startCoords = parseLatLng(start);
      const endCoords = parseLatLng(end);
      if (startCoords && endCoords) {
        distanceKm = getDistanceKm(startCoords[0], startCoords[1], endCoords[0], endCoords[1]);
        durationMin = Math.max(10, Math.round(distanceKm * 12));
      }
    }
  }

  if (!distanceKm || distanceKm <= 0) {
    showToast('กรุณาเลือกจุด A และ B ที่อยู่ภายในแผนที่');
    return;
  }

  const walkingCalories = Math.round((weight * 0.035 + (distanceKm * 0.029) * weight) * 60 * 0.5);
  const savedFuel = Number((distanceKm * 0.12).toFixed(2));
  // E = AD * EF, where AD is distance km and EF is emission factor g CO2e per km
  const baselineKgCO2 = distanceKm * (EMISSION_FACTOR_VEHICLE_G_PER_KM / 1000);
  const savedTCO2 = toTonne(baselineKgCO2);
  const savedCO2Label = formatCO2ForDisplay(baselineKgCO2);
  const savedMoney = (savedFuel * fuelPrice).toFixed(0);

  if (result && resultText) {
    result.classList.remove('hidden');
    resultText.innerHTML = `
      <div class="route-result-summary">
        <div class="result-route-label">เส้นทาง</div>
        <div class="result-route-text">${displayStart} → ${displayEnd}</div>
      </div>
      <div class="route-result-grid">
        <div class="route-result-card">
          <span>📏 ระยะทาง</span>
          <strong>${distanceKm.toFixed(1)} กม.</strong>
        </div>
        <div class="route-result-card">
          <span>⏱️ เวลาเดิน</span>
          <strong>${durationMin} นาที</strong>
        </div>
        <div class="route-result-card">
          <span>⛽ ประหยัดน้ำมัน</span>
          <strong>${savedFuel} ลิตร</strong>
        </div>
        <div class="route-result-card">
          <span>🌍 ลด CO₂</span>
          <strong>${savedCO2Label}</strong>
        </div>
        <div class="route-result-card route-result-card-accent">
          <span>💰 ประหยัดเงิน</span>
          <strong>${savedMoney} บาท</strong>
        </div>
        <div class="route-result-card route-result-card-accent">
          <span>🔥 เผาผลาญ</span>
          <strong>${walkingCalories} kcal</strong>
        </div>
      </div>
    `;
    
    // Show the start walk button
    const liveWalkBtn = $('btn-start-livewalk');
    if (liveWalkBtn) liveWalkBtn.classList.remove('hidden');
  }
}

/* ──────────────────────────────────────────────
   BOOT
────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  injectSVGDefs();
  initLogin();
  initSignup();
  initTabs();
  
  // Initialize with all 12 badges (unlocked: false)
  addBadgesToCollection([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

  // Map choice modal: ensure new stairs button works
  const btnStairsMode = $('btn-change-map-mode-stairs');
  if (btnStairsMode) btnStairsMode.addEventListener('click', showMapChoiceModal);

  // Stairs calculator
  const btnCalcStairs = $('btn-calc-stairs');
  if (btnCalcStairs) btnCalcStairs.addEventListener('click', calculateStairs);
});






// ===== MODE SELECTION =====
var currentMode = 'walk';

function selectMode(mode) {
  currentMode = mode;
  document.getElementById('card-walk').classList.toggle('selected', mode === 'walk');
  document.getElementById('card-route').classList.toggle('selected', mode === 'route');
}

function confirmMode() {
  document.getElementById('sec-modal').classList.remove('active');
  if (currentMode === 'route') {
    document.getElementById('sec-route').classList.add('active');
  } else {
    document.getElementById('sec-walk').classList.add('active');
  }
}

function goBack() {
  document.getElementById('sec-walk').classList.remove('active');
  document.getElementById('sec-route').classList.remove('active');
  document.getElementById('sec-modal').classList.add('active');
  document.getElementById('route-results').style.display = 'none';
}

// ===== ROUTE CALCULATION =====
function calcRoute() {
  var ptA = document.getElementById('ptA').value.trim();
  var ptB = document.getElementById('ptB').value.trim();

  if (!ptA || !ptB) {
    alert('กรุณาระบุจุด A และจุด B');
    return;
  }

  var weight   = parseFloat(document.getElementById('rw').value) || 60;
  var fuelPrice = parseFloat(document.getElementById('fp').value) || 42;

  // Pseudo-random distance based on input string length (for demo)
  var seed = (ptA.length * 11 + ptB.length * 17) % 20;
  var distKm = parseFloat(((seed + 4) * 0.14 + 0.6).toFixed(2));

  var steps      = Math.round(distKm * 1312);          // ~1312 steps/km average
  var minutesWalk = Math.round(distKm * 13);            // ~13 min/km walking pace
  var calories   = Math.round(weight * 0.0005 * steps); // MET-based estimate
  var co2g       = Math.round(distKm * 150);            // ~150g CO2/km for motorcycle
  var fuelLiters = parseFloat((distKm / 35).toFixed(3)); // ~35 km/L motorcycle
  var saveBaht   = parseFloat((fuelLiters * fuelPrice).toFixed(2));
  var saveMonth  = parseFloat((saveBaht * 22).toFixed(2));

  // Update UI
  document.getElementById('r-dist').textContent  = distKm + ' km';
  document.getElementById('r-steps').textContent = steps.toLocaleString() + ' ก้าว';
  document.getElementById('r-time').textContent  = minutesWalk + ' นาที';
  document.getElementById('r-cal').textContent   = calories + ' kcal';
  document.getElementById('r-co2').textContent   = co2g + ' g';
  document.getElementById('r-fuel').textContent  = fuelLiters + ' L';
  document.getElementById('r-baht').textContent  = saveBaht + ' บาท';
  document.getElementById('r-bmonth').textContent = saveMonth + ' บาท';

  document.getElementById('route-sum').innerHTML =
    '🗺️ <strong>' + ptA + '</strong> → <strong>' + ptB + '</strong>' +
    ' &nbsp;|&nbsp; ระยะทาง ' + distKm + ' km' +
    ' &nbsp;·&nbsp; เดิน ' + minutesWalk + ' นาที' +
    ' &nbsp;·&nbsp; ประหยัด ' + saveBaht + ' บาท/เที่ยว';

  var resultsEl = document.getElementById('route-results');
  resultsEl.style.display = 'block';
  resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ===== STAIRS CALCULATOR =====
function calculateStairs() {
  var weight = parseFloat(document.getElementById('weight')?.value) || 60;
  var floorsUp = parseFloat(document.getElementById('floorsUp')?.value) || 0;
  var floorsDown = parseFloat(document.getElementById('floorsDown')?.value) || 0;
  var trips = parseFloat(document.getElementById('trips')?.value) || 1;
  var liftKwh = parseFloat(document.getElementById('liftType')?.value) || 2.5;
  var rate = parseFloat(document.getElementById('elecRate')?.value) || 4.5;

  var calUp = weight * 0.17 * floorsUp * trips;
  var calDown = weight * 0.085 * floorsDown * trips;
  var totalCal = Math.round(calUp + calDown);

  var kwhDay = parseFloat((liftKwh * trips).toFixed(2));
  var bahtDay = parseFloat((kwhDay * rate).toFixed(2));

  // Baseline emissions for lift use (grid electricity). Project emissions for stair use are assumed to be zero.
  var baselineKgCO2 = kwhDay * EMISSION_FACTOR_GRID_KG_PER_KWH;
  var savedKgCO2 = baselineKgCO2;
  var savedTCO2 = toTonne(baselineKgCO2);

  document.getElementById('res-cal').textContent = totalCal.toLocaleString() + ' kcal';
  document.getElementById('res-kwh').textContent = kwhDay + ' หน่วย';
  document.getElementById('res-baht').textContent = bahtDay.toFixed(2) + ' บาท';
  document.getElementById('res-co2').textContent = savedTCO2.toFixed(4) + ' tCO₂e';

  var kwhMonth = parseFloat((kwhDay * 22).toFixed(1));
  var bahtMonth = parseFloat((bahtDay * 22).toFixed(2));
  var calMonth = totalCal * 22;
  var co2MonthKg = baselineKgCO2 * 22;
  var co2MonthT = toTonne(co2MonthKg);

  document.getElementById('e-day').textContent = kwhDay + ' kWh';
  document.getElementById('e-month').textContent = kwhMonth + ' kWh';
  document.getElementById('e-bday').textContent = bahtDay.toFixed(2) + ' บาท';
  document.getElementById('e-bmonth').textContent = bahtMonth.toFixed(2) + ' บาท';

  var bannerEl = document.getElementById('monthly-banner');
  if (bannerEl) {
    document.getElementById('monthly-text').innerHTML =
      '📊 ใน 1 เดือน (22 วันทำการ): เผาผลาญ <strong>' + calMonth.toLocaleString() + ' kcal</strong>' +
      ' &nbsp;·&nbsp; ประหยัดไฟ <strong>' + kwhMonth + ' หน่วย</strong>' +
      ' &nbsp;·&nbsp; ประหยัดเงิน <strong>' + bahtMonth.toFixed(2) + ' บาท</strong>' +
      ' &nbsp;·&nbsp; ลด CO₂ <strong>' + co2MonthT.toFixed(3) + ' tCO₂e</strong>';
    bannerEl.style.display = 'block';
  }

  var elecEl = document.getElementById('elec-detail');
  if (elecEl) elecEl.style.display = 'block';

  // Animate stat cards
  document.querySelectorAll('#tab-stairs .stat-card').forEach(function(card, i) {
    card.style.animation = 'none';
    setTimeout(function() {
      card.style.animation = 'popIn 0.3s ease ' + (i * 0.06) + 's both';
    }, 10);
  });

  // inject keyframes once
  if (!document.getElementById('stairs-keyframes')) {
    var styleEl = document.createElement('style');
    styleEl.id = 'stairs-keyframes';
    styleEl.textContent = '@keyframes popIn { from { transform: scale(0.95) translateY(4px); opacity: 0.6; } to { transform: scale(1) translateY(0); opacity: 1; } }';
    document.head.appendChild(styleEl);
  }
}