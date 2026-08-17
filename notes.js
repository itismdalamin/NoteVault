import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, onSnapshot, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";
import { initNav, initModals, showToast } from "./shared.js";

initNav();
initModals();

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ---------------------------------------------------------------------
   Resolve the phrase from the URL
   ------------------------------------------------------------------- */
const params = new URLSearchParams(window.location.search);
const phrase = (params.get("phrase") || "").trim().toLowerCase();

const workspaceView = document.getElementById("workspace-view");
const stateView = document.getElementById("state-view");
const stateTitle = document.getElementById("state-title");
const stateDesc = document.getElementById("state-desc");

if (!phrase) {
  window.location.href = "index.html";
  throw new Error("No phrase in URL — redirecting.");
}

const noteRef = doc(db, "notes", phrase);

/* ---------------------------------------------------------------------
   Element refs
   ------------------------------------------------------------------- */
const titleInput = document.getElementById("note-title");
const titleLabel = document.getElementById("title-label");
const textarea = document.getElementById("note-content");
const noteLabel = document.getElementById("note-label");
const charCount = document.getElementById("char-count");
const lastUpdated = document.getElementById("last-updated");
const phraseDisplay = document.getElementById("phrase-display");
const copyBtn = document.getElementById("copy-phrase-btn");
const expirySelect = document.getElementById("expiry-select");
const countdownEl = document.getElementById("countdown-time");
const resetBtn = document.getElementById("reset-timer-btn");
const saveBtn = document.getElementById("save-btn");
const deleteBtn = document.getElementById("delete-btn");
const statusPill = document.getElementById("save-status");
const statusText = document.getElementById("save-status-text");
const clockTime = document.getElementById("clock-time");
const clockDate = document.getElementById("clock-date");

phraseDisplay.textContent = phrase;

function formatCounts(text) {
  const trimmed = text.trim();
  const lines = text.length === 0 ? 0 : text.split(/\n/).length;
  const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
  return `${lines} lines · ${words} words · ${text.length} characters`;
}

/* ---------------------------------------------------------------------
   Floating labels — "Title" / "Write Note"
   ------------------------------------------------------------------- */
function updateFieldLabel(labelEl, fieldEl, restText, floatedText) {
  const active = document.activeElement === fieldEl || fieldEl.value.length > 0;
  labelEl.textContent = active ? floatedText : restText;
  labelEl.classList.toggle("floated", active);
}

function refreshTitleLabel() {
  updateFieldLabel(titleLabel, titleInput, "Title", "Title");
}
function refreshNoteLabel() {
  updateFieldLabel(noteLabel, textarea, "Write Note", "Note");
}

function autoResizeTitle() {
  titleInput.style.height = "auto";
  titleInput.style.height = `${Math.min(titleInput.scrollHeight, 96)}px`;
}

titleInput.addEventListener("input", () => {
  autoResizeTitle();
  refreshTitleLabel();
});
titleInput.addEventListener("focus", refreshTitleLabel);
titleInput.addEventListener("blur", refreshTitleLabel);

textarea.addEventListener("focus", refreshNoteLabel);
textarea.addEventListener("blur", refreshNoteLabel);

/* ---------------------------------------------------------------------
   Duration lookup for the expiry <select>
   ------------------------------------------------------------------- */
const DURATIONS_MS = {
  "5m": 5 * 60 * 1000,
  "10m": 10 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "3h": 3 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
};

/* ---------------------------------------------------------------------
   Live clock
   ------------------------------------------------------------------- */
function tickClock() {
  const now = new Date();
  clockTime.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  clockDate.textContent = now.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
tickClock();
setInterval(tickClock, 1000);

/* ---------------------------------------------------------------------
   Status pill helper
   ------------------------------------------------------------------- */
function setStatus(kind, text) {
  statusPill.classList.remove("saved", "saving", "error");
  if (kind) statusPill.classList.add(kind);
  statusText.textContent = text;
}

/* ---------------------------------------------------------------------
   Countdown + expiry state
   ------------------------------------------------------------------- */
let currentExpiresAt = null;
let hasExpiredLocally = false;

function formatCountdown(msRemaining) {
  if (msRemaining <= 0) return "00:00:00";
  const totalSeconds = Math.floor(msRemaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (days > 0) return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function showExpiredState() {
  if (hasExpiredLocally) return;
  hasExpiredLocally = true;
  workspaceView.style.display = "none";
  stateView.style.display = "flex";
  stateTitle.textContent = "This note has expired";
  stateDesc.textContent = "Its expiry time passed, so the content is no longer accessible. Create a new note if you need to share something else.";
}

function showNotFoundState() {
  workspaceView.style.display = "none";
  stateView.style.display = "flex";
  stateTitle.textContent = "Note not found";
  stateDesc.textContent = "This phrase doesn't match an active note. It may have been deleted or typed incorrectly.";
}

function tickCountdown() {
  if (currentExpiresAt == null || hasExpiredLocally) return;
  const remaining = currentExpiresAt - Date.now();
  if (remaining <= 0) {
    countdownEl.textContent = "00:00:00";
    countdownEl.classList.remove("mid");
    countdownEl.classList.add("low");
    showExpiredState();
    return;
  }
  countdownEl.textContent = formatCountdown(remaining);
  countdownEl.classList.toggle("low", remaining < 60 * 1000);
  countdownEl.classList.toggle("mid", remaining >= 60 * 1000 && remaining < 5 * 60 * 1000);
}
setInterval(tickCountdown, 1000);

/* ---------------------------------------------------------------------
   Realtime Firestore sync
   ------------------------------------------------------------------- */
const unsubscribe = onSnapshot(
  noteRef,
  (snap) => {
    if (!snap.exists()) {
      showNotFoundState();
      return;
    }
    const data = snap.data();

    // expiry
    if (typeof data.expiresAt === "number") {
      currentExpiresAt = data.expiresAt;
      if (currentExpiresAt <= Date.now()) {
        showExpiredState();
        return;
      }
    }
    if (data.expiryLabel) {
      appliedExpiryLabel = data.expiryLabel;
      if (expirySelect.value !== data.expiryLabel) {
        expirySelect.value = data.expiryLabel;
      }
    }
    if (typeof data.customDurationMs === "number") {
      currentCustomDurationMs = data.customDurationMs;
    }
    tickCountdown();

    const remoteTitle = data.title || "";
    if (document.activeElement !== titleInput && titleInput.value !== remoteTitle) {
      titleInput.value = remoteTitle;
      autoResizeTitle();
    }
    refreshTitleLabel();

    const remoteContent = data.content || "";
    if (document.activeElement !== textarea && textarea.value !== remoteContent) {
      textarea.value = remoteContent;
    }
    refreshNoteLabel();
    charCount.textContent = formatCounts(document.activeElement === textarea ? textarea.value : remoteContent);

    if (data.updatedAt && data.updatedAt.toDate) {
      const d = data.updatedAt.toDate();
      lastUpdated.textContent = `Last saved ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    }

    setStatus("saved", "Synced");
  },
  (err) => {
    console.error(err);
    setStatus("error", "Connection error");
    showToast("Lost connection to the note. Changes may not save.", true);
  }
);

/* ---------------------------------------------------------------------
   Autosave (debounced) on typing
   ------------------------------------------------------------------- */
let saveTimer = null;

function scheduleSave() {
  setStatus("saving", "Saving…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveContent, 700);
}

titleInput.addEventListener("input", scheduleSave);

textarea.addEventListener("input", () => {
  charCount.textContent = formatCounts(textarea.value);
  scheduleSave();
});

async function saveContent() {
  try {
    await updateDoc(noteRef, {
      title: titleInput.value,
      content: textarea.value,
      updatedAt: serverTimestamp(),
    });
    setStatus("saved", "Saved");
  } catch (err) {
    console.error(err);
    setStatus("error", "Couldn't save");
    showToast("Autosave failed. Check your connection.", true);
  }
}

saveBtn.addEventListener("click", async () => {
  clearTimeout(saveTimer);
  saveBtn.disabled = true;
  await saveContent();
  saveBtn.disabled = false;
  showToast("Note saved.");
});

let appliedExpiryLabel = "30m";
let currentCustomDurationMs = null;

async function applyExpiryMs(ms, label) {
  const newExpiresAt = Date.now() + ms;
  const payload = { expiresAt: newExpiresAt, expiryLabel: label };
  if (label === "custom") payload.customDurationMs = ms;
  try {
    await updateDoc(noteRef, payload);
    currentExpiresAt = newExpiresAt;
    if (label === "custom") currentCustomDurationMs = ms;
    tickCountdown();
  } catch (err) {
    console.error(err);
    showToast("Couldn't update expiry.", true);
  }
}

expirySelect.addEventListener("change", () => {
  if (expirySelect.value === "custom") {
    expirySelect.value = appliedExpiryLabel;
    openCustomExpiryModal();
    return;
  }
  appliedExpiryLabel = expirySelect.value;
  applyExpiryMs(DURATIONS_MS[expirySelect.value], expirySelect.value);
});

resetBtn.addEventListener("click", async () => {
  if (expirySelect.value === "custom") {
    if (currentCustomDurationMs) {
      await applyExpiryMs(currentCustomDurationMs, "custom");
      showToast("Countdown reset.");
    } else {
      openCustomExpiryModal();
    }
    return;
  }
  await applyExpiryMs(DURATIONS_MS[expirySelect.value], expirySelect.value);
  showToast("Countdown reset.");
});

const customExpiryModal = document.getElementById("modal-custom-expiry");
const ceYears = document.getElementById("ce-years");
const ceMonths = document.getElementById("ce-months");
const ceDays = document.getElementById("ce-days");
const ceHours = document.getElementById("ce-hours");
const ceMinutes = document.getElementById("ce-minutes");
const customExpiryPreview = document.getElementById("custom-expiry-preview");
const customExpiryError = document.getElementById("custom-expiry-error");
const applyCustomExpiryBtn = document.getElementById("apply-custom-expiry-btn");

const MAX_CUSTOM_YEARS = 6;

function computeCustomTarget() {
  const years = parseInt(ceYears.value, 10) || 0;
  const months = parseInt(ceMonths.value, 10) || 0;
  const days = parseInt(ceDays.value, 10) || 0;
  const hours = parseInt(ceHours.value, 10) || 0;
  const minutes = parseInt(ceMinutes.value, 10) || 0;

  const now = new Date();
  const target = new Date(now);
  target.setFullYear(target.getFullYear() + years);
  target.setMonth(target.getMonth() + months);
  target.setDate(target.getDate() + days);
  target.setHours(target.getHours() + hours);
  target.setMinutes(target.getMinutes() + minutes);

  const maxDate = new Date(now);
  maxDate.setFullYear(maxDate.getFullYear() + MAX_CUSTOM_YEARS);

  return {
    target,
    totalMs: target.getTime() - now.getTime(),
    isZero: target.getTime() <= now.getTime(),
    overMax: target.getTime() > maxDate.getTime(),
  };
}

function formatCustomPreviewDate(date) {
  const day = date.getDate();
  const month = date.toLocaleString("en-US", { month: "long" });
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours === 0 ? 12 : hours;
  return `${day} ${month} ${year} at ${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
}

function updateCustomExpiryPreview() {
  const { target, isZero, overMax } = computeCustomTarget();

  if (overMax) {
    customExpiryError.textContent = `Maximum limit is ${MAX_CUSTOM_YEARS} years — please choose a shorter duration.`;
    customExpiryPreview.innerHTML = 'Your note expires on <span class="preview-date"><strong>—</strong></span>';
    applyCustomExpiryBtn.disabled = true;
    return;
  }
  if (isZero) {
    customExpiryError.textContent = "Enter at least a few minutes so the note has time to be read.";
    customExpiryPreview.innerHTML = 'Your note expires on <span class="preview-date"><strong>—</strong></span>';
    applyCustomExpiryBtn.disabled = true;
    return;
  }
  customExpiryError.textContent = "";
  applyCustomExpiryBtn.disabled = false;
  customExpiryPreview.innerHTML = `Your note expires on <span class="preview-date"><strong>${formatCustomPreviewDate(target)}</strong></span>`;
}

[ceYears, ceMonths, ceDays, ceHours, ceMinutes].forEach((input) => {
  input.addEventListener("input", updateCustomExpiryPreview);
});

document.querySelectorAll(".stepper-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = document.getElementById(btn.dataset.target);
    const step = parseInt(btn.dataset.step, 10);
    const min = parseInt(target.min, 10);
    const max = parseInt(target.max, 10);
    let value = (parseInt(target.value, 10) || 0) + step;
    value = Math.min(max, Math.max(min, value));
    target.value = value;
    target.dispatchEvent(new Event("input", { bubbles: true }));
  });
});

function openCustomExpiryModal() {
  customExpiryModal.classList.add("open");
  updateCustomExpiryPreview();
  ceYears.focus();
}

applyCustomExpiryBtn.addEventListener("click", async () => {
  const { totalMs, isZero, overMax } = computeCustomTarget();
  if (isZero || overMax) return;

  applyCustomExpiryBtn.disabled = true;
  applyCustomExpiryBtn.classList.add("is-loading");
  try {
    appliedExpiryLabel = "custom";
    await applyExpiryMs(totalMs, "custom");
    customExpiryModal.classList.remove("open");
    showToast("Custom expiry set.");
  } catch (err) {
    console.error(err);
    showToast("Couldn't set custom expiry.", true);
  } finally {
    applyCustomExpiryBtn.disabled = false;
    applyCustomExpiryBtn.classList.remove("is-loading");
  }
});

/* ---------------------------------------------------------------------
   Copy phrase
   ------------------------------------------------------------------- */
copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(phrase);
    showToast("Phrase copied to clipboard.");
  } catch {
    showToast("Couldn't copy — select and copy the phrase manually.", true);
  }
});

const deleteModal = document.getElementById("modal-delete-confirm");
const deletePhraseName = document.getElementById("delete-phrase-name");
const confirmDeleteBtn = document.getElementById("confirm-delete-btn");
deletePhraseName.textContent = phrase;

deleteBtn.addEventListener("click", () => {
  deleteModal.classList.add("open");
});

confirmDeleteBtn.addEventListener("click", async () => {
  confirmDeleteBtn.disabled = true;
  confirmDeleteBtn.classList.add("is-loading");
  try {
    unsubscribe();
    await deleteDoc(noteRef);
    window.location.href = "index.html";
  } catch (err) {
    console.error(err);
    confirmDeleteBtn.disabled = false;
    confirmDeleteBtn.classList.remove("is-loading");
    deleteModal.classList.remove("open");
    showToast("Couldn't delete the note. Try again.", true);
  }
});

window.addEventListener("beforeunload", () => {
  if (saveTimer) clearTimeout(saveTimer);
});
