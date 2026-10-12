// Runs before the page renders: takes a weight payload out of the address bar
// so the numbers are never shown, and keeps it for the app to import.
(function () {
  var hash = location.hash;
  var isImportPage = /\/import\/?$/.test(location.pathname);
  if (hash.length > 1 && (isImportPage || /^#(w|b)=/i.test(hash))) {
    window.__fastPayload = hash.slice(1);
    history.replaceState(null, '', location.pathname + location.search);
  }
})();
