// Help: the weight Shortcut, the weekly automation, the Home Screen.

import { h } from './dom.js';
import { header } from './shared.js';
import { SHORTCUT_NAME } from './weight.js';

/** A name typed or shown exactly, as a filled highlight; a short one never splits across lines. */
const code = (text) => h('span', { class: text.length <= 16 ? 'code short' : 'code' }, text);
/** A name on the iPhone's screen (an app, an action, a button), in bold. */
const b = (text) => h('b', {}, text);
/** One step: its words, some of them names in bold or code chips. */
const step = (...parts) => h('li', {}, h('span', {}, ...parts));
const card = (title, ...body) => h('section', { class: 'section help-card' }, h('h3', { class: 'card-title' }, title), ...body);

/** The five steps to add Sabr to the Home Screen, with step badges (also in the welcome). */
export function homeScreenSteps() {
  return h('ol', { class: 'steps badges' },
    step('Open the Sabr link in ', b('Safari'), '.'),
    step('Tap ', b('Share'), '. In iOS 26 it sits inside the ••• button at the bottom right.'),
    step('Scroll down and tap ', b('Add to Home Screen'), '.'),
    step('Keep ', b('Open as Web App'), ' switched on and tap ', b('Add'), '.'),
    step('From now on open Sabr from its icon. The Home Screen app keeps its own data, separate from Safari.'));
}

/** A problem, up to its colon, over its fix; the words read as one sentence. */
function fix(problem, answer) {
  return h('li', {}, h('span', { class: 'fix-problem' }, problem), ' ', h('span', { class: 'fix-answer' }, answer));
}

export function renderHelp(ctx, app) {
  return h('div', { class: 'help' },
    header(ctx, app, { title: 'Help', back: { label: 'Back', name: 'back', onClick: () => app.go('more') } }),
    h('section', { class: 'hero help-hero' },
      h('h2', { class: 'help-title' }, 'Weight Shortcut'),
      h('p', { class: 'help-intro' }, 'Your scale syncs each weigh-in to Apple Health. This Shortcut reads the last 14 days, scrambles them and copies them to the clipboard. It never shows a number. Sabr then shows your 7-day average. Already built the ', code(SHORTCUT_NAME), ' shortcut for Fast? It works here too: run it, then import in Sabr.')),

    card('Build it once',
      h('ol', { class: 'steps badges' },
        step('Open the ', b('Shortcuts'), ' app and tap ', b('+'), ' to start a new shortcut. Tap its name at the top, choose ', b('Rename'), ', and call it ', code(SHORTCUT_NAME), '.'),
        step('Add the action ', b('Find Health Samples'), '. Tap ', b('Add Filter'), ' and set Type is Weight; tap ', b('Add Filter'), ' again and set Start Date is in the last 14 days. Set Unit to kg, Sort by to Start Date and Order to Oldest First. Leave Limit off.'),
        step('Add ', b('Repeat with Each'), '. It repeats over the Health Samples, down to End Repeat.'),
        step('Add ', b('Format Date'), ' and drag it inside the repeat, between Repeat with each item and End Repeat. For the date, choose ', b('Repeat Item'), ', tap it and pick ', b('Start Date'), '. Tap the arrow, set Date Format to Custom and type ', code('yyyy-MM-dd'), '.'),
        step('Add a ', b('Text'), ' action and drag it inside the repeat too, just under Format Date. Insert ', b('Formatted Date'), ', type a colon, then insert ', b('Repeat Item'), ' and tap it to choose ', b('Value'), '. Repeat Item is in the row of bubbles above the keyboard (swipe the row, or tap Select Variable); it is offered only inside the repeat.'),
        step('After End Repeat, add ', b('Combine Text'), '. Combine Repeat Results with Custom and type a comma.'),
        step('Add ', b('Base64 Encode'), ' right after Combine Text, so it takes the Combined Text. Tap the arrow and set Line Breaks to None.'),
        step('Add ', b('Copy to Clipboard'), '. Tap its arrow and turn on ', b('Local Only'), '.'),
        step('Add ', b('Show Notification'), ' with the text ', code('Weight ready. Open Sabr and tap Import weight.'), ' Do not add Show Result, Quick Look or Show: they would display the data.'),
        step('Tap ', b('Done'), ', then run it once. Allow Health access to Weight when asked.'))),

    card('Import',
      h('p', {}, 'Open Sabr, go to ', b('History'), ', choose ', b('Weight'), ' and tap ', b('Import weight'), ', then tap ', b('Paste'), ' in the small bubble. Sabr saves the entries and says only how many it imported.')),

    card('Run it every week',
      h('ol', { class: 'steps badges' },
        step('In Shortcuts, open the ', b('Automation'), ' tab and tap ', b('+'), '.'),
        step('Choose ', b('Time of Day'), '. Pick a time you usually have the phone in hand, such as 10:00, set Repeat to Weekly and choose Friday.'),
        step('Choose ', b('Run Immediately'), ', then ', b('Next'), '.'),
        step('Pick ', code(SHORTCUT_NAME), ' and tap ', b('Done'), '.'),
        step('When the notification arrives, open Sabr and tap ', b('Import weight'), '. Health is locked while the iPhone is locked, so if the automation ran then, use ', b(`Run the ${SHORTCUT_NAME} shortcut`), ' under History, Weight instead.'))),

    card('Add Sabr to your Home Screen', homeScreenSteps()),

    card('If an import fails',
      h('ul', { class: 'plain fixes' },
        fix('No weight data on the clipboard:', 'run the Shortcut again, come back to Sabr and tap Import weight.'),
        fix('Entries skipped:', 'in the Health app, open Weight and set its unit to kg. In Settings, General, Language and Region, set Calendar to Gregorian.'),
        fix('The Paste bubble does not appear:', 'tap Import weight again, or use the paste box that appears on the Weight screen.'))),
  );
}
