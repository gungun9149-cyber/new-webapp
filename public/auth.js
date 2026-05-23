/* ═══════════════════════════════════════════════════════
   Firebase Authentication & Firestore Integration
   ═══════════════════════════════════════════════════════ */

let db = null;
let auth = null;
let currentUser = null;
let isCreatingNewUser = false;

function isPermissionError(err) {
  if (!err) return false;
  const code = (err.code || '').toString();
  const msg = (err.message || '').toString().toLowerCase();
  return code === 'permission-denied' || msg.includes('insufficient permissions') || msg.includes('missing or insufficient');
}

// --------------------
// LocalStorage fallback
// --------------------
function _localKey(uid) {
  return `cw-local-${uid || 'guest'}`;
}

function localSaveUserData(uid, data) {
  try {
    const key = _localKey(uid);
    const payload = Object.assign({}, data, { savedAt: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(payload));
    console.log('✅ Saved user data to localStorage for', uid);
    return true;
  } catch (e) {
    console.warn('localSaveUserData failed', e);
    return false;
  }
}

function localLoadUserData(uid) {
  try {
    const key = _localKey(uid);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('localLoadUserData failed', e);
    return null;
  }
}

function localSaveUserLog(uid, entry) {
  try {
    const key = `${_localKey(uid)}-logs`;
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    const id = `local-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const copy = Object.assign({}, entry, { id, createdAt: new Date().toISOString() });
    arr.unshift(copy);
    localStorage.setItem(key, JSON.stringify(arr));
    console.log('✅ Saved user log locally for', uid, id);
    return id;
  } catch (e) {
    console.warn('localSaveUserLog failed', e);
    throw e;
  }
}

function localLoadUserLogs(uid) {
  try {
    const key = `${_localKey(uid)}-logs`;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.warn('localLoadUserLogs failed', e);
    return [];
  }
}

// Wait for Firebase to be initialized
function initFirebaseWhenReady() {
  const maxAttempts = 50;
  let attempts = 0;

  const checkFirebase = () => {
    attempts++;
    if (window.firebaseAuth && window.firebaseDb) {
      auth = window.firebaseAuth;
      db = window.firebaseDb;
      setupAuthListener();
      console.log('✅ Firebase ready');
    } else if (attempts < maxAttempts) {
      setTimeout(checkFirebase, 100);
    } else {
      console.error('❌ Firebase initialization timeout');
      showToast('⚠️ Unable to connect to server. Please refresh the page.');
    }
  };

  checkFirebase();
}

// Setup auth state listener
async function ensureUserToken(user) {
  if (user && typeof user.getIdToken === 'function') {
    try {
      await user.getIdToken(true);
      return true;
    } catch (e) {
      console.warn('Could not refresh auth token:', e);
    }
  }
  return false;
}

async function setupAuthListener() {
  try {
    const { onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
    onAuthStateChanged(auth, async (user) => {
      currentUser = user;
      if (user) {
        console.log('👤 User logged in:', user.email);
        try {
          await ensureUserToken(user);
          const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (!userDoc.exists()) {
            console.log('Auth state change detected but missing Firestore user document for:', user.uid);
            await ensureUserDoc(user);
            const recreatedDoc = await getDoc(doc(db, 'users', user.uid));
            if (!recreatedDoc.exists()) {
              console.warn('Could not create missing Firestore user document for:', user.uid);
              await logoutUser();
              showToast('❌ บัญชีนี้ยังไม่ได้ลงทะเบียนในระบบ');
              showLoginPage();
              return;
            }
          }
        } catch (e) {
          if (isPermissionError(e)) {
            console.warn('Firestore permission check failed during auth listener:', e.message || e);
          } else {
            console.error('Error checking user document during auth listener:', e);
          }
        }

        await loadUserData(user.uid);
        showApp();
      } else {
        console.log('👤 User logged out');
        // Save state if possible when auth changes to null
        try { if (typeof saveUserData === 'function') await saveUserData(); } catch (e) { console.warn('saveUserData on sign-out failed', e); }
        showLoginPage();
      }
    });

    // Save user data when the page is hidden or before unload to reduce data loss
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && typeof saveUserData === 'function') {
        try { saveUserData().catch(() => {}); } catch (e) {}
      }
    });
    window.addEventListener('beforeunload', () => {
      if (typeof saveUserData === 'function') {
        try { saveUserData(); } catch (e) {}
      }
    });
  } catch (error) {
    console.error('Auth setup error:', error);
  }
}

function getLocalDateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function syncStreakFromFirestore(userId, userData) {
  try {
    const lastWalkSource = userData.lastWalkDate || userData.lastStreakDate || userData.lastActiveDate || null;
    let lastWalkDate = null;

    if (lastWalkSource && typeof lastWalkSource.toDate === 'function') {
      lastWalkDate = getLocalDateString(lastWalkSource.toDate());
    } else if (lastWalkSource instanceof Date) {
      lastWalkDate = getLocalDateString(lastWalkSource);
    } else if (typeof lastWalkSource === 'string') {
      lastWalkDate = lastWalkSource;
    }

    const today = getLocalDateString();
    const yesterday = getLocalDateString(new Date(Date.now() - 86400000));

    if (lastWalkDate === today || lastWalkDate === yesterday) {
      state.streak = Number.isFinite(userData.streak) ? userData.streak : 0;
    } else {
      state.streak = 0;
    }
    state.lastWalkDate = lastWalkDate;
  } catch (e) {
    console.error('syncStreakFromFirestore error:', e);
  }
}

async function updateStreakAfterWalk() {
  if (!currentUser) return;
  try {
    const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
    const today = getLocalDateString();
    const yesterday = getLocalDateString(new Date(Date.now() - 86400000));
    const lastWalk = state.lastWalkDate;
    let streak = Number.isFinite(state.streak) ? state.streak : 0;

    if (lastWalk === today) {
      // already counted for today
    } else if (lastWalk === yesterday) {
      streak = Math.max(streak, 0) + 1;
    } else {
      streak = 1;
    }

    state.streak = streak;
    state.lastWalkDate = today;

    const docRef = doc(db, 'users', currentUser.uid);
    await updateDoc(docRef, {
      streak: streak,
      lastWalkDate: today,
      lastStreakDate: today,
      lastUpdated: serverTimestamp()
    });
  } catch (e) {
    console.error('updateStreakAfterWalk error:', e);
  }
}

// User Registration
async function registerUser(email, password, displayName) {
  const btn = document.getElementById('btn-signup');
  if (btn) {
    btn.textContent = '🌱 Creating account…';
    btn.disabled = true;
  }

  try {
    isCreatingNewUser = true;
    const { createUserWithEmailAndPassword, updateProfile } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
    const { doc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    await updateProfile(user, {
      displayName: displayName
    });

    // Ensure auth user is refreshed so displayName is available immediately
    try {
      if (user.reload) await user.reload();
      currentUser = auth.currentUser || user;
      const actualName = currentUser?.displayName || displayName;
      state.userName = actualName;
      if (typeof window.updateProfile === 'function') window.updateProfile();
    } catch (e) {
      console.warn('Could not reload user after updateProfile', e);
    }

    try {
      await ensureUserToken(currentUser);
    } catch (e) {
      console.warn('Could not refresh token after registration:', e);
    }

    await setDoc(doc(db, 'users', user.uid), {
      email: user.email,
      displayName: displayName,
      createdAt: currentUser?.metadata?.creationTime || serverTimestamp(),
      joinedAt: currentUser?.metadata?.creationTime || serverTimestamp(),
      steps: 0,
      dailyGoal: 5000,
      lifetimeSteps: 0,
      lifetimeCO2g: 0,
      lifetimeTrees: 0,
      ecoPoints: 0,
      profileLevel: 1,
      profileRank: 'Eco Seedling',
      profileImpactKm: 0,
      profileImpactCO2kg: 0,
      lastActiveDate: new Date().toISOString().slice(0, 10),
      lastStreakDate: getLocalDateString(),
      streak: 1
    });
    // update UI state with the new display name
    try {
      state.userName = displayName;
      if (typeof window.updateProfile === 'function') window.updateProfile();
    } catch (e) { console.warn('Could not update UI profile after register', e); }

    showToast(`🎉 Welcome ${displayName}! Account created successfully!`);
    return user;
  } catch (error) {
    console.error('Registration error:', error);
    const errorMsg = getAuthErrorMessage(error.code);
    showToast(`❌ ${errorMsg}`);
    throw error;
  } finally {
    isCreatingNewUser = false;
    if (btn) {
      btn.textContent = 'Create Account 🚀';
      btn.disabled = false;
    }
  }
}

// Ensure a Firestore user document exists for the authenticated user
async function ensureUserDoc(user) {
  try {
    const { doc, getDoc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'Walker');
      await setDoc(ref, {
        email: user.email || null,
        displayName: displayName,
        createdAt: user.metadata?.creationTime || serverTimestamp(),
        joinedAt: user.metadata?.creationTime || serverTimestamp(),
        steps: 0,
        todayDate: getLocalDateString(),
        todaySteps: 0,
        todayKm: 0,
        todayCalories: 0,
        todayMinutes: 0,
        todayCO2g: 0,
        todayTrees: 0,
        dailyGoal: 5000,
        lifetimeSteps: 0,
        lifetimeCO2g: 0,
        lifetimeTrees: 0,
        streak: 0,
        lastWalkDate: getLocalDateString(),
        ecoPoints: 0,
        profileLevel: 1,
        profileRank: 'Eco Seedling',
        profileImpactKm: 0,
        profileImpactCO2kg: 0,
        activeChallenges: [
          { icon: '🚶', name: 'Daily 10K',    desc: 'Walk 10,000 steps today', unit: 'steps',  target: 10000, pts: 100 },
          { icon: '🌍', name: 'Carbon Buster', desc: 'Save 500g of CO₂ today', unit: 'co2g',   target: 500,   pts: 80  },
          { icon: '📏', name: 'Five KM Club', desc: 'Walk 5 km without stopping', unit: 'distance', target: 5,    pts: 120 },
          { icon: '🔥', name: 'Streak Week',  desc: 'Walk 7 days in a row', unit: 'streak', target: 7, pts: 200 },
          { icon: '🌱', name: 'Green Seed',   desc: 'Grow your first virtual tree', unit: 'co2g', target: CO2_PER_TREE_G, pts: 150 },
        ],
        challengeWeekStart: getLocalDateString(),
        badgesData: [],
        lastActiveDate: getLocalDateString(),
      });
      console.log('✅ Created user document for', user.uid);
    }
  } catch (e) {
    if (isPermissionError(e)) {
      console.warn('ensureUserDoc skipped due to insufficient Firestore permissions:', e && e.message ? e.message : e);
      return;
    }
    console.error('ensureUserDoc error:', e);
    throw e;
  }
}

// User Login
async function loginUser(email, password) {
  const btn = document.getElementById('btn-login');
  if (btn) {
    btn.textContent = '🌿 Logging in…';
    btn.disabled = true;
  }

  try {
    if (!auth) {
      throw new Error('Firebase auth is not ready yet. Refresh the page and try again.');
    }
    if (!email || !password) {
      throw new Error('Please enter both email and password.');
    }

    const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    if (user.reload) {
      await user.reload();
    }

    currentUser = auth.currentUser || user;

    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
    await ensureUserToken(currentUser);
    let userDoc = await getDoc(doc(db, 'users', currentUser.uid));
    if (!userDoc.exists()) {
      console.log('Login detected auth-only account without Firestore user doc, creating it now for:', currentUser.uid);
      await ensureUserDoc(currentUser);
      userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (!userDoc.exists()) {
        await logoutUser();
        throw new Error('ไม่พบบัญชีในระบบ กรุณาสมัครสมาชิกก่อนเข้าสู่ระบบ');
      }
    }

    const displayName = currentUser?.displayName || email.split('@')[0];
    try {
      state.userName = displayName;
      if (typeof window.updateProfile === 'function') window.updateProfile();
    } catch (e) {
      console.warn('Could not update UI profile after login', e);
    }

    showToast(`🌱 Welcome back, ${displayName}!`);

    // Fallback UI update if auth listener does not immediately show the app
    try {
      await loadUserData(currentUser.uid);
      if (typeof window.showApp === 'function') {
        window.showApp();
      }
    } catch (e) {
      console.warn('Fallback showApp after login failed', e);
    }

    return currentUser;
  } catch (error) {
    console.error('Login error:', error);
    const errorMsg = getAuthErrorMessage(error.code) || error.message;
    showToast(`❌ ${errorMsg}`);
    throw error;
  } finally {
    if (btn) {
      btn.textContent = "Let's Walk! 🚀";
      btn.disabled = false;
    }
  }
}

// Logout
async function logoutUser() {
  try {
    const { signOut } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
    await signOut(auth);
    showToast('👋 Logged out successfully');
    currentUser = null;
  } catch (error) {
    console.error('Logout error:', error);
    showToast('❌ Error logging out');
  }
}

// Password reset (send reset email)
async function sendPasswordReset(email) {
  try {
    if (!email) throw new Error('Please provide an email address');
    const { sendPasswordResetEmail } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
    await sendPasswordResetEmail(auth, email);
    showToast('✅ Password reset email sent. Check your inbox.');
    return true;
  } catch (error) {
    console.error('Password reset error:', error);
    const errorMsg = getAuthErrorMessage(error.code || '');
    showToast(`❌ ${errorMsg}`);
    throw error;
  }
}

function normalizeBadgesData(savedBadges) {
  return allBadgesAvailable.map(defaultBadge => {
    const saved = Array.isArray(savedBadges)
      ? savedBadges.find(b => b.name === defaultBadge.name)
      : null;
    return {
      ...defaultBadge,
      unlocked: !!saved?.unlocked
    };
  });
}

// Load user data from Firestore
async function loadUserData(userId) {
  try {
    // ensure logs loader exists below
  } catch (e) {
    console.error(e);
  }
  
  try {
    const { doc, getDoc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
    
    const docSnap = await getDoc(doc(db, 'users', userId));
    
    if (docSnap.exists()) {
      const userData = docSnap.data();
      let joinedDate = currentUser?.metadata?.creationTime || userData.createdAt || userData.joinedAt;
      if (joinedDate && joinedDate.toDate) {
        joinedDate = joinedDate.toDate();
      }
      if (typeof joinedDate === 'string' || typeof joinedDate === 'number') {
        joinedDate = new Date(joinedDate);
      }
      if (!(joinedDate instanceof Date) || Number.isNaN(joinedDate.getTime())) {
        joinedDate = new Date();
      }

      const emailPrefix = currentUser?.email?.split('@')[0] || 'Walker';
      const fullName = currentUser?.displayName || userData.displayName || emailPrefix;
      const authCreated = currentUser?.metadata?.creationTime || userData.createdAt || userData.joinedAt;
      const joinedAt = authCreated && authCreated.toDate ? authCreated.toDate() : new Date(authCreated || Date.now());
      const createdAtNormalized = joinedAt;
      const needsFix = !userData.createdAt || !userData.joinedAt;
      if (needsFix) {
        try {
          await updateDoc(doc(db, 'users', userId), {
            createdAt: createdAtNormalized,
            joinedAt: createdAtNormalized,
            lastUpdated: serverTimestamp()
          });
        } catch (e) {
          console.warn('Could not persist createdAt/joinedAt for user:', userId, e);
        }
      }

      const today = getLocalDateString();
      const sameDay = userData.todayDate === today;
      const todayValues = {
        dailyDate: today,
        todaySteps: sameDay ? (userData.todaySteps || userData.steps || 0) : 0,
        todayKm: sameDay ? (userData.todayKm || 0) : 0,
        todayCalories: sameDay ? (userData.todayCalories || 0) : 0,
        todayMinutes: sameDay ? (userData.todayMinutes || 0) : 0,
        todayCO2g: sameDay ? (userData.todayCO2g || 0) : 0,
        todayTrees: sameDay ? (userData.todayTrees || 0) : 0,
        steps: sameDay ? (userData.todaySteps || userData.steps || 0) : 0,
      };

      const hasSavedChallenges = Array.isArray(userData.activeChallenges) && userData.activeChallenges.length > 0;
      const activeChallenges = hasSavedChallenges ? userData.activeChallenges : [
        { icon: '🚶', name: 'Daily 10K',    desc: 'Walk 10,000 steps today', unit: 'steps',  target: 10000, pts: 100 },
        { icon: '🌍', name: 'Carbon Buster', desc: 'Save 500g of CO₂ today', unit: 'co2g',   target: 500,   pts: 80  },
        { icon: '📏', name: 'Five KM Club', desc: 'Walk 5 km without stopping', unit: 'distance', target: 5,    pts: 120 },
        { icon: '🔥', name: 'Streak Week',  desc: 'Walk 7 days in a row', unit: 'streak', target: 7, pts: 200 },
        { icon: '🌱', name: 'Green Seed',   desc: 'Grow your first virtual tree', unit: 'co2g', target: CO2_PER_TREE_G, pts: 150 },
      ];

      let challengeWeekStart = userData.challengeWeekStart || today;
      const weekStart = new Date(challengeWeekStart);
      const weekDaysDiff = Number.isNaN(weekStart.getTime()) ? 999 : Math.floor((new Date(today) - weekStart) / 86400000);
      const weekExpired = weekDaysDiff >= 7 || !userData.challengeWeekStart;
      if (weekExpired) {
        challengeWeekStart = today;
      }

      Object.assign(state, {
        userId: userId,
        userName: fullName,
        joinedAt: joinedAt,
        dailyGoal: userData.dailyGoal || 5000,
        lifetimeSteps: userData.lifetimeSteps || 0,
        lifetimeCO2g: userData.lifetimeCO2g || 0,
        lifetimeTrees: userData.lifetimeTrees || 0,
        streak: userData.streak || 0,
        ecoPoints: userData.ecoPoints || 0,
        profileLevel: userData.profileLevel || 1,
        profileRank: userData.profileRank || 'Eco Seedling',
        profileImpactKm: userData.profileImpactKm || 0,
        profileImpactCO2kg: userData.profileImpactCO2kg || 0,
        activeChallenges,
        challengeWeekStart,
        ...todayValues
      });

      if (typeof challengesData !== 'undefined') {
        challengesData = activeChallenges;
      }
      if (typeof badgesData !== 'undefined') {
        badgesData = normalizeBadgesData(userData.badgesData);
        if (typeof ensureAllBadgesPresent === 'function') ensureAllBadgesPresent();
        if (typeof buildBadgesGrid === 'function') buildBadgesGrid();
        if (typeof updateAchievementsHeader === 'function') updateAchievementsHeader();
      }

      await syncStreakFromFirestore(userId, userData);

      if (!sameDay || weekExpired) {
        const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
        const docRef = doc(db, 'users', userId);
        const updatePayload = {
          todayDate: today,
          todaySteps: state.todaySteps,
          todayKm: state.todayKm,
          todayCalories: state.todayCalories,
          todayMinutes: state.todayMinutes,
          todayCO2g: state.todayCO2g,
          todayTrees: state.todayTrees,
          streak: state.streak,
          lastWalkDate: state.lastWalkDate || null,
          lastStreakDate: state.lastStreakDate || null,
          activeChallenges,
          challengeWeekStart,
          badgesData: badgesData,
          lastUpdated: serverTimestamp()
        };
        await updateDoc(docRef, updatePayload);
      }

      console.log('✅ User data loaded:', userData);

      // Load per-user logs (if UI exposes setter)
      if (typeof loadUserLogs === 'function') {
        try { await loadUserLogs(userId); } catch (e) { console.error('loadUserLogs failed', e); }
      }
    } else {
      // Document doesn't exist - initialize with defaults and userId
      const emailPrefix = currentUser?.email?.split('@')[0] || 'Walker';
      const fullName = currentUser?.displayName || emailPrefix;
      
      const today = getLocalDateString();
      const defaultChallenges = [
        { icon: '🚶', name: 'Daily 10K',    desc: 'Walk 10,000 steps today', unit: 'steps',  target: 10000, pts: 100 },
        { icon: '🌍', name: 'Carbon Buster', desc: 'Save 500g of CO₂ today', unit: 'co2g',   target: 500,   pts: 80  },
        { icon: '📏', name: 'Five KM Club', desc: 'Walk 5 km without stopping', unit: 'distance', target: 5,    pts: 120 },
        { icon: '🔥', name: 'Streak Week',  desc: 'Walk 7 days in a row', unit: 'streak', target: 7, pts: 200 },
        { icon: '🌱', name: 'Green Seed',   desc: 'Grow your first virtual tree', unit: 'co2g', target: CO2_PER_TREE_G, pts: 150 },
      ];

      Object.assign(state, {
        userId: userId,
        userName: fullName,
        joinedAt: new Date(),
        steps: 0,
        dailyGoal: 5000,
        lifetimeSteps: 0,
        lifetimeCO2g: 0,
        lifetimeTrees: 0,
        streak: 0,
        ecoPoints: 0,
        profileLevel: 1,
        profileRank: 'Eco Seedling',
        profileImpactKm: 0,
        profileImpactCO2kg: 0,
        dailyDate: today,
        todayKm: 0,
        todayCalories: 0,
        todayMinutes: 0,
        todayCO2g: 0,
        todayTrees: 0,
        activeChallenges: defaultChallenges,
        challengeWeekStart: today
      });
      if (typeof challengesData !== 'undefined') {
        challengesData = defaultChallenges;
      }
      if (typeof badgesData !== 'undefined') {
        badgesData = [];
      }
      
      console.warn('⚠️ Firestore document does not exist for user, using defaults for:', userId);
    }
  } catch (error) {
    if (isPermissionError(error)) {
      console.warn('Error loading user data: insufficient Firestore permissions — attempting local fallback');
      const local = localLoadUserData(userId);
      if (local) {
        try {
          // apply local data into state (only safe fields)
          Object.assign(state, {
            userId: userId,
            userName: local.userName || local.displayName || currentUser?.displayName,
            joinedAt: local.joinedAt ? new Date(local.joinedAt) : (state.joinedAt || new Date()),
            dailyGoal: local.dailyGoal || state.dailyGoal,
            lifetimeSteps: local.lifetimeSteps || state.lifetimeSteps,
            lifetimeCO2g: local.lifetimeCO2g || state.lifetimeCO2g,
            lifetimeTrees: local.lifetimeTrees || state.lifetimeTrees,
            streak: local.streak || state.streak,
            ecoPoints: local.ecoPoints || state.ecoPoints,
            profileLevel: local.profileLevel || state.profileLevel,
            profileRank: local.profileRank || state.profileRank,
            profileImpactKm: local.profileImpactKm || state.profileImpactKm,
            profileImpactCO2kg: local.profileImpactCO2kg || state.profileImpactCO2kg,
            activeChallenges: Array.isArray(local.activeChallenges) ? local.activeChallenges : state.activeChallenges,
            challengeWeekStart: local.challengeWeekStart || state.challengeWeekStart,
            todayKm: local.todayKm || state.todayKm,
            todayCalories: local.todayCalories || state.todayCalories,
            todayMinutes: local.todayMinutes || state.todayMinutes,
            todayCO2g: local.todayCO2g || state.todayCO2g,
            todayTrees: local.todayTrees || state.todayTrees,
          });
          if (Array.isArray(local.badgesData)) {
            badgesData = normalizeBadgesData(local.badgesData);
            if (typeof ensureAllBadgesPresent === 'function') ensureAllBadgesPresent();
            if (typeof buildBadgesGrid === 'function') buildBadgesGrid();
            if (typeof updateAchievementsHeader === 'function') updateAchievementsHeader();
          }
          console.log('✅ Loaded user data from localStorage for', userId);
          // load local logs too
          if (typeof loadUserLogs === 'function') {
            try { await loadUserLogs(userId); } catch (e) { console.warn('local loadUserLogs failed', e); }
          }
          return;
        } catch (le) {
          console.warn('Applying local user data failed', le);
        }
      }
      console.warn('No local user data found; initializing defaults');
    } else {
      console.error('Error loading user data:', error);
    }
    // Even on error, ensure userId is set so the app knows which user is logged in
    const emailPrefix = currentUser?.email?.split('@')[0] || 'Walker';
    const fullName = currentUser?.displayName || emailPrefix;
    
    Object.assign(state, {
      userId: userId,
      userName: fullName,
      streak: 0
    });
    console.warn('⚠️ Error loading user data, initialized with defaults for:', userId);
  }
}

// Load user-specific logs/history from Firestore (users/{uid}/logs)
async function loadUserLogs(userId) {
  try {
    const { collection, getDocs, query, orderBy } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
    const q = query(collection(db, 'users', userId, 'logs'), orderBy('date', 'desc'));
    const snap = await getDocs(q);

    const STEP_LENGTH_M = 0.762;
    const CO2_PER_KM_G = 150;
    const CO2_PER_STEP_G = (STEP_LENGTH_M / 1000) * CO2_PER_KM_G;

    const logs = snap.docs.map(d => {
      const data = d.data();
      let date = data.date || data.createdAt || new Date();
      if (date && date.toDate) date = date.toDate();
      date = new Date(date);
      const day = String(date.getDate()).padStart(2, '0');
      const month = date.toLocaleString('default', { month: 'short' });
      const steps = data.steps || 0;
      const km = data.km != null ? data.km : Number((steps * STEP_LENGTH_M / 1000).toFixed(2));
      const co2 = data.co2 != null ? data.co2 : Math.round(steps * CO2_PER_STEP_G);

      return {
        id: d.id,
        day,
        month,
        steps,
        km,
        co2,
        emoji: data.emoji || '🚶',
        date: date.toISOString()
      };
    });

    if (window.setLogData) window.setLogData(logs);
  } catch (e) {
    if (isPermissionError(e)) {
      console.warn('Permission denied loading logs — using local logs fallback');
      const local = localLoadUserLogs(userId);
      if (window.setLogData) window.setLogData(local.map(d => ({ id: d.id, day: d.day || '', month: d.month || '', steps: d.steps || 0, km: d.km || 0, co2: d.co2 || 0, emoji: d.emoji || '🚶', date: d.date || d.createdAt })));
      return;
    }
    console.error('Error loading user logs:', e);
  }
}

// Save a single log entry under users/{uid}/logs
async function saveUserLogEntry(entry) {
  try {
    if (!currentUser || !currentUser.uid) throw new Error('No authenticated user');
    const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
    const colRef = collection(db, 'users', currentUser.uid, 'logs');
    const payload = Object.assign({}, entry, { createdAt: serverTimestamp(), date: entry.date ? entry.date : serverTimestamp() });
    const docRef = await addDoc(colRef, payload);
    return docRef.id;
  } catch (e) {
    if (isPermissionError(e)) {
      console.warn('Permission denied saving log — saving locally');
      // create day/month fields for compatibility
      const dt = new Date();
      const day = String(dt.getDate()).padStart(2, '0');
      const month = dt.toLocaleString('default', { month: 'short' });
      const fallback = Object.assign({}, entry, { day, month, date: new Date().toISOString() });
      try {
        const id = localSaveUserLog(currentUser?.uid || state.userId || 'guest', fallback);
        return id;
      } catch (le) {
        console.error('Local saveUserLog failed', le);
        throw le;
      }
    }
    console.error('Error saving user log entry:', e);
    throw e;
  }
}

window.saveUserLogEntry = saveUserLogEntry;

// Save user data to Firestore
async function saveUserData() {
  const uid = currentUser?.uid || state.userId;
  if (!uid) return;

  let payload; // Declare outside try/catch so it's accessible in catch block

  try {
    const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');

    payload = {
      steps: state.todaySteps || state.steps,
      todayDate: state.dailyDate || getLocalDateString(),
      todaySteps: state.todaySteps,
      todayKm: state.todayKm,
      todayCalories: state.todayCalories,
      todayMinutes: state.todayMinutes,
      todayCO2g: state.todayCO2g,
      todayTrees: state.todayTrees,
      dailyGoal: state.dailyGoal,
      lifetimeSteps: state.lifetimeSteps,
      lifetimeCO2g: state.lifetimeCO2g,
      lifetimeTrees: state.lifetimeTrees,
      streak: state.streak,
      lastWalkDate: state.lastWalkDate || null,
      lastStreakDate: state.lastWalkDate || null,
      ecoPoints: state.ecoPoints,
      profileLevel: state.profileLevel,
      profileRank: state.profileRank,
      profileImpactKm: state.profileImpactKm,
      profileImpactCO2kg: state.profileImpactCO2kg,
      activeChallenges: state.activeChallenges || [],
      challengeWeekStart: state.challengeWeekStart || getLocalDateString(),
      badgesData: Array.isArray(badgesData) ? badgesData : [],
      lastActiveDate: getLocalDateString(),
      lastUpdated: serverTimestamp()
    };

    await updateDoc(doc(db, 'users', uid), payload);
    console.log('✅ User data saved to Firestore for', uid);
  } catch (error) {
    if (isPermissionError(error)) {
      console.warn('Skipping saveUserData to Firestore: insufficient permissions — saving locally instead');
      // Save fallback locally so user data persists in this browser
      try {
        if (payload) {
          localSaveUserData(uid, payload);
        } else {
          console.warn('No payload to save locally');
        }
        return;
      } catch (le) {
        console.error('Local saveUserData failed', le);
        return;
      }
    }
    console.error('Error saving user data:', error);
  }
}

// Get user friendly error messages
function getAuthErrorMessage(errorCode) {
  const errorMessages = {
    'auth/email-already-in-use': 'This email is already registered',
    'auth/invalid-email': 'Please enter a valid email address',
    'auth/weak-password': 'Password must be at least 6 characters',
    'auth/user-not-found': 'No account found with this email',
    'auth/wrong-password': 'Incorrect password',
    'auth/too-many-requests': 'Too many failed attempts. Try again later',
    'auth/user-disabled': 'This account has been disabled',
    'auth/operation-not-allowed': 'Registration is currently disabled',
    'auth/network-request-failed': 'Network error. Check your connection',
  };
  return errorMessages[errorCode] || 'An error occurred. Please try again';
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFirebaseWhenReady);
} else {
  initFirebaseWhenReady();
}
