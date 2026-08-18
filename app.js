import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";
import { generatePhrase, normalizePhrase } from "./words.js?v=1";
import { initNav, initModals, showToast } from "./shared.js?v=1";

initNav();
initModals();

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const DEFAULT_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes, matches notes.html default select
const WRONG_PHRASE_COOLDOWN_SECONDS = 3;

const createBtn = document.getElementById("create-note-btn");
const loadForm = document.getElementById("load-form");
const loadBtn = document.getElementById("load-btn");
const loadError = document.getElementById("load-error");
const wordInputs = [
  document.getElementById("word-1"),
  document.getElementById("word-2"),
  document.getElementById("word-3"),
];

const CREATE_BTN_DEFAULT_HTML = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  Create new note`;
const LOAD_BTN_DEFAULT_TEXT = "Load note";

/*
  Unique Phrase
 */
async function generateUniquePhrase() {
  for (let attempt = 0; attempt < 8; attempt++) {
    const phrase = generatePhrase();
    const snap = await getDoc(doc(db, "notes", phrase));
    if (!snap.exists()) return phrase;
  }
  return `${generatePhrase()}-${Math.floor(Math.random() * 999)}`;
}

createBtn.addEventListener("click", async () => {
  createBtn.disabled = true;
  createBtn.classList.add("is-loading");
  createBtn.textContent = "Creating…";
  try {
    const phrase = await generateUniquePhrase();
    const now = Date.now();
    await setDoc(doc(db, "notes", phrase), {
      content: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      expiresAt: now + DEFAULT_EXPIRY_MS,
      expiryLabel: "30m",
    });
    window.location.href = `notes.html?phrase=${encodeURIComponent(phrase)}`;
  } catch (err) {
    console.error(err);
    showToast("Couldn't create a note. Check your connection and try again.", true);
    createBtn.disabled = false;
    createBtn.classList.remove("is-loading");
    createBtn.innerHTML = CREATE_BTN_DEFAULT_HTML;
  }
});


function splitPastedPhrase(rawText) {
  return rawText
    .split(/[^a-zA-Z]+/)
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
}

wordInputs.forEach((input, i) => {
  input.addEventListener("input", () => {
    const words = splitPastedPhrase(input.value);
    if (words.length >= 2) {
      words.slice(0, wordInputs.length).forEach((word, idx) => {
        wordInputs[idx].value = word;
      });
      const lastFilledIndex = Math.min(words.length, wordInputs.length) - 1;
      (wordInputs[lastFilledIndex] || loadBtn).focus();
      return;
    }
    input.value = input.value.replace(/[^a-zA-Z]/g, "").toLowerCase();
  });

  input.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "-") && wordInputs[i + 1]) {
      e.preventDefault();
      wordInputs[i + 1].focus();
    }
    if (e.key === "Backspace" && input.value === "" && wordInputs[i - 1]) {
      wordInputs[i - 1].focus();
    }
  });

  input.addEventListener("paste", (e) => {
    const clipboard = e.clipboardData || window.clipboardData;
    const text = clipboard ? clipboard.getData("text") : "";
    const words = splitPastedPhrase(text);

    if (words.length < 2) return;
    e.preventDefault();
    words.slice(0, wordInputs.length).forEach((word, idx) => {
      wordInputs[idx].value = word;
    });
    const lastFilledIndex = Math.min(words.length, wordInputs.length) - 1;
    (wordInputs[lastFilledIndex] || loadBtn).focus();
  });
});

/* ---------------------------------------------------------------------
   Load form — with a short cooldown
   ------------------------------------------------------------------- */

let cooldownInterval = null;

function startCooldown(seconds) {
  let remaining = seconds;
  loadBtn.disabled = true;
  loadBtn.classList.add("is-loading");
  loadBtn.textContent = `Try again in ${remaining}s`;

  clearInterval(cooldownInterval);
  cooldownInterval = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(cooldownInterval);
      loadBtn.disabled = false;
      loadBtn.classList.remove("is-loading");
      loadBtn.textContent = LOAD_BTN_DEFAULT_TEXT;
    } else {
      loadBtn.textContent = `Try again in ${remaining}s`;
    }
  }, 1000);
}

loadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loadError.textContent = "";

  const values = wordInputs.map((i) => i.value.trim());
  if (values.some((v) => v.length === 0)) {
    loadError.textContent = "Fill in all three words to load a note.";
    return;
  }

  const phrase = normalizePhrase(values);
  loadBtn.disabled = true;
  loadBtn.classList.add("is-loading");
  loadBtn.textContent = "Checking…";

  try {
    const snap = await getDoc(doc(db, "notes", phrase));
    const now = Date.now();
    if (!snap.exists() || (snap.data().expiresAt && snap.data().expiresAt < now)) {
      loadError.textContent = "No active note matches that phrase. Double-check the words and try again.";
      startCooldown(WRONG_PHRASE_COOLDOWN_SECONDS);
      return;
    }
    window.location.href = `notes.html?phrase=${encodeURIComponent(phrase)}`;
  } catch (err) {
    console.error(err);
    loadError.textContent = "Something went wrong while checking that phrase. Try again.";
    loadBtn.disabled = false;
    loadBtn.classList.remove("is-loading");
    loadBtn.textContent = LOAD_BTN_DEFAULT_TEXT;
  }
});
