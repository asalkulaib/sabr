// Copies on this iPhone: snapshots of all the data in a small database of
// their own ('sabr-copies'), taken once a day and just before a restore, a
// reset or bringing back a copy, so a wrong one can be undone. Each copy
// holds what a backup file holds, made by the same export code, and comes
// back through the same restore path. Which copies stay is the keep rule in
// core/copies.js. Best effort throughout: when this database fails (no room,
// storage blocked), Sabr carries on without copies, with no message and no
// wait on Today.

import * as store from './store.js';
import { lost } from './db.js';
import { SCHEMA, buildBackup, checkBackup, describeBackup, historyDays } from './core/backup.js';
import { copiesToDrop } from './core/copies.js';
import { dayKey, now } from './core/time.js';
import { VERSION } from './version.js';

const DB_NAME = 'sabr-copies';
const STORE = 'copies';
const BY_KIND = 'kind-at';
// The longest a copy may hold up the change it protects, or a list of them.
const WAIT_MS = 2000;
const LATE = Symbol('late');

let dbPromise = null;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }).createIndex(BY_KIND, ['kind', 'at']);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => { dbPromise = null; };
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('The copies database is busy.'));
  });
}

function connection() {
  if (!dbPromise) {
    dbPromise = open().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

/** The promise's value, or LATE once WAIT_MS has passed (the work itself carries on). */
function within(promise) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve) => { timer = setTimeout(() => resolve(LATE), WAIT_MS); }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * One transaction on the copies; resolves with what work(objectStore) leaves
 * in its box once it commits. iOS can drop the connection while the app is
 * suspended, so a lost connection is opened afresh and the work tried once
 * more, as db.js does: a transaction that failed wrote nothing.
 */
async function transact(mode, work) {
  for (let attempt = 0; ; attempt++) {
    let db = null;
    try {
      db = await connection();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const box = { value: undefined };
        work(tx.objectStore(STORE), box);
        tx.oncomplete = () => resolve(box.value);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('The copy was not saved.'));
      });
    } catch (err) {
      // A connection iOS dropped, or storage that fails: the next try opens afresh.
      dbPromise = null;
      if (db) {
        try { db.close(); } catch { /* already closed */ }
      }
      if (attempt === 0 && lost(err)) continue;
      throw err;
    }
  }
}

/**
 * Saves a copy, then deletes those the keep rule lets go, in the same
 * transaction; never one in protect. The keep rule reads each copy's kind
 * and time from the index, so no copy's data is read. Resolves with the new
 * copy's id.
 */
function write(copy, protect = []) {
  return transact('readwrite', (os, box) => {
    const put = os.put(copy);
    put.onsuccess = () => {
      box.value = put.result;
      const all = [];
      const cursor = os.index(BY_KIND).openKeyCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (c) {
          all.push({ id: c.primaryKey, kind: c.key[0], at: c.key[1], day: dayKey(c.key[1]) });
          c.continue();
          return;
        }
        for (const id of copiesToDrop(all, protect)) os.delete(id);
      };
    };
  });
}

/**
 * Takes a copy of everything as it is now. kind: 'daily', 'before-restore',
 * 'before-reset' or 'before-bring-back'; protect: ids of copies the keep rule
 * must not let go with it (the copy being brought back). Resolves with the
 * copy, its id set once it is saved; a copy that could not be saved still
 * holds the data, so an Undo from it works while it is in hand. Never rejects.
 */
export async function takeCopy(kind, { protect = [] } = {}) {
  let copy;
  try {
    const at = now();
    const backup = buildBackup(store.data(), { nowTs: at, version: VERSION });
    const { windows, meals, weighIns, temptations } = describeBackup(backup);
    copy = { kind, at, counts: { windows, meals, weighIns, temptations }, version: VERSION, data: backup.data };
  } catch {
    return null;
  }
  try {
    const id = await within(write(copy, protect));
    if (typeof id === 'number') copy.id = id;
  } catch {
    /* kept in memory only */
  }
  return copy;
}

/** Every copy, newest first; none when the database cannot be read. */
export async function listCopies() {
  try {
    const all = await within(transact('readonly', (os, box) => {
      const req = os.getAll();
      req.onsuccess = () => { box.value = req.result; };
    }));
    if (!Array.isArray(all)) return [];
    return all.sort((a, b) => b.at - a.at || b.id - a.id);
  } catch {
    return [];
  }
}

/** When the newest daily copy was taken, or null. */
function newestDailyAt() {
  return transact('readonly', (os, box) => {
    const req = os.index(BY_KIND).openKeyCursor(IDBKeyRange.bound(['daily', -Infinity], ['daily', Infinity]), 'prev');
    box.value = null;
    req.onsuccess = () => { box.value = req.result ? req.result.key[1] : null; };
  });
}

let dailyRun = null;
let dailyDone = null; // the day a daily copy is known to be kept

/** Looks for today's daily copy and takes it when it is missing. */
async function lookForDailyCopy() {
  try {
    if (!store.state.ready) return;
    const today = dayKey(now());
    if (dailyDone === today || !historyDays(store.data()).length) return;
    const newest = await within(newestDailyAt());
    if (newest === LATE) return;
    if (newest != null && dayKey(newest) === today) {
      dailyDone = today;
      return;
    }
    const copy = await takeCopy('daily');
    if (copy && copy.id != null) dailyDone = today;
  } catch {
    /* best effort */
  }
}

/**
 * The daily copy: once per local calendar day, when anything is logged.
 * Called after the app has drawn, never in the way of a save; a call while
 * one runs joins it. The run is let go in .finally(), which always comes
 * after this assignment: a look that ends at once (today's copy already
 * kept) would otherwise clear it first and then stay, and no later day
 * would get its copy.
 */
export function dailyCopy() {
  if (!dailyRun) dailyRun = lookForDailyCopy().finally(() => { dailyRun = null; });
  return dailyRun;
}

/** A copy as the backup it holds, checked as a file is, to come back through the same restore path. */
function asBackup(copy) {
  return checkBackup({ app: 'sabr', schema: SCHEMA, version: copy.version, data: copy.data });
}

/** Puts a copy back in place of everything there is now. */
export function restoreCopy(copy) {
  return store.restore(asBackup(copy), { own: true });
}

/**
 * Before a change that replaces the data: a copy of now, kept first.
 * protect: as for takeCopy. Resolves with the Undo that brings it back, or null.
 */
export async function keepCopyFirst(kind, { protect = [] } = {}) {
  const copy = await takeCopy(kind, { protect });
  return copy ? () => restoreCopy(copy) : null;
}
