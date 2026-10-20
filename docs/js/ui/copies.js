// Copies on this iPhone: the sheet that lists them, newest first, each with
// Bring back. Bring back asks once, keeps a copy of now, then puts the chosen
// copy back; the message's Undo brings back the copy of now.

import { h } from './dom.js';
import { button } from './components.js';
import { currentSheet, openSheet, sheetHead } from './sheet.js';
import { addDays, dayKey, fmtDayShort, fmtTime } from '../core/time.js';
import { keepCopyFirst, listCopies, restoreCopy } from '../copies.js';

export const KIND_WORDS = {
  daily: 'Daily copy',
  'before-restore': 'Before a restore',
  'before-reset': 'Before a reset',
  'before-bring-back': 'Before bringing back a copy',
};

/** When a copy was taken: 'Today, 07:12', 'Yesterday, 07:30' or 'Mon 19 Oct, 07:30'. */
export function copyWhen(at, todayKey) {
  const k = dayKey(at);
  const day = k === todayKey ? 'Today' : k === addDays(todayKey, -1) ? 'Yesterday' : fmtDayShort(k);
  return `${day}, ${fmtTime(at)}`;
}

const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What a copy holds, as the Restore sheet counts it; "weigh-ins" never splits at its hyphen. */
function countsLine(c) {
  return [
    `${count(c.windows || 0, 'window')}, ${count(c.meals || 0, 'meal')}, `,
    h('span', { class: 'nowrap' }, count(c.weighIns || 0, 'weigh-in')),
    ` and ${count(c.temptations || 0, 'temptation')}`,
  ];
}

export function showCopiesSheet(app) {
  let copies = null; // read once the sheet is open
  let asking = null; // the copy whose Bring back waits for a yes
  const api = openSheet((sheet) => {
    const todayKey = app.ctx().todayKey;
    const row = (c) => {
      const confirming = asking === c.id;
      return h('li', { class: 'copy', 'data-copy': String(c.id), 'data-kind': c.kind },
        h('div', { class: 'copy-main' },
          h('span', { class: 'copy-when' }, copyWhen(c.at, todayKey)),
          h('span', { class: 'copy-kind' }, KIND_WORDS[c.kind] || 'Copy')),
        confirming ? null : button('Bring back', () => { asking = c.id; sheet.rerender(); }, { kind: 'secondary', name: 'bring-back' }),
        h('p', { class: 'copy-counts' }, countsLine(c.counts || {})),
        confirming
          ? h('div', { class: 'confirm copy-confirm' },
            h('p', { class: 'confirm-question' }, 'Bring back this copy? It replaces what is in Sabr now. A copy of now is kept first.'),
            h('div', { class: 'btn-pair' },
              button('Bring back', async () => {
                let undo = null;
                try {
                  undo = await keepCopyFirst('before-bring-back');
                  await restoreCopy(c);
                } catch {
                  asking = null;
                  await sheet.close();
                  app.flash('That copy could not be brought back.');
                  return;
                }
                await sheet.close();
                app.flash('Copy brought back.', { undo });
              }, { name: 'confirm-bring-back' }),
              button('Cancel', () => { asking = null; sheet.rerender(); }, { kind: 'outline', name: 'cancel-bring-back' })))
          : null);
    };
    return {
      head: sheetHead(sheet, 'Copies on this iPhone'),
      body: h('div', { class: 'copies' },
        h('p', { class: 'copies-lead' }, 'Copies stay on this iPhone and protect against a wrong restore or reset. To survive a lost phone, save backups to iCloud Drive.'),
        copies == null ? null
          : copies.length
            ? h('ul', { class: 'list copy-list', 'data-testid': 'copy-list' }, copies.map(row))
            : h('p', { class: 'copies-empty', 'data-testid': 'copies-empty' }, 'No copies yet.')),
    };
  }, { name: 'copies', label: 'Copies on this iPhone' });
  listCopies().then((list) => {
    copies = list;
    const open = currentSheet();
    if (open && open.api === api) api.rerender();
  });
}
