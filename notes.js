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
const textarea = document.getElementById("note-content");
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
  const words = text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
  return `${words} words · ${text.length} characters`;
}

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
let suppressNextContentSync = false;

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
    if (data.expiryLabel && expirySelect.value !== data.expiryLabel) {
      expirySelect.value = data.expiryLabel;
    }
    tickCountdown();

    const remoteContent = data.content || "";
    if (document.activeElement !== textarea && textarea.value !== remoteContent) {
      textarea.value = remoteContent;
    }
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
   Autosave on typing
   ------------------------------------------------------------------- */
let saveTimer = null;

textarea.addEventListener("input", () => {
  charCount.textContent = formatCounts(textarea.value);
  setStatus("saving", "Saving…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveContent, 700);
});

async function saveContent() {
  try {
    await updateDoc(noteRef, {
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

async function applyExpiry(label) {
  const ms = DURATIONS_MS[label];
  if (!ms) return;
  const newExpiresAt = Date.now() + ms;
  try {
    await updateDoc(noteRef, { expiresAt: newExpiresAt, expiryLabel: label });
    currentExpiresAt = newExpiresAt;
    tickCountdown();
  } catch (err) {
    console.error(err);
    showToast("Couldn't update expiry.", true);
  }
}

expirySelect.addEventListener("change", () => applyExpiry(expirySelect.value));

resetBtn.addEventListener("click", async () => {
  await applyExpiry(expirySelect.value);
  showToast("Countdown reset.");
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