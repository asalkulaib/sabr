// Hands files to the iOS share sheet (Calendar, Save to Files, AirDrop, Mail).
// Downloads them instead where sharing files is not available.

function download(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/**
 * files: [{ name, text, type }]. Call straight from a tap: iOS only opens the
 * share sheet inside the tap that asked for it.
 * Resolves with 'shared' | 'cancelled' | 'downloaded'.
 */
export async function deliverFiles(files, title) {
  const objs = files.map((f) => new File([f.text], f.name, { type: f.type }));
  if (navigator.share && navigator.canShare) {
    let can = false;
    try {
      can = navigator.canShare({ files: objs });
    } catch {
      can = false;
    }
    if (can) {
      try {
        await navigator.share({ files: objs, title });
        return 'shared';
      } catch (err) {
        if (err && err.name === 'AbortError') return 'cancelled';
      }
    }
  }
  objs.forEach(download);
  return 'downloaded';
}
