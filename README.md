# NoteVault

A dark-themed, account-free note-sharing site. Anyone can write a note and get a
unique three-word phrase; anyone with that phrase can open, edit, and watch it
sync in real time until it expires.

## Files

```
index.html          Landing page (create / load a note)
notes.html           Note workspace (editor, phrase, expiry, countdown)
style.css            Shared design system for both pages
shared.js             Nav toggle, About/Privacy modals, toast helper
words.js              3 word sets + phrase generator (see note below)
firebase-config.js    Your Firebase project credentials go here
app.js                Landing page logic
notes.js               Workspace page logic (Firestore realtime sync)
```

## 1. Create a Firebase project

1. Go to the [Firebase console](https://console.firebase.google.com/) and create a project.
2. In the project, open **Build → Firestore Database** and click **Create database**
   (start in production mode — you'll add rules below).
3. Open **Project settings → General → Your apps**, click the **</>** (web) icon,
   register an app, and copy the `firebaseConfig` object it gives you.
4. Paste those values into `firebase-config.js`.

## 2. Firestore data model

Every note is a single document in a `notes` collection, keyed by its phrase:

```
notes/{phrase}
  content: string
  createdAt: server timestamp
  updatedAt: server timestamp
  expiresAt: number (ms since epoch)
  expiryLabel: string ("5m", "30m", "1h", "1d", ... — matches the <select>)
```

Using the phrase itself as the document ID is what makes "enter the phrase → load
the note" a single `getDoc`/`onSnapshot` call with no extra index or query.

## 3. Firestore security rules

The app reads and writes only by exact document ID (the phrase acts as the
shared secret), so a reasonable rule set is:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /notes/{phrase} {
      allow get, update, delete: if true;
      allow create: if request.resource.data.keys().hasAll(
        ['content', 'createdAt', 'updatedAt', 'expiresAt', 'expiryLabel']
      );
      allow list: if false; // phrases must be known, never enumerated
    }
  }
}
```

`allow list: if false` is important — it stops anyone from browsing every note
in the collection; a note can only be reached by already knowing its exact
phrase. For a production deployment you may also want to rate-limit writes
(e.g. via App Check) since these rules are intentionally open to keep the
"no accounts" experience working.

## 4. Word lists (3-word phrase)

`words.js` ships with three curated ~150-word sets (adjectives, creatures,
objects/places). One word is picked from each, the trio is shuffled, and
they're joined with hyphens — e.g. `lantern-amber-falcon`. That's already
~20 million possible phrases.

The brief called for 1,000 words per set (3,000 total) — to use your own
lists, just replace the contents of `SET_A`, `SET_B`, and `SET_C` in
`words.js` with your word arrays. Nothing else in the app needs to change.

## 5. Run it

This is a static site (no build step). Serve the folder with any static
server, for example:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open `index.html` in your browser. Because the pages use ES module
`<script type="module">` imports, you must load them over `http://` (a local
server) rather than opening the file directly with `file://`.

## Notes on expiry

Expiry is enforced on the client: `notes.js` compares `expiresAt` to the
current time every second and blocks the editor once it's passed. This is
sufficient for a "note disappears from the app" experience. If you need a
guarantee that expired content is unrecoverable, add a scheduled Cloud
Function (or a TTL policy on the `expiresAt` field, which Firestore supports
natively) to delete expired documents server-side.
