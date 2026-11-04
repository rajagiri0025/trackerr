/**
 * Daily Video Tracker - Excel Spreadsheet Application
 * Hybrid Cloud (MongoDB Atlas) & Local-First Architecture
 */

const STORAGE_KEY = "videoTracker.v1";
const THEME_KEY = "videoTracker.theme";

// State
let items = [];
let selectedRowIds = new Set();
let activeSheetTab = "all";
let searchQuery = "";
let recentlyDeleted = null;
let activeFocusedCell = null;
let isCloudConnected = false;
let cloudNeedsUsername = false;

const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

// --------------------------------------------------------------------------
// API & STORAGE LAYER
// --------------------------------------------------------------------------

const API_BASE = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
const apiUrl = (path) => `${API_BASE}${path.startsWith('/') ? path : '/' + path}`;

// MongoDB-first: warn in console if no backend URL is configured
if (!API_BASE) {
  console.warn("⚠️ VITE_API_URL is not set. Data will only be saved to localStorage. Set it to your Render backend URL.");
}

async function checkCloudStatus() {
  try {
    const res = await fetch(apiUrl("/api/status"));
    if (!res.ok) throw new Error("Status check failed");
    const data = await res.json();
    isCloudConnected = !!data.connected;
    cloudNeedsUsername = !!data.needsUsername;
    updateStorageBadge();
    return data;
  } catch (e) {
    isCloudConnected = false;
    updateStorageBadge();
    return { connected: false, error: e.message };
  }
}

function updateStorageBadge() {
  const indicator = $("saveIndicator");
  if (!indicator) return;

  if (isCloudConnected) {
    indicator.innerHTML = `
      <svg width="10" height="10" viewBox="0 0 24 24" fill="#10b981">
        <circle cx="12" cy="12" r="10"></circle>
      </svg>
      MongoDB Atlas Live
    `;
    indicator.style.color = "#10b981";
  } else if (!API_BASE) {
    indicator.innerHTML = `
      <svg width="10" height="10" viewBox="0 0 24 24" fill="#ef4444">
        <circle cx="12" cy="12" r="10"></circle>
      </svg>
      ⚠️ No Backend URL Set
    `;
    indicator.style.color = "#ef4444";
    indicator.title = "Set VITE_API_URL to your Render backend URL in Netlify env vars";
  } else if (cloudNeedsUsername) {
    indicator.innerHTML = `
      <svg width="10" height="10" viewBox="0 0 24 24" fill="#f59e0b">
        <circle cx="12" cy="12" r="10"></circle>
      </svg>
      Set MongoDB Username
    `;
    indicator.style.color = "#f59e0b";
  } else {
    indicator.innerHTML = `
      <svg width="10" height="10" viewBox="0 0 24 24" fill="#f59e0b">
        <circle cx="12" cy="12" r="10"></circle>
      </svg>
      LocalStorage Only
    `;
    indicator.style.color = "#f59e0b";
  }
}

async function loadData() {
  // Load from localStorage instantly for immediate render
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    items = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(items)) items = [];
  } catch (e) {
    items = [];
  }
  render(); // show cached data immediately

  // Now try MongoDB as the source of truth
  const status = await checkCloudStatus();
  if (status.connected) {
    try {
      const res = await fetch(apiUrl("/api/videos"));
      if (res.ok) {
        const cloudVideos = await res.json();
        if (Array.isArray(cloudVideos)) {
          if (cloudVideos.length > 0) {
            // MongoDB has data — use it as the truth
            items = cloudVideos;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
          } else if (items.length > 0) {
            // MongoDB is empty but we have local data — migrate it up
            showToast("Migrating local data to MongoDB...");
            await syncToCloud();
          }
        }
      }
    } catch (err) {
      console.warn("Could not fetch from MongoDB, using local cache", err);
    }
  }

  render();
}

function saveDataLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {}
}

async function syncToCloud() {
  if (!isCloudConnected || !items.length) return;
  try {
    const res = await fetch(apiUrl("/api/videos/sync"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items })
    });
    if (res.ok) {
      showToast("Synced spreadsheet with MongoDB Atlas!");
    }
  } catch (err) {
    console.error("Cloud sync failed", err);
  }
}

// --------------------------------------------------------------------------
// BUSINESS LOGIC & PROGRESS
// --------------------------------------------------------------------------

function calculateProgress(it) {
  if (it.yt && it.ig) return 100;
  let score = 0;
  if (it.edit) score = 20;
  if (it.sent) score = 50;
  if (it.yt) score += 25;
  if (it.ig) score += 25;
  return Math.min(100, score);
}

// Insert Row
async function insertRow(name = "", date = todayISO()) {
  const newRow = {
    id: "r_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
    name: name,
    date: date || todayISO(),
    edit: true,
    sent: false,
    yt: false,
    ig: false,
    createdAt: new Date().toISOString()
  };

  // Save to MongoDB first (primary storage)
  if (isCloudConnected) {
    try {
      await fetch(apiUrl("/api/videos"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRow)
      });
    } catch (e) {
      console.error("Failed to post to MongoDB Atlas", e);
      showToast("⚠️ Could not save to MongoDB. Saved locally only.");
    }
  }

  // Update local state & localStorage as cache
  items.unshift(newRow);
  saveDataLocal();
  render();

  setTimeout(() => {
    const input = document.querySelector(`input[data-id="${newRow.id}"][data-col="name"]`);
    if (input) {
      input.focus();
      input.select();
    }
  }, 50);

  return newRow;
}

// Toggle cell checkboxes
async function toggleStatus(id, field, value) {
  const item = items.find((x) => x.id === id);
  if (!item) return;

  item[field] = value;

  // Sent ticked -> To edit off (unticking Sent puts it back to To edit)
  if (field === "sent") {
    item.edit = !value;
  }
  // To edit ticked -> Sent off
  if (field === "edit" && value) {
    item.sent = false;
  }

  saveDataLocal();
  render();

  if (isCloudConnected) {
    try {
      await fetch(apiUrl(`/api/videos/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: item[field], edit: item.edit, sent: item.sent })
      });
    } catch (e) {
      console.error("Failed to update in MongoDB Atlas", e);
    }
  }
}

// Rename Video
let renameDebounceTimeout = null;
function handleRename(id, newName) {
  const item = items.find((x) => x.id === id);
  if (!item) return;
  item.name = newName;
  saveDataLocal();

  if (isCloudConnected) {
    clearTimeout(renameDebounceTimeout);
    renameDebounceTimeout = setTimeout(async () => {
      try {
        await fetch(apiUrl(`/api/videos/${id}`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName })
        });
      } catch (e) {}
    }, 400);
  }
}

// Update Date
async function handleDateChange(id, newDate) {
  const item = items.find((x) => x.id === id);
  if (!item) return;
  item.date = newDate;
  saveDataLocal();

  if (isCloudConnected) {
    try {
      await fetch(apiUrl(`/api/videos/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: newDate })
      });
    } catch (e) {}
  }
}

// Delete Row with Undo
async function deleteRow(id) {
  const idx = items.findIndex((x) => x.id === id);
  if (idx === -1) return;

  const deleted = items[idx];
  items.splice(idx, 1);
  selectedRowIds.delete(id);
  saveDataLocal();
  render();

  if (recentlyDeleted && recentlyDeleted.timeoutId) {
    clearTimeout(recentlyDeleted.timeoutId);
  }

  const timeoutId = setTimeout(async () => {
    if (isCloudConnected) {
      try {
        await fetch(apiUrl(`/api/videos/${id}`), { method: "DELETE" });
      } catch (e) {}
    }
    recentlyDeleted = null;
  }, 5500);

  recentlyDeleted = {
    items: [{ item: deleted, index: idx }],
    timeoutId
  };

  showToast(`Deleted row: "${deleted.name || "Untitled"}"`, true);
}

function undoDelete() {
  if (!recentlyDeleted || !recentlyDeleted.items) return;
  clearTimeout(recentlyDeleted.timeoutId);

  recentlyDeleted.items.forEach(({ item, index }) => {
    items.splice(Math.min(index, items.length), 0, item);
    if (isCloudConnected) {
      fetch(apiUrl("/api/videos"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item)
      });
    }
  });

  recentlyDeleted = null;
  saveDataLocal();
  render();
  showToast("Restored deleted row!");
}

// Filter Rows
function getFilteredRows() {
  return items.filter((x) => {
    if (searchQuery && !x.name.toLowerCase().includes(searchQuery)) return false;
    if (activeSheetTab === "edit" && !x.edit) return false;
    if (activeSheetTab === "sent" && !x.sent) return false;
    if (activeSheetTab === "yt" && !x.yt) return false;
    if (activeSheetTab === "ig" && !x.ig) return false;
    if (activeSheetTab === "done" && !(x.yt && x.ig)) return false;
    return true;
  });
}

// --------------------------------------------------------------------------
// RENDER SPREADSHEET
// --------------------------------------------------------------------------

function render() {
  const list = getFilteredRows();
  const tbody = $("sheetBody");

  tbody.innerHTML = list.map((it, idx) => {
    const rowNum = idx + 1;
    const isSelected = selectedRowIds.has(it.id);
    const progress = calculateProgress(it);
    const isDone = it.yt && it.ig;
    const progressColor = isDone ? "var(--stage-sent)" : progress > 50 ? "var(--excel-green)" : "var(--stage-edit)";

    return `
      <tr class="${isSelected ? "selected" : ""}" data-id="${it.id}" data-row="${rowNum}">
        <td class="cell-index row-select" data-id="${it.id}" title="Click to select row ${rowNum}">
          ${rowNum}
        </td>

        <td class="cell-date">
          <input type="date" value="${it.date || ""}" data-id="${it.id}" data-col="date" aria-label="Date">
        </td>

        <td class="cell-name">
          <input type="text" class="cell-input" value="${escapeHtml(it.name)}" placeholder="Enter project name..." data-id="${it.id}" data-col="name" data-row="${rowNum}" aria-label="Project name">
        </td>

        <td class="cell-checkbox">
          <button type="button" class="excel-check-btn c-edit ${it.edit ? "checked" : ""}" data-action="toggle" data-f="edit" data-id="${it.id}">
            ${it.edit ? "✓ Yes" : "No"}
          </button>
        </td>

        <td class="cell-checkbox">
          <button type="button" class="excel-check-btn c-sent ${it.sent ? "checked" : ""}" data-action="toggle" data-f="sent" data-id="${it.id}">
            ${it.sent ? "✓ Sent" : "No"}
          </button>
        </td>

        <td class="cell-checkbox">
          <button type="button" class="excel-check-btn c-yt ${it.yt ? "checked" : ""}" data-action="toggle" data-f="yt" data-id="${it.id}">
            ${it.yt ? "✓ Posted" : "No"}
          </button>
        </td>

        <td class="cell-checkbox">
          <button type="button" class="excel-check-btn c-ig ${it.ig ? "checked" : ""}" data-action="toggle" data-f="ig" data-id="${it.id}">
            ${it.ig ? "✓ Posted" : "No"}
          </button>
        </td>

        <td class="cell-progress">
          <div class="progress-cell-wrap">
            <span class="progress-text" style="color:${progressColor}">${progress}%</span>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width:${progress}%; background:${progressColor};"></div>
            </div>
          </div>
        </td>

        <td class="cell-actions">
          <button type="button" class="btn-row-del" data-action="delete" data-id="${it.id}" title="Delete row">
            ✕
          </button>
        </td>
      </tr>
    `;
  }).join("");

  updateSummaries(list);
}

function updateSummaries(list) {
  const total = items.length;
  const countEdit = items.filter((x) => x.edit).length;
  const countSent = items.filter((x) => x.sent).length;
  const countYt = items.filter((x) => x.yt).length;
  const countIg = items.filter((x) => x.ig).length;
  const countDone = items.filter((x) => x.yt && x.ig).length;
  const avgRate = total ? Math.round((countDone / total) * 100) : 0;

  $("statTotal").textContent = total;
  $("statEdit").textContent = countEdit;
  $("statSent").textContent = countSent;
  $("statYt").textContent = countYt;
  $("statIg").textContent = countIg;
  $("statRate").textContent = `${avgRate}%`;

  $("summaryTotal").textContent = `${list.length} Row${list.length !== 1 ? "s" : ""}`;
  $("summaryEdit").textContent = `${list.filter((x) => x.edit).length} To Edit`;
  $("summarySent").textContent = `${list.filter((x) => x.sent).length} Sent`;
  $("summaryYt").textContent = `${list.filter((x) => x.yt).length} on YT`;
  $("summaryIg").textContent = `${list.filter((x) => x.ig).length} on IG`;

  const listDone = list.filter((x) => x.yt && x.ig).length;
  const listRate = list.length ? Math.round((listDone / list.length) * 100) : 0;
  $("summaryRate").textContent = `${listRate}% Avg`;

  $("sheetCountInfo").textContent = `Showing ${list.length} of ${total} rows ${isCloudConnected ? "• ☁️ MongoDB Atlas" : ""}`;

  const btnDelSelected = $("btnDeleteSelected");
  if (btnDelSelected) {
    if (selectedRowIds.size > 0) {
      btnDelSelected.style.display = "inline-flex";
      $("selectedCountText").textContent = selectedRowIds.size;
    } else {
      btnDelSelected.style.display = "none";
    }
  }
}

// --------------------------------------------------------------------------
// EXPORT & IMPORT
// --------------------------------------------------------------------------

function exportExcelCSV() {
  if (items.length === 0) {
    showToast("Sheet is empty!");
    return;
  }

  const headers = ["Row", "Date", "Project Name", "To Edit", "Sent Review", "YouTube", "Instagram", "Progress %", "Created At"];
  const rows = items.map((it, idx) => {
    const prog = calculateProgress(it);
    return [
      idx + 1,
      `"${it.date || ""}"`,
      `"${(it.name || "").replace(/"/g, '""')}"`,
      it.edit ? "YES" : "NO",
      it.sent ? "YES" : "NO",
      it.yt ? "YES" : "NO",
      it.ig ? "YES" : "NO",
      `"${prog}%"`,
      `"${it.createdAt || ""}"`
    ];
  });

  const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Daily_Video_Tracker_${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("Excel CSV exported successfully!");
}

function exportJSON() {
  const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(items, null, 2));
  const a = document.createElement("a");
  a.href = jsonStr;
  a.download = `Daily_Video_Tracker_Backup_${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast("JSON backup downloaded!");
}

function handleImport(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result;
      if (file.name.endsWith(".json")) {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          items = parsed;
          saveDataLocal();
          render();
          syncToCloud();
          showToast(`Imported ${parsed.length} rows!`);
          return;
        }
      } else {
        const lines = text.split(/\r?\n/).filter(Boolean);
        if (lines.length > 1) {
          const imported = [];
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(",").map((c) => c.replace(/^"|"$/g, "").trim());
            if (cols.length >= 3) {
              imported.push({
                id: "r_" + Date.now() + "_" + i,
                date: cols[1] || todayISO(),
                name: cols[2] || "Imported Project",
                edit: (cols[3] || "").toUpperCase() === "YES",
                sent: (cols[4] || "").toUpperCase() === "YES",
                yt: (cols[5] || "").toUpperCase() === "YES",
                ig: (cols[6] || "").toUpperCase() === "YES",
                createdAt: new Date().toISOString()
              });
            }
          }
          if (imported.length) {
            items = imported;
            saveDataLocal();
            render();
            syncToCloud();
            showToast(`Imported ${imported.length} rows from CSV!`);
            return;
          }
        }
      }
      showToast("Invalid file format");
    } catch (err) {
      showToast("Error reading file");
    }
  };
  reader.readAsText(file);
}

function loadSampleData() {
  items = [
    { id: "r_1", name: "🔥 M4 MacBook Pro Real World Review", date: todayISO(), edit: false, sent: true, yt: true, ig: true, createdAt: new Date().toISOString() },
    { id: "r_2", name: "📱 iPhone 16 Pro Cinematic 4K Reel", date: todayISO(), edit: false, sent: true, yt: true, ig: false, createdAt: new Date().toISOString() },
    { id: "r_3", name: "⚡ 10 AI Tools Every Creator Needs in 2026", date: todayISO(), edit: false, sent: true, yt: false, ig: false, createdAt: new Date().toISOString() },
    { id: "r_4", name: "🎬 Behind the Scenes - Studio Lighting Setup", date: todayISO(), edit: true, sent: false, yt: false, ig: false, createdAt: new Date().toISOString() },
    { id: "r_5", name: "🎙️ Best Microphone Comparison Under $100", date: todayISO(), edit: true, sent: false, yt: false, ig: false, createdAt: new Date().toISOString() }
  ];
  saveDataLocal();
  render();
  syncToCloud();
  showToast("Loaded 5 sample spreadsheet rows!");
}

function showToast(msg, hasUndo = false) {
  const c = $("toastContainer");
  if (!c) return;

  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `
    <span>${escapeHtml(msg)}</span>
    ${hasUndo ? `<button type="button" class="toast-undo" id="btnToastUndo">Undo</button>` : ""}
  `;
  c.appendChild(t);

  if (hasUndo) {
    t.querySelector("#btnToastUndo")?.addEventListener("click", () => {
      undoDelete();
      t.remove();
    });
  }

  setTimeout(() => {
    t.style.opacity = "0";
    setTimeout(() => t.remove(), 250);
  }, 4500);
}

// --------------------------------------------------------------------------
// THEME & EVENTS
// --------------------------------------------------------------------------

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  updateThemeBtn(saved);

  $("themeToggle")?.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    const nxt = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", nxt);
    localStorage.setItem(THEME_KEY, nxt);
    updateThemeBtn(nxt);
  });
}

function updateThemeBtn(theme) {
  const label = $("themeLabel");
  if (label) {
    label.textContent = theme === "dark" ? "☀️ Light" : "🌙 Dark";
  }
}

function initEvents() {
  $("btnInsertRow")?.addEventListener("click", () => insertRow());
  $("bottomAddRow")?.addEventListener("click", () => insertRow());
  $("mobileAddFab")?.addEventListener("click", () => insertRow());

  $("btnDeleteSelected")?.addEventListener("click", async () => {
    if (selectedRowIds.size === 0) return;
    const ids = Array.from(selectedRowIds);
    items = items.filter((x) => !selectedRowIds.has(x.id));
    selectedRowIds.clear();
    saveDataLocal();
    render();

    if (isCloudConnected) {
      try {
        await fetch(apiUrl("/api/videos/bulk-delete"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids })
        });
      } catch (e) {}
    }

    showToast(`Deleted ${ids.length} rows!`);
  });

  $("btnExportExcel")?.addEventListener("click", exportExcelCSV);
  $("modalExportCsv")?.addEventListener("click", () => { exportExcelCSV(); $("toolsModal").classList.remove("open"); });
  $("modalExportJson")?.addEventListener("click", () => { exportJSON(); $("toolsModal").classList.remove("open"); });

  $("btnImportTrigger")?.addEventListener("click", () => $("fileImportInput").click());
  $("fileImportInput")?.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImport(e.target.files[0]);
    }
  });

  $("btnSampleVideos")?.addEventListener("click", loadSampleData);
  $("modalLoadSample")?.addEventListener("click", () => { loadSampleData(); $("toolsModal").classList.remove("open"); });

  $("modalClearAll")?.addEventListener("click", async () => {
    if (confirm("Are you sure you want to clear this entire spreadsheet?")) {
      const allIds = items.map(x => x.id);
      items = [];
      selectedRowIds.clear();
      saveDataLocal();
      render();
      $("toolsModal").classList.remove("open");

      if (isCloudConnected && allIds.length) {
        try {
          await fetch(apiUrl("/api/videos/bulk-delete"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: allIds })
          });
        } catch (e) {}
      }

      showToast("Spreadsheet cleared");
    }
  });

  $("sheetSearch")?.addEventListener("input", (e) => {
    searchQuery = (e.target.value || "").trim().toLowerCase();
    render();
  });

  $("formulaInput")?.addEventListener("input", (e) => {
    if (activeFocusedCell) {
      activeFocusedCell.value = e.target.value;
      handleRename(activeFocusedCell.dataset.id, e.target.value);
    }
  });

  $("excelGrid")?.addEventListener("click", (e) => {
    const target = e.target;

    const rowSelect = target.closest(".row-select");
    if (rowSelect) {
      const id = rowSelect.dataset.id;
      if (selectedRowIds.has(id)) selectedRowIds.delete(id);
      else selectedRowIds.add(id);
      render();
      return;
    }

    const toggleBtn = target.closest('[data-action="toggle"]');
    if (toggleBtn) {
      const id = toggleBtn.dataset.id;
      const field = toggleBtn.dataset.f;
      const item = items.find((x) => x.id === id);
      if (item) toggleStatus(id, field, !item[field]);
      return;
    }

    const delBtn = target.closest('[data-action="delete"]');
    if (delBtn) {
      deleteRow(delBtn.dataset.id);
      return;
    }
  });

  $("excelGrid")?.addEventListener("input", (e) => {
    const t = e.target;
    const id = t.dataset.id;
    const col = t.dataset.col;

    if (col === "name") {
      if ($("formulaInput")) $("formulaInput").value = t.value;
      handleRename(id, t.value);
    } else if (col === "date") {
      handleDateChange(id, t.value);
    }
  });

  $("excelGrid")?.addEventListener("focusin", (e) => {
    const t = e.target;
    if (t.tagName === "INPUT") {
      activeFocusedCell = t;
      const colLetter = t.dataset.col === "date" ? "A" : "B";
      const rowNum = t.dataset.row || "1";
      $("nameBox").textContent = `${colLetter}${rowNum}`;
      $("formulaInput").value = t.value;
    }
  });

  $("excelGrid")?.addEventListener("keydown", (e) => {
    const t = e.target;
    if (t.tagName !== "INPUT") return;

    const rowNum = parseInt(t.dataset.row || "1", 10);
    const col = t.dataset.col;

    if (e.key === "Enter") {
      e.preventDefault();
      const nextInput = document.querySelector(`input[data-row="${rowNum + 1}"][data-col="${col}"]`);
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
      } else {
        insertRow();
      }
    }
  });

  $$(".sheet-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".sheet-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeSheetTab = tab.dataset.tab;
      render();
    });
  });

  $("btnOpenTools")?.addEventListener("click", () => $("toolsModal").classList.add("open"));
  $("btnCloseTools")?.addEventListener("click", () => $("toolsModal").classList.remove("open"));
  $("toolsModal")?.addEventListener("click", (e) => {
    if (e.target === $("toolsModal")) $("toolsModal").classList.remove("open");
  });

  window.addEventListener("keydown", (e) => {
    const isInput = ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName);

    if (e.key === "Escape") {
      $("toolsModal")?.classList.remove("open");
      document.activeElement?.blur();
      return;
    }

    if (e.ctrlKey && (e.key === "z" || e.key === "Z")) {
      undoDelete();
      return;
    }

    if (isInput) return;

    if (e.key === "/") {
      e.preventDefault();
      $("sheetSearch")?.focus();
    } else if (e.key === "n" || e.key === "N") {
      e.preventDefault();
      insertRow();
    }
  });
}

function init() {
  initTheme();
  initEvents();
  loadData();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
