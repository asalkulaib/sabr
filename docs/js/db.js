// IndexedDB storage. Everything stays on this device.
// iOS can drop the connection while a Home Screen app is suspended, so every
// operation reopens the database once and retries if the connection is gone.

const DB_NAME = 'sabr';
const DB_VERSION = 1;

export const STORES = {
  days: 'day',
  meals: 'id',
  outside: 'id',
  temptations: 'id',
  weights: 'date',
  settings: 'key',
};
const NAMES = Object.keys(STORES);

let dbPromise = null;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const auto = keyPath === 'id';
        const store = db.createObjectStore(name, { keyPath, autoIncrement: auto });
        if (auto) store.createIndex('day', 'day');
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => { dbPromise = null; };
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('The database is busy. Close other Sabr tabs and try again.'));
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

function lost(err) {
  const text = `${err && err.name} ${err && err.message}`;
  return /InvalidStateError|UnknownError|TransactionInactiveError|closing|closed|Connection/i.test(text);
}

const promisify = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

/** Runs work(tx) in one transaction and resolves with its result when it commits. */
async function transact(names, mode, work) {
  for (let attempt = 0; ; attempt++) {
    try {
      const db = await connection();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(names, mode);
        let result;
        let failed = null;
        Promise.resolve()
          .then(() => work(tx))
          .then((r) => { result = r; }, (e) => { failed = e; try { tx.abort(); } catch { /* already done */ } });
        tx.oncomplete = () => (failed ? reject(failed) : resolve(result));
        tx.onerror = () => reject(failed || tx.error);
        tx.onabort = () => reject(failed || tx.error || new Error('Saving failed.'));
      });
    } catch (err) {
      if (attempt === 0 && lost(err)) {
        dbPromise = null;
        continue;
      }
      throw err;
    }
  }
}

/** Every store's records: { days: [...], meals: [...], ... } */
export function readAll() {
  return transact(NAMES, 'readonly', async (tx) => {
    const entries = await Promise.all(NAMES.map((n) => promisify(tx.objectStore(n).getAll())));
    return Object.fromEntries(NAMES.map((n, i) => [n, entries[i]]));
  });
}

/** Saves one record; resolves with its key (new ids for meals, outside, temptations). */
export function put(store, value) {
  return transact([store], 'readwrite', (tx) => promisify(tx.objectStore(store).put(value)));
}

export function putMany(store, values) {
  return transact([store], 'readwrite', (tx) => Promise.all(values.map((v) => promisify(tx.objectStore(store).put(v)))));
}

export function remove(store, key) {
  return transact([store], 'readwrite', (tx) => promisify(tx.objectStore(store).delete(key)));
}

/** Several writes in one transaction: [{ store, put: value }] or [{ store, remove: key }]. */
export function batch(ops) {
  const names = [...new Set(ops.map((o) => o.store))];
  return transact(names, 'readwrite', (tx) => Promise.all(ops.map((o) => promisify(
    'remove' in o ? tx.objectStore(o.store).delete(o.remove) : tx.objectStore(o.store).put(o.put),
  ))));
}

/** Replaces all data at once (restore). Either everything is written or nothing is. */
export function replaceAll(data) {
  return transact(NAMES, 'readwrite', async (tx) => {
    await Promise.all(NAMES.map((n) => promisify(tx.objectStore(n).clear())));
    const writes = [];
    for (const n of NAMES) for (const v of data[n] || []) writes.push(promisify(tx.objectStore(n).put(v)));
    await Promise.all(writes);
  });
}

/** Asks the browser to keep this data even when storage runs low. */
export async function requestPersistence() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
