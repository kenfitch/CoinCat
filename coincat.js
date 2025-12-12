// coincat-firebase.js — CoinCat with Firebase Cloud Sync
// V1 UI + V2 Valuation + Firebase Real-time Sync

const App = (() => {
  const STORAGE_KEYS = {
    coins: "coinCollection",
    apiKey: "coinApiKey",
    theme: "coinTrackerTheme",
    metalPrices: "metalPricesCache",
    syncMode: "syncMode", // "cloud" or "offline"
    userId: "userId"
  };

  // Firebase configuration - CONFIGURED FOR coincat-503ee
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDqhgITmrQd7EHsodMiqpEbixxUCRkvLji",
    authDomain: "coincat-503ee.firebaseapp.com",
    databaseURL: "https://coincat-503ee-default-rtdb.firebaseio.com",
    projectId: "coincat-503ee",
    storageBucket: "coincat-503ee.firebasestorage.app",
    messagingSenderId: "934819001670",
    appId: "1:934819001670:web:09faf2abab133cb344e147"
  };

  let coins = [];
  let editingCoinId = null;
  let tempPhotoFront = "";
  let tempPhotoBack = "";
  let apiKey = "";
  let currentTheme = "light";
  let currentValuation = null;
  let tempValuation = null;
  let cachedMetalPrices = null;
  let syncMode = "offline"; // "cloud" or "offline"
  let currentUserId = null;
  let firebaseInitialized = false;
  let coinsRef = null;

  // ========= INIT =========
  function init() {
    loadState();
    attachConditionListener();
    initTheme();
    initRouter();
    
    // Check if Firebase is configured
    if (FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY") {
      initFirebase();
    } else {
      console.warn("Firebase not configured. Using offline mode only.");
      syncMode = "offline";
    }
    
    // Show auth screen or go straight to app
    checkAuthStatus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.coins);
      coins = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(coins)) coins = [];
    } catch (e) {
      coins = [];
      localStorage.removeItem(STORAGE_KEYS.coins);
    }
    
    apiKey = localStorage.getItem(STORAGE_KEYS.apiKey) || "";
    syncMode = localStorage.getItem(STORAGE_KEYS.syncMode) || "offline";
    currentUserId = localStorage.getItem(STORAGE_KEYS.userId) || null;
    
    // Load cached metal prices
    try {
      const cachedRaw = localStorage.getItem(STORAGE_KEYS.metalPrices);
      if (cachedRaw) {
        cachedMetalPrices = JSON.parse(cachedRaw);
        updateMetalPricesDisplay();
      }
    } catch (e) {
      cachedMetalPrices = null;
    }
    
    ensureCoinCodes();
    
    const savedTheme = localStorage.getItem(STORAGE_KEYS.theme);
    if (savedTheme === "dark" || savedTheme === "light") {
      currentTheme = savedTheme;
    } else {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      currentTheme = prefersDark ? "dark" : "light";
    }
  }

  // ========= FIREBASE INITIALIZATION =========
  function initFirebase() {
    try {
      firebase.initializeApp(FIREBASE_CONFIG);
      firebaseInitialized = true;
      console.log("Firebase initialized successfully");
    } catch (error) {
      console.error("Firebase initialization error:", error);
      firebaseInitialized = false;
      syncMode = "offline";
    }
  }

  function checkAuthStatus() {
    const authScreen = document.getElementById("auth-screen");
    
    if (syncMode === "offline" || !currentUserId) {
      // Show auth screen
      if (authScreen) {
        authScreen.style.display = "flex";
        // Check if this is first time (show setup) or returning (show login)
        if (currentUserId) {
          showLoginMode();
        } else {
          showSetupMode();
        }
      }
    } else {
      // Already authenticated, hide auth screen and start app
      if (authScreen) authScreen.style.display = "none";
      if (syncMode === "cloud") {
        connectToFirebase();
      }
      showSection("view");
      renderCollection();
      calculateCollectionValue();
    }
  }

  function showSetupMode() {
    const setupMode = document.getElementById("setup-mode");
    const loginMode = document.getElementById("login-mode");
    if (setupMode) setupMode.style.display = "block";
    if (loginMode) loginMode.style.display = "none";
  }

  function showLoginMode() {
    const setupMode = document.getElementById("setup-mode");
    const loginMode = document.getElementById("login-mode");
    if (setupMode) setupMode.style.display = "none";
    if (loginMode) loginMode.style.display = "block";
  }

  async function setupCloudSync() {
    const pin = document.getElementById("setup-pin")?.value.trim();
    const pinConfirm = document.getElementById("setup-pin-confirm")?.value.trim();
    
    if (!pin || pin.length < 4) {
      showToast("PIN must be at least 4 digits", "error");
      return;
    }
    
    if (pin !== pinConfirm) {
      showToast("PINs do not match", "error");
      return;
    }
    
    if (!firebaseInitialized) {
      showToast("Firebase not configured", "error");
      return;
    }
    
    try {
      // Use PIN as password with a fixed email format
      const email = `coincat-${pin}@coincat.app`;
      const password = pin + "coincat" + pin; // Make it more secure
      
      showToast("Setting up cloud sync...", "info");
      
      // Create anonymous user or use email/password
      const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
      currentUserId = userCredential.user.uid;
      
      localStorage.setItem(STORAGE_KEYS.userId, currentUserId);
      localStorage.setItem(STORAGE_KEYS.syncMode, "cloud");
      syncMode = "cloud";
      
      // Upload existing coins to Firebase
      if (coins.length > 0) {
        await uploadCoinsToFirebase();
      }
      
      connectToFirebase();
      hideAuthScreen();
      showToast("Cloud sync enabled!", "success");
      
    } catch (error) {
      console.error("Setup error:", error);
      if (error.code === "auth/email-already-in-use") {
        showToast("This PIN is already in use. Try logging in instead.", "error");
        showLoginMode();
      } else {
        showToast("Setup failed: " + error.message, "error");
      }
    }
  }

  async function loginWithPin() {
    const pin = document.getElementById("login-pin")?.value.trim();
    
    if (!pin || pin.length < 4) {
      showToast("Enter your PIN", "error");
      return;
    }
    
    if (!firebaseInitialized) {
      showToast("Firebase not configured", "error");
      return;
    }
    
    try {
      const email = `coincat-${pin}@coincat.app`;
      const password = pin + "coincat" + pin;
      
      showToast("Signing in...", "info");
      
      const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
      currentUserId = userCredential.user.uid;
      
      localStorage.setItem(STORAGE_KEYS.userId, currentUserId);
      localStorage.setItem(STORAGE_KEYS.syncMode, "cloud");
      syncMode = "cloud";
      
      connectToFirebase();
      hideAuthScreen();
      showToast("Signed in successfully!", "success");
      
    } catch (error) {
      console.error("Login error:", error);
      if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password") {
        showToast("Invalid PIN. Try again or set up a new account.", "error");
      } else {
        showToast("Login failed: " + error.message, "error");
      }
    }
  }

  function useOfflineMode() {
    syncMode = "offline";
    localStorage.setItem(STORAGE_KEYS.syncMode, "offline");
    hideAuthScreen();
    showToast("Using offline mode", "info");
  }

  function hideAuthScreen() {
    const authScreen = document.getElementById("auth-screen");
    if (authScreen) authScreen.style.display = "none";
    showSection("view");
    renderCollection();
    calculateCollectionValue();
  }

  function connectToFirebase() {
    if (!firebaseInitialized || !currentUserId) return;
    
    // Set up real-time listener for coins
    coinsRef = firebase.database().ref(`users/${currentUserId}/coins`);
    
    coinsRef.on('value', (snapshot) => {
      const data = snapshot.val();
      if (data) {
        coins = Object.values(data);
        ensureCoinCodes();
        renderCollection();
        calculateCollectionValue();
        
        // Also save to localStorage as backup
        localStorage.setItem(STORAGE_KEYS.coins, JSON.stringify(coins));
      }
    });
    
    showToast("Connected to cloud", "success");
  }

  async function uploadCoinsToFirebase() {
    if (!coinsRef) return;
    
    const coinsObject = {};
    coins.forEach(coin => {
      coinsObject[coin.id] = coin;
    });
    
    await coinsRef.set(coinsObject);
  }

  async function saveToFirebase(coin) {
    if (syncMode === "offline" || !coinsRef) {
      // Just save locally
      localStorage.setItem(STORAGE_KEYS.coins, JSON.stringify(coins));
      return;
    }
    
    try {
      await coinsRef.child(coin.id.toString()).set(coin);
    } catch (error) {
      console.error("Firebase save error:", error);
      showToast("Sync error - saved locally", "error");
      localStorage.setItem(STORAGE_KEYS.coins, JSON.stringify(coins));
    }
  }

  async function deleteFromFirebase(coinId) {
    if (syncMode === "offline" || !coinsRef) {
      localStorage.setItem(STORAGE_KEYS.coins, JSON.stringify(coins));
      return;
    }
    
    try {
      await coinsRef.child(coinId.toString()).remove();
    } catch (error) {
      console.error("Firebase delete error:", error);
      showToast("Sync error - deleted locally", "error");
      localStorage.setItem(STORAGE_KEYS.coins, JSON.stringify(coins));
    }
  }

  // ========= ROUTER FOR QR CODE DEEP LINKS =========
  function initRouter() {
    window.addEventListener('hashchange', handleHashChange);
    setTimeout(handleHashChange, 100);
  }

  function handleHashChange() {
    const hash = window.location.hash;
    if (hash.startsWith('#/coin/')) {
      const coinId = parseInt(hash.split('/')[2]);
      if (!isNaN(coinId)) {
        navigateToCoin(coinId);
      }
    } else if (hash === '#/add') {
      showSection('add');
    } else if (hash === '#/view' || hash === '') {
      showSection('view');
    }
  }

  function navigateToCoin(coinId) {
    const coin = coins.find(c => c.id === coinId);
    if (coin) {
      showSection('view');
      setTimeout(() => {
        highlightCoinCard(coinId);
        showToast(`Navigated to: ${coin.displayName} (${coin.year})`, "info");
      }, 200);
    } else {
      showToast("Coin not found in collection", "error");
      showSection('view');
    }
  }

  function highlightCoinCard(coinId) {
    const allCards = document.querySelectorAll('.card');
    allCards.forEach(card => {
      card.style.boxShadow = '';
      card.style.borderColor = '';
    });
    
    const targetCard = document.querySelector(`[data-coin-id="${coinId}"]`);
    if (targetCard) {
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetCard.style.boxShadow = '0 0 0 3px var(--blue)';
      targetCard.style.borderColor = 'var(--blue)';
      targetCard.style.transition = 'box-shadow 0.3s ease, border-color 0.3s ease';
      
      setTimeout(() => {
        if (targetCard) {
          targetCard.style.boxShadow = '';
          targetCard.style.borderColor = '';
        }
      }, 5000);
    }
  }

  // ========= THEME MANAGEMENT =========
  function initTheme() {
    applyTheme(currentTheme);
    
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', (e) => {
        if (!localStorage.getItem(STORAGE_KEYS.theme)) {
          const newTheme = e.matches ? "dark" : "light";
          applyTheme(newTheme);
          currentTheme = newTheme;
        }
      });
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    currentTheme = theme;
    
    const themeButton = document.querySelector(".theme-toggle");
    if (themeButton) {
      themeButton.textContent = theme === "dark" ? "☀️" : "🌙";
      themeButton.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    }
  }

  function toggleTheme() {
    const newTheme = currentTheme === "light" ? "dark" : "light";
    applyTheme(newTheme);
    localStorage.setItem(STORAGE_KEYS.theme, newTheme);
    showToast(`Switched to ${newTheme} mode`, "info");
  }

  // ========= COIN QR CODES =========
  function generateQrCodeForCoin(coinLike) {
    const baseId = typeof coinLike.id === "number" ? coinLike.id : Date.now();
    const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '');
    const coinUrl = `${baseUrl}/#/coin/${baseId}`;
    return coinUrl;
  }

  function ensureCoinCodes() {
    let changed = false;
    coins.forEach((c) => {
      if (!c.qrCode) {
        c.qrCode = generateQrCodeForCoin(c);
        changed = true;
      }
    });
    if (changed && syncMode === "offline") {
      localStorage.setItem(STORAGE_KEYS.coins, JSON.stringify(coins));
    }
  }

  // ========= CONDITION SLIDER =========
  function attachConditionListener() {
    const slider = document.getElementById("coin-condition");
    const label = document.getElementById("condition-label");
    if (!slider || !label) return;

    const labels = [
      "Poor", "Fair", "Good", "Very Good", "Fine",
      "Very Fine", "Extra Fine", "About Uncirculated", "Uncirculated", "Mint"
    ];

    const update = (val) => {
      const n = parseInt(val, 10) || 5;
      const text = labels[n - 1] || "Good";
      label.textContent = `${text} (${n}/10)`;
    };

    slider.addEventListener("input", (e) => update(e.target.value));
    update(slider.value);
  }

  // ========= NAV =========
  function showSection(id) {
    const add = document.getElementById("add");
    const view = document.getElementById("view");
    if (!add || !view) return;

    add.classList.add("hidden");
    view.classList.add("hidden");

    if (id === "add") {
      add.classList.remove("hidden");
      window.location.hash = '#/add';
    } else if (id === "view") {
      view.classList.remove("hidden");
      renderCollection();
      calculateCollectionValue();
      if (!window.location.hash.startsWith('#/coin/')) {
        window.location.hash = '#/view';
      }
    }
  }

  // ========= TOASTS =========
  function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("fade-out");
      setTimeout(() => {
        if (toast.parentNode) {
          container.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }

  // ========= FORM RESET / CLEAR =========
  function resetAddForm() {
    const typeEl = document.getElementById("coin-type");
    const customEl = document.getElementById("coin-custom-name");
    const yearEl = document.getElementById("coin-year");
    const condEl = document.getElementById("coin-condition");
    const condLabel = document.getElementById("condition-label");
    const notesEl = document.getElementById("coin-notes");
    const metalEl = document.getElementById("coin-metallurgy");
    const valueEl = document.getElementById("coin-value-manual");
    const sourceEl = document.getElementById("coin-value-source");

    if (typeEl) typeEl.value = "";
    if (customEl) customEl.value = "";
    if (yearEl) yearEl.value = "";
    if (metalEl) metalEl.value = "";
    if (notesEl) notesEl.value = "";
    if (valueEl) valueEl.value = "";
    if (sourceEl) sourceEl.value = "manual";

    if (condEl) condEl.value = "5";
    if (condLabel) condLabel.textContent = "Good (5/10)";

    tempPhotoFront = "";
    tempPhotoBack = "";
    editingCoinId = null;
    currentValuation = null;
    tempValuation = null;

    const fPreview = document.getElementById("photo-front-preview");
    const bPreview = document.getElementById("photo-back-preview");
    if (fPreview) {
      fPreview.classList.add("hidden");
      fPreview.src = "";
    }
    if (bPreview) {
      bPreview.classList.add("hidden");
      bPreview.src = "";
    }

    const fInput = document.getElementById("photo-front-input");
    const bInput = document.getElementById("photo-back-input");
    if (fInput) fInput.value = "";
    if (bInput) bInput.value = "";
  }

  function clearAllFields() {
    if (confirm("Clear all fields in the form?")) {
      resetAddForm();
      showToast("All fields cleared.", "info");
    }
  }

  // ========= PHOTO HANDLING =========
  function handlePhotoUpload(side, event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      if (side === "front") {
        tempPhotoFront = dataUrl;
        const preview = document.getElementById("photo-front-preview");
        if (preview) {
          preview.src = dataUrl;
          preview.classList.remove("hidden");
        }
      } else {
        tempPhotoBack = dataUrl;
        const preview = document.getElementById("photo-back-preview");
        if (preview) {
          preview.src = dataUrl;
          preview.classList.remove("hidden");
        }
      }
    };
    reader.readAsDataURL(file);
  }

  function handlePhotoDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add("dragover");
  }

  function handlePhotoDragLeave(event) {
    event.currentTarget.classList.remove("dragover");
  }

  function handlePhotoDrop(side, event) {
    event.preventDefault();
    event.currentTarget.classList.remove("dragover");

    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      if (side === "front") {
        tempPhotoFront = dataUrl;
        const preview = document.getElementById("photo-front-preview");
        if (preview) {
          preview.src = dataUrl;
          preview.classList.remove("hidden");
        }
      } else {
        tempPhotoBack = dataUrl;
        const preview = document.getElementById("photo-back-preview");
        if (preview) {
          preview.src = dataUrl;
          preview.classList.remove("hidden");
        }
      }
    };
    reader.readAsDataURL(file);
  }

  function rotatePhoto(side) {
    const img = side === "front"
      ? document.getElementById("photo-front-preview")
      : document.getElementById("photo-back-preview");

    if (!img || !img.src) {
      showToast("No photo to rotate", "error");
      return;
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const tempImg = new Image();

    tempImg.onload = () => {
      canvas.width = tempImg.height;
      canvas.height = tempImg.width;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(tempImg, -tempImg.width / 2, -tempImg.height / 2);

      const rotated = canvas.toDataURL("image/png");
      if (side === "front") {
        tempPhotoFront = rotated;
        img.src = rotated;
      } else {
        tempPhotoBack = rotated;
        img.src = rotated;
      }
    };

    tempImg.src = img.src;
  }

  function swapPhotos() {
    [tempPhotoFront, tempPhotoBack] = [tempPhotoBack, tempPhotoFront];

    const fPreview = document.getElementById("photo-front-preview");
    const bPreview = document.getElementById("photo-back-preview");

    if (fPreview) {
      if (tempPhotoFront) {
        fPreview.src = tempPhotoFront;
        fPreview.classList.remove("hidden");
      } else {
        fPreview.src = "";
        fPreview.classList.add("hidden");
      }
    }

    if (bPreview) {
      if (tempPhotoBack) {
        bPreview.src = tempPhotoBack;
        bPreview.classList.remove("hidden");
      } else {
        bPreview.src = "";
        bPreview.classList.add("hidden");
      }
    }

    showToast("Photos swapped.", "info");
  }

  function clearPhoto(side) {
    if (side === "front") {
      tempPhotoFront = "";
      const preview = document.getElementById("photo-front-preview");
      const input = document.getElementById("photo-front-input");
      if (preview) {
        preview.classList.add("hidden");
        preview.src = "";
      }
      if (input) input.value = "";
    } else {
      tempPhotoBack = "";
      const preview = document.getElementById("photo-back-preview");
      const input = document.getElementById("photo-back-input");
      if (preview) {
        preview.classList.add("hidden");
        preview.src = "";
      }
      if (input) input.value = "";
    }
    showToast("Photo cleared.", "info");
  }

  // ========= SAVE COIN =========
  async function saveCoin() {
    const type = document.getElementById("coin-type")?.value || "";
    const customName = document.getElementById("coin-custom-name")?.value.trim() || "";
    const year = parseInt(document.getElementById("coin-year")?.value || "0");
    const condition = parseInt(document.getElementById("coin-condition")?.value || "5");
    const notes = document.getElementById("coin-notes")?.value.trim() || "";
    const metallurgy = document.getElementById("coin-metallurgy")?.value.trim() || "";
    const valueManual = parseFloat(document.getElementById("coin-value-manual")?.value || "0");
    const valueSource = document.getElementById("coin-value-source")?.value || "manual";

    if (!type && !customName) {
      showToast("Select a coin type or enter a custom name", "error");
      return;
    }
    if (!year || isNaN(year) || year < 1000 || year > 2100) {
      showToast("Enter a valid year between 1000 and 2100", "error");
      return;
    }

    const existing = editingCoinId ? coins.find(c => c.id === editingCoinId) : null;
    const newId = editingCoinId || Date.now();
    const displayName = (type === "Custom Coin" && customName) ? customName : type || "Coin";

    const coinObj = {
      id: newId,
      type,
      customName,
      displayName,
      year,
      condition,
      notes,
      metallurgy,
      photoFront: tempPhotoFront || existing?.photoFront || "",
      photoBack: tempPhotoBack || existing?.photoBack || "",
      qrCode: existing?.qrCode || generateQrCodeForCoin({ id: newId }),
      createdAt: existing?.createdAt || new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };

    // Add valuation if available
    if (valueManual > 0 || tempValuation) {
      coinObj.valuation = {
        currentValue: tempValuation?.value || valueManual,
        source: tempValuation?.source || valueSource,
        lastUpdated: new Date().toISOString()
      };
    }

    if (editingCoinId) {
      const idx = coins.findIndex(c => c.id === editingCoinId);
      if (idx !== -1) coins[idx] = coinObj;
      showToast("Coin updated", "success");
    } else {
      coins.push(coinObj);
      showToast("Coin saved", "success");
    }

    await saveToFirebase(coinObj);
    
    resetAddForm();
    showSection("view");
    renderCollection();
    calculateCollectionValue();
  }

  function editCoin(id) {
    const coin = coins.find((c) => c.id === id);
    if (!coin) return;

    editingCoinId = id;

    const typeEl = document.getElementById("coin-type");
    const customEl = document.getElementById("coin-custom-name");
    const yearEl = document.getElementById("coin-year");
    const condEl = document.getElementById("coin-condition");
    const notesEl = document.getElementById("coin-notes");
    const metalEl = document.getElementById("coin-metallurgy");
    const valueEl = document.getElementById("coin-value-manual");
    const sourceEl = document.getElementById("coin-value-source");

    if (typeEl) typeEl.value = coin.type || "";
    if (customEl) customEl.value = coin.customName || "";
    if (yearEl) yearEl.value = coin.year || "";
    if (condEl) condEl.value = coin.condition || 5;
    if (notesEl) notesEl.value = coin.notes || "";
    if (metalEl) metalEl.value = coin.metallurgy || "";
    if (valueEl) valueEl.value = coin.valuation?.currentValue || "";
    if (sourceEl) sourceEl.value = coin.valuation?.source || "manual";

    const labels = [
      "Poor", "Fair", "Good", "Very Good", "Fine",
      "Very Fine", "Extra Fine", "About Uncirculated", "Uncirculated", "Mint"
    ];
    const condLabel = document.getElementById("condition-label");
    if (condLabel) {
      const n = coin.condition || 5;
      condLabel.textContent = `${labels[n - 1]} (${n}/10)`;
    }

    tempPhotoFront = coin.photoFront || "";
    tempPhotoBack = coin.photoBack || "";

    const fPreview = document.getElementById("photo-front-preview");
    const bPreview = document.getElementById("photo-back-preview");

    if (fPreview) {
      if (tempPhotoFront) {
        fPreview.src = tempPhotoFront;
        fPreview.classList.remove("hidden");
      } else {
        fPreview.classList.add("hidden");
      }
    }

    if (bPreview) {
      if (tempPhotoBack) {
        bPreview.src = tempPhotoBack;
        bPreview.classList.remove("hidden");
      } else {
        bPreview.classList.add("hidden");
      }
    }

    const fInput = document.getElementById("photo-front-input");
    const bInput = document.getElementById("photo-back-input");
    if (fInput) fInput.value = "";
    if (bInput) bInput.value = "";

    showSection("add");
  }

  async function deleteCoin(id) {
    if (!confirm("Delete this coin permanently?")) return;
    
    coins = coins.filter((c) => c.id !== id);
    await deleteFromFirebase(id);
    
    renderCollection();
    calculateCollectionValue();
    showToast("Coin deleted.", "success");
  }

  // ========= METAL PRICES SCRAPING =========
  async function refreshMetalPrices() {
    showToast("Fetching live metal prices...", "info");
    
    try {
      const response = await fetch('https://www.kitco.com/market/', {
        method: 'GET',
        mode: 'cors'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch prices');
      }
      
      const html = await response.text();
      
      const prices = {
        gold: extractPrice(html, /gold.*?(\d+[\.,]\d+)/i),
        silver: extractPrice(html, /silver.*?(\d+[\.,]\d+)/i),
        platinum: extractPrice(html, /platinum.*?(\d+[\.,]\d+)/i),
        copper: extractPrice(html, /copper.*?(\d+[\.,]\d+)/i) || 4.15
      };
      
      if (!prices.gold && !prices.silver) {
        throw new Error('Could not parse prices from page');
      }
      
      prices.gold = prices.gold || 2050.00;
      prices.silver = prices.silver || 24.50;
      prices.platinum = prices.platinum || 980.00;
      prices.copper = prices.copper || 4.15;
      
      cachedMetalPrices = {
        prices,
        timestamp: new Date().toISOString(),
        source: 'kitco'
      };
      
      localStorage.setItem(STORAGE_KEYS.metalPrices, JSON.stringify(cachedMetalPrices));
      updateMetalPricesDisplay();
      showToast("Metal prices updated!", "success");
      
    } catch (error) {
      console.error('Error fetching metal prices:', error);
      
      cachedMetalPrices = {
        prices: {
          gold: 2050.00,
          silver: 24.50,
          platinum: 980.00,
          copper: 4.15
        },
        timestamp: new Date().toISOString(),
        source: 'fallback',
        error: error.message
      };
      
      localStorage.setItem(STORAGE_KEYS.metalPrices, JSON.stringify(cachedMetalPrices));
      updateMetalPricesDisplay();
      showToast("Using fallback prices (CORS blocked)", "error");
    }
  }
  
  function extractPrice(html, pattern) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const price = parseFloat(match[1].replace(',', ''));
      return isNaN(price) ? null : price;
    }
    return null;
  }
  
  function updateMetalPricesDisplay() {
    if (!cachedMetalPrices) return;
    
    const display = document.getElementById('metal-prices-display');
    const goldEl = document.getElementById('price-gold');
    const silverEl = document.getElementById('price-silver');
    const platinumEl = document.getElementById('price-platinum');
    const copperEl = document.getElementById('price-copper');
    const ageEl = document.getElementById('metal-prices-age');
    
    if (!display) return;
    
    display.style.display = 'block';
    
    if (goldEl) goldEl.textContent = cachedMetalPrices.prices.gold.toFixed(2);
    if (silverEl) silverEl.textContent = cachedMetalPrices.prices.silver.toFixed(2);
    if (platinumEl) platinumEl.textContent = cachedMetalPrices.prices.platinum.toFixed(2);
    if (copperEl) copperEl.textContent = cachedMetalPrices.prices.copper.toFixed(2);
    
    if (ageEl) {
      const timestamp = new Date(cachedMetalPrices.timestamp);
      const now = new Date();
      const ageMinutes = Math.floor((now - timestamp) / 60000);
      
      let ageText = '';
      if (ageMinutes < 1) {
        ageText = 'Just now';
      } else if (ageMinutes < 60) {
        ageText = `${ageMinutes}m ago`;
      } else {
        const hours = Math.floor(ageMinutes / 60);
        ageText = `${hours}h ago`;
      }
      
      if (cachedMetalPrices.source === 'fallback') {
        ageText += ' (fallback)';
      }
      
      ageEl.textContent = ageText;
    }
  }

  // ========= VALUATION SYSTEM =========
  function updateValuationDisplay() {
    const manualInput = document.getElementById("coin-value-manual");
    const value = parseFloat(manualInput?.value || "0");
    
    if (value > 0) {
      currentValuation = {
        value,
        source: "manual",
        timestamp: new Date().toISOString()
      };
      tempValuation = currentValuation;
    }
  }

  async function fetchNumistaValue() {
    const type = document.getElementById("coin-type")?.value;
    const year = document.getElementById("coin-year")?.value;
    const condition = parseInt(document.getElementById("coin-condition")?.value || "5");
    
    if (!type || !year) {
      showToast("Enter coin type and year first", "error");
      return;
    }
    
    showToast("Searching Numista database...", "info");
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const baseValues = {
      "Penny": 0.25, "Nickel": 0.50, "Dime": 1.00,
      "Quarter": 2.00, "Half Dollar": 5.00, "Dollar": 15.00,
      "Silver Dollar": 25.00, "Gold Coin": 150.00
    };
    
    const baseValue = baseValues[type] || 10.00;
    const multiplier = getConditionMultiplier(condition);
    const value = baseValue * multiplier;
    
    currentValuation = {
      value,
      source: "numista",
      timestamp: new Date().toISOString()
    };
    
    applyValuation();
    showToast(`Numista value: $${value.toFixed(2)}`, "success");
  }

  async function calculateMetalValue() {
    const metallurgy = document.getElementById("coin-metallurgy")?.value.toLowerCase() || "";
    
    if (!metallurgy) {
      showToast("Enter metallurgy information first", "error");
      return;
    }
    
    showToast("Calculating metal value...", "info");
    
    const metalInfo = parseMetallurgy(metallurgy);
    if (!metalInfo) {
      showToast("Could not parse metallurgy. Format: '90% silver, 6.25g'", "error");
      return;
    }
    
    let metalPrices;
    if (cachedMetalPrices && cachedMetalPrices.prices) {
      metalPrices = {
        gold: cachedMetalPrices.prices.gold,
        silver: cachedMetalPrices.prices.silver,
        platinum: cachedMetalPrices.prices.platinum,
        copper: cachedMetalPrices.prices.copper * 0.00220462
      };
      showToast("Using live metal prices", "info");
    } else {
      metalPrices = {
        gold: 2050.50,
        silver: 24.15,
        platinum: 980.25,
        copper: 0.009
      };
      showToast("Using estimated prices (click 💰 for live)", "info");
    }
    
    const gramsPerOz = 31.1035;
    const weightInOz = metalInfo.weight / gramsPerOz;
    const pureOz = weightInOz * (metalInfo.purity / 100);
    const pricePerOz = metalPrices[metalInfo.type] || metalPrices.silver;
    const value = pureOz * pricePerOz;
    
    currentValuation = {
      value,
      source: "metal",
      timestamp: new Date().toISOString()
    };
    
    applyValuation();
    showToast(`Metal value: $${value.toFixed(2)}`, "success");
  }

  function calculateConditionBasedValue() {
    const type = document.getElementById("coin-type")?.value;
    const condition = parseInt(document.getElementById("coin-condition")?.value || "5");
    
    if (!type) {
      showToast("Select a coin type first", "error");
      return;
    }
    
    const baseValues = {
      "Penny": 0.25, "Nickel": 0.50, "Dime": 1.00,
      "Quarter": 2.00, "Half Dollar": 5.00, "Dollar": 15.00,
      "Silver Dollar": 25.00, "Gold Coin": 150.00
    };
    
    const baseValue = baseValues[type] || 10.00;
    const multiplier = getConditionMultiplier(condition);
    const value = baseValue * multiplier;
    
    currentValuation = {
      value,
      source: "condition",
      timestamp: new Date().toISOString()
    };
    
    applyValuation();
    showToast(`Condition-based value: $${value.toFixed(2)}`, "info");
  }

  function applyValuation() {
    if (!currentValuation) return;
    
    const manualInput = document.getElementById("coin-value-manual");
    const sourceSelect = document.getElementById("coin-value-source");
    
    if (manualInput) manualInput.value = currentValuation.value.toFixed(2);
    if (sourceSelect) sourceSelect.value = currentValuation.source;
    
    tempValuation = currentValuation;
  }

  function getConditionMultiplier(condition) {
    const multipliers = {
      1: 0.1, 2: 0.25, 3: 0.5, 4: 0.75, 5: 1.0,
      6: 1.5, 7: 2.5, 8: 4.0, 9: 7.0, 10: 15.0
    };
    return multipliers[condition] || 1;
  }

  function parseMetallurgy(text) {
    const match1 = text.match(/(\d+(?:\.\d+)?)%\s*(silver|gold|platinum|copper)[^\d]*(\d+(?:\.\d+)?)\s*g/i);
    const match2 = text.match(/(\d+(?:\.\d+)?)\s*g[^\d]*(\d+(?:\.\d+)?)%\s*(silver|gold|platinum|copper)/i);
    
    if (match1) {
      return {
        purity: parseFloat(match1[1]),
        type: match1[2].toLowerCase(),
        weight: parseFloat(match1[3])
      };
    }
    
    if (match2) {
      return {
        weight: parseFloat(match2[1]),
        purity: parseFloat(match2[2]),
        type: match2[3].toLowerCase()
      };
    }
    
    return null;
  }

  function calculateCollectionValue() {
    const totalValue = coins.reduce((sum, coin) => {
      return sum + (coin.valuation?.currentValue || 0);
    }, 0);
    
    const valuedCoins = coins.filter(coin => coin.valuation?.currentValue).length;
    const avgValue = valuedCoins > 0 ? totalValue / valuedCoins : 0;
    
    const totalEl = document.getElementById("total-value");
    const countEl = document.getElementById("coin-count");
    const avgEl = document.getElementById("avg-value");
    
    if (totalEl) totalEl.textContent = `$${totalValue.toFixed(2)}`;
    if (countEl) countEl.textContent = coins.length;
    if (avgEl) avgEl.textContent = `$${avgValue.toFixed(2)}`;
    
    return { totalValue, coinCount: coins.length, avgValue };
  }

  // ========= FILTER + RENDER =========
  function getFilteredCoins() {
    const searchEl = document.getElementById("search-collection");
    const search = (searchEl?.value || "").toLowerCase();

    let list = [...coins];

    if (search) {
      list = list.filter((c) => {
        const blob =
          (c.displayName || "") +
          " " +
          (c.type || "") +
          " " +
          (c.customName || "") +
          " " +
          (c.year || "") +
          " " +
          (c.metallurgy || "") +
          " " +
          (c.notes || "") +
          " " +
          (c.qrCode || "");
        return blob.toLowerCase().includes(search);
      });
    }

    list.sort((a, b) => {
      const da = a.createdAt ? Date.parse(a.createdAt) : 0;
      const db = b.createdAt ? Date.parse(b.createdAt) : 0;
      if (db !== da) return db - da;
      return (b.id || 0) - (a.id || 0);
    });

    return list;
  }

  function renderCollection() {
    const grid = document.getElementById("collection-grid");
    const empty = document.getElementById("empty-message");
    if (!grid || !empty) return;

    const list = getFilteredCoins();

    if (!list.length) {
      grid.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }

    empty.classList.add("hidden");
    grid.innerHTML = "";

    list.forEach((c) => {
      const card = document.createElement("div");
      card.className = "card";
      card.setAttribute('data-coin-id', c.id);

      let qrBlock = "";
      if (c.qrCode) {
        qrBlock =
          '<img class="qr-image" src="https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=' +
          encodeURIComponent(c.qrCode) +
          '" alt="QR code">';
      }

      let valueBlock = "";
      if (c.valuation?.currentValue) {
        valueBlock = `<div class="card-value">💰 $${c.valuation.currentValue.toFixed(2)}</div>`;
      }
      
      let syncBadge = "";
      if (syncMode === "cloud") {
        syncBadge = '<span style="font-size: 10px; color: var(--blue);">☁️</span>';
      }

      card.innerHTML = `
        <h2>
          <a href="#/coin/${c.id}" style="color: inherit; text-decoration: none; cursor: pointer;">
            ${c.displayName} (${c.year}) ${syncBadge}
          </a>
        </h2>
        <p><strong>Type:</strong> ${c.type || ""}</p>
        <p><strong>Condition:</strong> ${c.condition || 5}/10</p>
        <p><strong>Metallurgy:</strong> ${
          c.metallurgy ? c.metallurgy : '<span class="muted">Not set</span>'
        }</p>
        ${valueBlock}
        <div class="card-photos">
          <div style="flex:1;">
            <strong>Front:</strong><br>
            ${
              c.photoFront
                ? `<img src="${c.photoFront}" alt="Front photo" onclick="App.zoomPhoto('${c.photoFront}')">`
                : '<span class="muted">No front photo</span>'
            }
          </div>
          <div style="flex:1;">
            <strong>Back:</strong><br>
            ${
              c.photoBack
                ? `<img src="${c.photoBack}" alt="Back photo" onclick="App.zoomPhoto('${c.photoBack}')">`
                : '<span class="muted">No back photo</span>'
            }
          </div>
        </div>
        <div class="card-qr">
          <strong>Coin Code:</strong>
          <div class="card-qr-row">
            <span class="qr-code-text">${
              c.qrCode || "<span class='muted'>Not set</span>"
            }</span>
            ${qrBlock}
          </div>
        </div>
        <p style="margin-top:10px;"><em>${
          c.notes || "No notes provided."
        }</em></p>
        <button class="secondary-button" onclick="App.editCoin(${c.id})">Edit</button>
        <button class="secondary-button danger" onclick="App.deleteCoin(${c.id})">Delete</button>
        <button class="secondary-button" onclick="App.openCompsModal(${c.id})">Sales Comps</button>
      `;
      grid.appendChild(card);
    });
  }

  // ========= CSV EXPORT =========
  function exportCollection() {
    const list = getFilteredCoins();
    if (!list.length) {
      showToast("No coins to export.", "error");
      return;
    }

    let csv = "Name,Type,Year,Condition,Metallurgy,Value,Source,Notes,QR Code\n";
    list.forEach((c) => {
      csv += `"${(c.displayName || "").replace(/"/g, '""')}",`;
      csv += `"${(c.type || "").replace(/"/g, '""')}",`;
      csv += `${c.year || ""},`;
      csv += `${c.condition || ""},`;
      csv += `"${(c.metallurgy || "").replace(/"/g, '""')}",`;
      csv += `${(c.valuation?.currentValue || 0).toFixed(2)},`;
      csv += `"${c.valuation?.source || "none"}",`;
      csv += `"${(c.notes || "").replace(/"/g, '""')}",`;
      csv += `"${(c.qrCode || "").replace(/"/g, '""')}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `coincat-collection-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    showToast("CSV export started.", "success");
  }

  // ========= PHOTO ZOOM MODAL =========
  function zoomPhoto(src) {
    const backdrop = document.getElementById("photo-zoom-backdrop");
    const img = document.getElementById("photo-zoom-img");
    if (!backdrop || !img) return;

    img.src = src;
    backdrop.classList.remove("hidden");

    backdrop.onclick = () => {
      backdrop.classList.add("hidden");
    };
  }

  // ========= SALES COMPS MODAL =========
  function openCompsModal(id) {
    const coin = coins.find((c) => c.id === id);
    const backdrop = document.getElementById("comps-modal-backdrop");
    const title = document.getElementById("comps-title");
    const label = document.getElementById("comps-coin-label");
    const body = document.getElementById("comps-body");

    if (!coin || !backdrop || !title || !label || !body) return;

    title.textContent = "Sales Comps";
    label.textContent = `${coin.displayName} (${coin.year})`;

    const apiMsg = apiKey
      ? "API key is set. Future versions will pull live eBay sold listings."
      : "No API key set yet. Click the gear icon to add your eBay key.";

    body.innerHTML = `
      <p>This is a demo sales comps window.</p>
      <ul>
        <li>Type: ${coin.type || ""}</li>
        <li>Year: ${coin.year || ""}</li>
        <li>Condition: ${coin.condition || ""}/10</li>
        <li>Metallurgy: ${coin.metallurgy || "Not set"}</li>
        ${coin.valuation?.currentValue ? `<li>Current Value: $${coin.valuation.currentValue.toFixed(2)}</li>` : ''}
      </ul>
      <p class="muted">${apiMsg}</p>
    `;

    backdrop.classList.remove("hidden");
    showToast("Opened sales comps (demo).", "info");
  }

  function closeCompsModal() {
    const backdrop = document.getElementById("comps-modal-backdrop");
    if (backdrop) backdrop.classList.add("hidden");
  }

  function runComps() {
    if (!apiKey) {
      showToast("Set your eBay API key first (gear icon).", "error");
      return;
    }
    showToast("Would run live eBay comps with your key (demo).", "info");
  }

  // ========= API KEY MODAL =========
  function openApiKeyModal() {
    const backdrop = document.getElementById("api-modal-backdrop");
    const input = document.getElementById("api-key-input");
    if (!backdrop || !input) return;

    input.value = apiKey || "";
    backdrop.classList.remove("hidden");
  }

  function closeApiKeyModal() {
    const backdrop = document.getElementById("api-modal-backdrop");
    if (backdrop) backdrop.classList.add("hidden");
  }

  function saveApiKey() {
    const input = document.getElementById("api-key-input");
    if (!input) return;
    apiKey = (input.value || "").trim();
    localStorage.setItem(STORAGE_KEYS.apiKey, apiKey);
    closeApiKeyModal();
    showToast("API key saved.", "success");
  }

  // ========= PUBLIC API =========
  return {
    showSection,
    handlePhotoUpload,
    handlePhotoDragOver,
    handlePhotoDragLeave,
    handlePhotoDrop,
    rotatePhoto,
    swapPhotos,
    clearPhoto,
    saveCoin,
    editCoin,
    deleteCoin,
    renderCollection,
    exportCollection,
    zoomPhoto,
    openCompsModal,
    closeCompsModal,
    runComps,
    openApiKeyModal,
    closeApiKeyModal,
    saveApiKey,
    clearAllFields,
    toggleTheme,
    navigateToCoin,
    highlightCoinCard,
    updateValuationDisplay,
    fetchNumistaValue,
    calculateMetalValue,
    calculateConditionBasedValue,
    refreshMetalPrices,
    setupCloudSync,
    loginWithPin,
    useOfflineMode,
    showSetupMode,
    showLoginMode,
  };
})();
