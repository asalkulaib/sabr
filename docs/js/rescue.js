// The rescue screen, for when Sabr cannot start. A classic script with no
// imports, run before the app, so it works when any module fails to load or
// throws. If the first screen is not up 6 seconds after the page started
// (app.js sets window.__sabrDrawn once it is), or an error escapes before
// then, it replaces the view with two pills: Save my data reads the 'sabr'
// database directly and hands over the same backup file Back up now makes;
// Try again reloads. It says the data is safe only once it has read it, and
// that storage could not be opened when it cannot. It uses the app's own
// styles and words only.
(function () {
  'use strict';

  var WAIT_MS = 6000;
  var STORES = ['days', 'meals', 'outside', 'temptations', 'weights', 'settings'];
  var shown = false;

  var drawn = function () { return window.__sabrDrawn === true; };

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (text) node.textContent = text;
    return node;
  }

  /**
   * Everything in the 'sabr' database, store by store. A database that was
   * never made stays unmade, as the app expects to make it, and reads as empty.
   */
  function readAll() {
    return new Promise(function (resolve, reject) {
      var out = {};
      STORES.forEach(function (n) { out[n] = []; });
      var fresh = false;
      var req;
      try {
        req = indexedDB.open('sabr');
      } catch (err) {
        reject(err);
        return;
      }
      req.onupgradeneeded = function () {
        fresh = true;
        req.transaction.abort();
      };
      req.onerror = function () {
        if (fresh) resolve(out);
        else reject(req.error);
      };
      req.onsuccess = function () {
        var db = req.result;
        var names = STORES.filter(function (n) { return db.objectStoreNames.contains(n); });
        if (!names.length) {
          db.close();
          resolve(out);
          return;
        }
        var tx = db.transaction(names, 'readonly');
        names.forEach(function (n) {
          var r = tx.objectStore(n).getAll();
          r.onsuccess = function () { out[n] = r.result; };
        });
        tx.oncomplete = function () {
          db.close();
          resolve(out);
        };
        tx.onerror = tx.onabort = function () {
          db.close();
          reject(tx.error);
        };
      };
    });
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  /** The backup file, in the shape and with the name Back up now gives it. */
  function backupFile(all) {
    var at = new Date();
    var backup = {
      app: 'sabr',
      schema: 1,
      version: 'rescue',
      exportedAt: at.toISOString(),
      data: {
        days: all.days,
        meals: all.meals,
        outside: all.outside,
        temptations: all.temptations,
        weights: all.weights.map(function (w) { return { date: w.date, kg: w.kg }; }),
        settings: all.settings.map(function (s) { return { key: s.key, value: s.value }; }),
      },
    };
    var day = at.getFullYear() + '-' + pad(at.getMonth() + 1) + '-' + pad(at.getDate());
    return { name: 'sabr-backup-' + day + '.json', text: JSON.stringify(backup, null, 1) };
  }

  function download(file) {
    var url = URL.createObjectURL(file);
    var a = el('a', { href: url, download: file.name, rel: 'noopener' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    return 'downloaded';
  }

  /** Hands the file to the share sheet, or downloads it. Resolves with 'shared', 'cancelled' or 'downloaded'. */
  function deliver(made) {
    var file = new File([made.text], made.name, { type: 'application/json' });
    var can = false;
    try {
      can = !!(navigator.share && navigator.canShare && navigator.canShare({ files: [file] }));
    } catch (err) {
      can = false;
    }
    if (!can) return Promise.resolve(download(file));
    return navigator.share({ files: [file], title: 'Sabr backup' }).then(
      function () { return 'shared'; },
      function (err) { return err && err.name === 'AbortError' ? 'cancelled' : download(file); });
  }

  function rescue() {
    if (shown || drawn()) return;
    var view = document.getElementById('view');
    if (!view) {
      document.addEventListener('DOMContentLoaded', rescue, { once: true });
      return;
    }
    shown = true;

    var title = el('h1', { class: 't-title-1' }, 'Sabr could not start.');
    var save = el('button', { type: 'button', class: 'btn block', 'data-action': 'rescue-save' }, 'Save my data');
    var retry = el('button', { type: 'button', class: 'btn outline block', 'data-action': 'rescue-retry' }, 'Try again');
    var status = el('p', { class: 't-callout gap', role: 'status', 'data-testid': 'rescue-status' });
    var actions = el('div', { class: 'stack gap-xl' });
    actions.append(save, retry);
    // Says the data is safe only once it has been read.
    var note = el('p', { class: 't-body gap', 'data-testid': 'rescue-note' });
    var hero = el('section', { class: 'hero' });
    hero.append(title, note);
    var box = el('div', { class: 'rescue', 'data-testid': 'rescue' });
    box.append(hero, actions, status);

    // Read at once, so the tap can hand the file over while iOS still counts it as the tap.
    var made = null;
    var reading = null;
    var read = function () {
      reading = readAll().then(function (all) {
        made = backupFile(all);
        return made;
      });
      reading.then(function () {
        note.textContent = 'Your data is safe on this iPhone.';
      }, function () {
        reading = null;
        if (!made) note.textContent = 'Sabr could not open its storage. In Private Browsing, open Sabr from the Home Screen instead.';
      });
      return reading;
    };
    read();

    var tell = function (result) {
      status.textContent = result === 'shared' ? 'Backup handed to iOS. Keep it in iCloud Drive, in a folder named Sabr.'
        : result === 'downloaded' ? 'Backup file downloaded.' : '';
    };
    save.addEventListener('click', function () {
      if (save.getAttribute('aria-busy') === 'true') return;
      status.textContent = '';
      var handed;
      try {
        handed = made ? deliver(made) : (reading || read()).then(deliver);
      } catch (err) {
        handed = Promise.reject(err);
      }
      save.setAttribute('aria-busy', 'true');
      handed.then(tell, function () { status.textContent = 'Sabr could not read its data.'; })
        .then(function () { save.removeAttribute('aria-busy'); });
    });
    retry.addEventListener('click', function () { location.reload(); });

    view.replaceChildren(box);
    view.removeAttribute('aria-busy');
    // The tabs need the app; they come back if it starts after all.
    var tabbar = document.getElementById('tabbar');
    if (tabbar) tabbar.hidden = true;
    new MutationObserver(function (changes, watch) {
      if (box.isConnected) return;
      if (tabbar) tabbar.hidden = false;
      watch.disconnect();
    }).observe(view, { childList: true });
  }

  // The app hands over to the rescue when its storage cannot be opened.
  window.__sabrRescue = rescue;

  // A script that failed to load, or an error thrown while starting.
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t !== window && t.tagName !== 'SCRIPT') return;
    if (!drawn()) rescue();
  }, true);
  window.addEventListener('unhandledrejection', function () {
    if (!drawn()) rescue();
  });
  setTimeout(function () {
    if (!drawn()) rescue();
  }, WAIT_MS);
})();
