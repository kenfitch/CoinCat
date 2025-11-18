// app.js — Coin Collection Tracker (hybrid auto-center + rim-preserving fill + rotate/swap)

const App = (() => {
  const STORAGE_KEYS = {
    coins: "coinCollection",
    apiKey: "coinApiKey",
  };

  let coins = [];
  let editingCoinId = null;
  let tempPhotoFront = "";
  let tempPhotoBack = "";
  let apiKey = "";

  // ========= INIT =========
  function init() {
    loadState();
    attachConditionListener();
    // Start on VIEW COLLECTION instead of ADD COIN
    showSection("view");
    renderCollection();
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
    ensureCoinCodes();
  }

  // ========= COIN QR CODES (UTILITY) =========
  function generateQrCodeForCoin(coinLike) {
    const baseId =
      typeof coinLike.id === "number" ? coinLike.id : Date.now();
    return "COIN-" + baseId.toString(36).toUpperCase();
  }

  function ensureCoinCodes() {
    let changed = false;
    coins.forEach((c) => {
      if (!c.qrCode) {
        c.qrCode = generateQrCodeForCoin(c);
        changed = true;
      }
    });
    if (changed) {
      localStorage.setItem(STORAGE_KEYS.coins, JSON.stringify(coins));
    }
  }

  // ========= CONDITION SLIDER =========
  function attachConditionListener() {
    const slider = document.getElementById("coin-condition");
    const label = document.getElementById("condition-label");
    if (!slider || !label) return;

    const labels = [
      "Poor",
      "Fair",
      "Good",
      "Very Good",
      "Fine",
      "Very Fine",
      "Extra Fine",
      "About Uncirculated",
      "Uncirculated",
      "Mint",
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
    } else if (id === "view") {
      view.classList.remove("hidden");
      renderCollection();
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
    const metallEl = document.getElementById("coin-metallurgy");
    const fPrev = document.getElementById("photo-front-preview");
    const bPrev = document.getElementById("photo-back-preview");
    const fInput = document.getElementById("photo-front-input");
    const bInput = document.getElementById("photo-back-input");

    if (typeEl) typeEl.value = "";
    if (customEl) customEl.value = "";
    if (yearEl) yearEl.value = "";
    if (condEl) condEl.value = 5;
    if (condLabel) condLabel.textContent = "Good (5/10)";
    if (notesEl) notesEl.value = "";
    if (metallEl) metallEl.value = "";

    tempPhotoFront = "";
    tempPhotoBack = "";
    editingCoinId = null;

    if (fPrev) {
      fPrev.src = "";
      fPrev.classList.add("hidden");
    }
    if (bPrev) {
      bPrev.src = "";
      bPrev.classList.add("hidden");
    }
    if (fInput) fInput.value = "";
    if (bInput) bInput.value = "";
  }

  function clearAllFields() {
    resetAddForm();
    showToast("All fields cleared.", "info");
  }

  // ========= SAVE COIN =========
  function saveCoin() {
    const typeEl = document.getElementById("coin-type");
    const customEl = document.getElementById("coin-custom-name");
    const yearEl = document.getElementById("coin-year");
    const condEl = document.getElementById("coin-condition");
    const notesEl = document.getElementById("coin-notes");
    const metallEl = document.getElementById("coin-metallurgy");

    if (!typeEl || !yearEl || !condEl) {
      showToast("Form not ready.", "error");
      return;
    }

    const type = (typeEl.value || "").trim();
    const customName = (customEl?.value || "").trim();
    const yearVal = (yearEl.value || "").trim();
    const year = parseInt(yearVal, 10);
    const condition = parseInt(condEl.value || "5", 10);
    const notes = (notesEl?.value || "").trim();
    const metallurgy = (metallEl?.value || "").trim();

    const displayName =
      type === "Custom Coin" && customName ? customName : type || "Coin";

    if (!type && !customName) {
      showToast("Select a coin type or enter a custom name.", "error");
      return;
    }
    if (!year || isNaN(year) || year < 1000 || year > 2100) {
      showToast("Enter a valid year between 1000 and 2100.", "error");
      return;
    }

    const existing = editingCoinId
      ? coins.find((c) => c.id === editingCoinId)
      : null;

    const newId = editingCoinId || Date.now();
    const qrCode =
      existing?.qrCode || generateQrCodeForCoin({ id: newId });

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
      qrCode,
      createdAt: existing?.createdAt || new Date().toISOString(),
    };

    if (editingCoinId) {
      const idx = coins.findIndex((c) => c.id === editingCoinId);
      if (idx !== -1) coins[idx] = coinObj;
      showToast("Coin updated.", "success");
    } else {
      coins.push(coinObj);
      showToast("Coin saved.", "success");
    }

    localStorage.setItem(STORAGE_KEYS.coins, JSON.stringify(coins));
    showSection("view");
    renderCollection();
  }

  // ========= PHOTO PROCESSING (HYBRID AUTO-CENTER + RIM-PRESERVING) =========

  function getImageData(canvas) {
    const ctx = canvas.getContext("2d");
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  // Primary: radial rim detection assuming coin roughly centered.
  function detectCoinByRim(canvas) {
    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const ctx = canvas.getContext("2d");
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    const maxR = Math.floor(Math.min(width, height) / 2) - 2;
    if (maxR <= 0) return null;

    const stepR = 2; // radial step, in pixels
    const binCount = Math.floor(maxR / stepR);
    const sum = new Array(binCount).fill(0);
    const cnt = new Array(binCount).fill(0);

    const numAngles = 60; // medium sensitivity
    for (let a = 0; a < numAngles; a++) {
      const theta = (2 * Math.PI * a) / numAngles;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      for (let r = 0; r < maxR; r += stepR) {
        const x = Math.round(cx + cosT * r);
        const y = Math.round(cy + sinT * r);
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const idx = (y * width + x) * 4;
        const rC = data[idx];
        const gC = data[idx + 1];
        const bC = data[idx + 2];
        const brightness = (rC + gC + bC) / 3;
        const bin = Math.floor(r / stepR);
        sum[bin] += brightness;
        cnt[bin] += 1;
      }
    }

    const avg = new Array(binCount).fill(0);
    for (let i = 0; i < binCount; i++) {
      if (cnt[i] > 0) avg[i] = sum[i] / cnt[i];
    }

    // Find radius with maximum brightness jump (rim transition).
    let bestIdx = -1;
    let bestDiff = 0;
    for (let i = 1; i < binCount - 1; i++) {
      const diff = Math.abs(avg[i + 1] - avg[i - 1]) / 2;
      if (diff > bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }

    // Sensitivity M: require a modest gradient to trust detection.
    if (bestIdx === -1 || bestDiff < 8) {
      return null;
    }

    const radius = bestIdx * stepR + stepR / 2;
    return { cx, cy, radius };
  }

  // Fallback: brightness-based center-of-mass for bright objects.
  function detectCoinByMass(canvas) {
    const width = canvas.width;
    const height = canvas.height;
    const ctx = canvas.getContext("2d");
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    let sumW = 0;
    let sumX = 0;
    let sumY = 0;

    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const brightness = (r + g + b) / 3;

        const weight = brightness; // bright pixels == coin
        if (weight < 30) continue; // ignore dark background
        sumW += weight;
        sumX += weight * x;
        sumY += weight * y;
      }
    }

    if (sumW === 0) {
      return {
        cx: width / 2,
        cy: height / 2,
        radius: Math.min(width, height) / 2.2,
      };
    }

    const cx = sumX / sumW;
    const cy = sumY / sumW;
    const radius = Math.min(width, height) / 2.4;
    return { cx, cy, radius };
  }

  // Auto-center + rim-preserving crop.
  function autoCenterCrop(sourceCanvas) {
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;

    // Try rim-based first, then fallback to mass-based.
    let circle = detectCoinByRim(sourceCanvas);
    if (!circle) {
      circle = detectCoinByMass(sourceCanvas);
    }

    const cx = circle.cx;
    const cy = circle.cy;
    const coinRadius = circle.radius;

    const baseSize = Math.min(width, height);

    // Mode B: rim-preserving, strong fill.
    const targetCoinToCircle = 0.9; // coin radius covers 90% of final circle
    let cropSize = (coinRadius * 2) / targetCoinToCircle;

    if (cropSize > baseSize) cropSize = baseSize;
    if (cropSize < coinRadius * 2.2) {
      cropSize = coinRadius * 2.2;
    }

    const half = cropSize / 2;
    let sx = cx - half;
    let sy = cy - half;

    if (sx < 0) sx = 0;
    if (sy < 0) sy = 0;
    if (sx + cropSize > width) sx = width - cropSize;
    if (sy + cropSize > height) sy = height - cropSize;

    const finalCanvas = document.createElement("canvas");
    const finalSize = 240; // consistent resolution; UI shows at 120px
    finalCanvas.width = finalSize;
    finalCanvas.height = finalSize;
    const fctx = finalCanvas.getContext("2d");

    fctx.drawImage(
      sourceCanvas,
      sx,
      sy,
      cropSize,
      cropSize,
      0,
      0,
      finalSize,
      finalSize
    );

    // Gentle brightness pop
    const croppedData = fctx.getImageData(0, 0, finalSize, finalSize);
    const cData = croppedData.data;
    for (let i = 0; i < cData.length; i += 4) {
      cData[i] = Math.min(255, cData[i] * 1.05);
      cData[i + 1] = Math.min(255, cData[i + 1] * 1.05);
      cData[i + 2] = Math.min(255, cData[i + 2] * 1.05);
    }
    fctx.putImageData(croppedData, 0, 0);

    return finalCanvas;
  }

  // Core transform: optional 90° steps, then auto-center crop + brighten.
  function transformAndStore(side, base64, rotateSteps = 0) {
    if (!base64) {
      showToast("No photo to transform.", "error");
      return;
    }

    const img = new Image();
    img.onload = () => {
      const angle = ((rotateSteps % 4) + 4) % 4;

      // First canvas: apply rotation only.
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      let w = img.width;
      let h = img.height;

      if (angle % 2 === 1) {
        canvas.width = h;
        canvas.height = w;
      } else {
        canvas.width = w;
        canvas.height = h;
      }

      switch (angle) {
        case 1: // 90° CW
          ctx.translate(canvas.width, 0);
          ctx.rotate(Math.PI / 2);
          break;
        case 2: // 180°
          ctx.translate(canvas.width, canvas.height);
          ctx.rotate(Math.PI);
          break;
        case 3: // 270° CW
          ctx.translate(0, canvas.height);
          ctx.rotate(-Math.PI / 2);
          break;
        default:
          break;
      }

      ctx.drawImage(img, 0, 0);

      // Auto-center + rim-preserving crop
      const finalCanvas = autoCenterCrop(canvas);
      const finalDataURL = finalCanvas.toDataURL("image/jpeg", 0.9);

      if (side === "front") {
        tempPhotoFront = finalDataURL;
        const imgEl = document.getElementById("photo-front-preview");
        if (imgEl) {
          imgEl.src = finalDataURL;
          imgEl.classList.remove("hidden");
        }
      } else {
        tempPhotoBack = finalDataURL;
        const imgEl = document.getElementById("photo-back-preview");
        if (imgEl) {
          imgEl.src = finalDataURL;
          imgEl.classList.remove("hidden");
        }
      }
    };

    img.onerror = () => {
      showToast("Photo processing failed. Try another image.", "error");
    };

    img.src = base64;
  }

  function processImageFile(side, file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please upload a JPG or PNG image.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result;
      transformAndStore(side, base64, 0);
      showToast("Photo added.", "info");
    };
    reader.onerror = () => {
      showToast("Photo processing failed. Try another image.", "error");
    };
    reader.readAsDataURL(file);
  }

  function handlePhotoUpload(side, event) {
    const file = event.target.files[0];
    processImageFile(side, file);
  }

  function handlePhotoDragOver(event) {
    event.preventDefault();
    const dz = event.currentTarget;
    if (dz && dz.classList) dz.classList.add("dragover");
  }

  function handlePhotoDragLeave(event) {
    event.preventDefault();
    const dz = event.currentTarget;
    if (dz && dz.classList) dz.classList.remove("dragover");
  }

  function handlePhotoDrop(side, event) {
    event.preventDefault();
    const dz = event.currentTarget;
    if (dz && dz.classList) dz.classList.remove("dragover");

    const files = event.dataTransfer?.files;
    if (!files || !files.length) return;
    const file = files[0];
    processImageFile(side, file);
  }

  // Rotate button — single clockwise step
  function rotatePhoto(side) {
    const current = side === "front" ? tempPhotoFront : tempPhotoBack;
    if (!current) {
      showToast("Add a photo first.", "error");
      return;
    }
    transformAndStore(side, current, 1);
    showToast("Photo rotated.", "info");
  }

  // Swap button — swap front/back photos
  function swapPhotos() {
    if (!tempPhotoFront && !tempPhotoBack) {
      showToast("No photos to swap.", "error");
      return;
    }
    const fPrev = document.getElementById("photo-front-preview");
    const bPrev = document.getElementById("photo-back-preview");

    [tempPhotoFront, tempPhotoBack] = [tempPhotoBack, tempPhotoFront];

    if (fPrev) {
      if (tempPhotoFront) {
        fPrev.src = tempPhotoFront;
        fPrev.classList.remove("hidden");
      } else {
        fPrev.src = "";
        fPrev.classList.add("hidden");
      }
    }
    if (bPrev) {
      if (tempPhotoBack) {
        bPrev.src = tempPhotoBack;
        bPrev.classList.remove("hidden");
      } else {
        bPrev.src = "";
        bPrev.classList.add("hidden");
      }
    }
    showToast("Front and back photos swapped.", "info");
  }

  function clearPhoto(side) {
    if (side === "front") {
      tempPhotoFront = "";
      const img = document.getElementById("photo-front-preview");
      const input = document.getElementById("photo-front-input");
      if (img) {
        img.src = "";
        img.classList.add("hidden");
      }
      if (input) input.value = "";
    } else {
      tempPhotoBack = "";
      const img = document.getElementById("photo-back-preview");
      const input = document.getElementById("photo-back-input");
      if (img) {
        img.src = "";
        img.classList.add("hidden");
      }
      if (input) input.value = "";
    }
    showToast("Photo cleared.", "info");
  }

  // ========= EDIT / DELETE =========
  function editCoin(id) {
    const coin = coins.find((c) => c.id === id);
    if (!coin) return;

    editingCoinId = id;
    tempPhotoFront = coin.photoFront || "";
    tempPhotoBack = coin.photoBack || "";

    const typeEl = document.getElementById("coin-type");
    const customEl = document.getElementById("coin-custom-name");
    const yearEl = document.getElementById("coin-year");
    const condEl = document.getElementById("coin-condition");
    const condLabel = document.getElementById("condition-label");
    const notesEl = document.getElementById("coin-notes");
    const metallEl = document.getElementById("coin-metallurgy");
    const fPrev = document.getElementById("photo-front-preview");
    const bPrev = document.getElementById("photo-back-preview");
    const fInput = document.getElementById("photo-front-input");
    const bInput = document.getElementById("photo-back-input");

    if (typeEl) typeEl.value = coin.type || "";
    if (customEl) customEl.value = coin.customName || "";
    if (yearEl) yearEl.value = coin.year || "";
    if (condEl) condEl.value = coin.condition || 5;
    if (condLabel)
      condLabel.textContent = `Condition (${coin.condition || 5}/10)`;
    if (notesEl) notesEl.value = coin.notes || "";
    if (metallEl) metallEl.value = coin.metallurgy || "";

    if (fPrev) {
      if (coin.photoFront) {
        fPrev.src = coin.photoFront;
        fPrev.classList.remove("hidden");
      } else {
        fPrev.src = "";
        fPrev.classList.add("hidden");
      }
    }
    if (bPrev) {
      if (coin.photoBack) {
        bPrev.src = coin.photoBack;
        bPrev.classList.remove("hidden");
      } else {
        bPrev.src = "";
        bPrev.classList.add("hidden");
      }
    }
    if (fInput) fInput.value = "";
    if (bInput) bInput.value = "";

    showSection("add");
  }

  function deleteCoin(id) {
    if (!confirm("Delete this coin permanently?")) return;
    coins = coins.filter((c) => c.id !== id);
    localStorage.setItem(STORAGE_KEYS.coins, JSON.stringify(coins));
    renderCollection();
    showToast("Coin deleted.", "success");
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

    // Newest coins on top
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

      let qrBlock = "";
      if (c.qrCode) {
        qrBlock =
          '<img class="qr-image" src="https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=' +
          encodeURIComponent(c.qrCode) +
          '" alt="QR code">';
      }

      card.innerHTML = `
        <h2>${c.displayName} (${c.year})</h2>
        <p><strong>Type:</strong> ${c.type || ""}</p>
        <p><strong>Condition:</strong> ${c.condition || 5}/10</p>
        <p><strong>Metallurgy:</strong> ${
          c.metallurgy ? c.metallurgy : '<span class="muted">Not set</span>'
        }</p>
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

    let csv =
      "Name,Type,Year,Condition,Metallurgy,Notes,QR Code\n";
    list.forEach((c) => {
      csv += `"${(c.displayName || "").replace(/"/g, '""')}",`;
      csv += `"${(c.type || "").replace(/"/g, '""')}",`;
      csv += `${c.year || ""},`;
      csv += `${c.condition || ""},`;
      csv += `"${(c.metallurgy || "").replace(/"/g, '""')}",`;
      csv += `"${(c.notes || "").replace(/"/g, '""')}",`;
      csv += `"${(c.qrCode || "").replace(/"/g, '""')}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "my-coins.csv";
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
  };
})();
