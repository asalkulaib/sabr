// Help: the weight Shortcut, the weekly automation, the Home Screen.

import { h } from './dom.js';
import { button } from './components.js';
import { header } from './shared.js';
import { SHORTCUT_NAME } from './weight.js';

const code = (text) => h('span', { class: 'num' }, text);

export function renderHelp(ctx, app) {
  return h('div', { class: 'help' },
    header(ctx, app, { title: 'Help' }),
    h('section', { class: 'section strong' },
      h('h1', { class: 'display' }, 'Weight Shortcut'),
      h('p', { class: 'gap' }, 'Your scale syncs each weigh-in to Apple Health. This Shortcut reads the last 14 days, scrambles them and copies them to the clipboard. It never shows a number. Sabr then shows your 7-day average. Already built the Fast Weight shortcut for Fast? It works here too: run it, then import in Sabr.'),
      button('‹ Back', () => app.go('more'), { kind: 'secondary', name: 'back' })),

    h('section', { class: 'section' },
      h('div', { class: 'label' }, 'Build it once'),
      h('ol', { class: 'steps gap-s' },
        h('li', {}, h('span', {}, 'Open the Shortcuts app and tap + to start a new shortcut. Tap its name at the top, choose Rename, and call it ', code(SHORTCUT_NAME), '.')),
        h('li', {}, h('span', {}, 'Add the action Find Health Samples. Tap Add Filter and set Type is Weight; tap Add Filter again and set Start Date is in the last 14 days. Set Unit to kg, Sort by to Start Date and Order to Oldest First. Leave Limit off.')),
        h('li', {}, h('span', {}, 'Add Repeat with Each. It repeats over the Health Samples, down to End Repeat.')),
        h('li', {}, h('span', {}, 'Add Format Date and drag it inside the repeat, between Repeat with each item and End Repeat. For the date, choose Repeat Item, tap it and pick Start Date. Tap the arrow, set Date Format to Custom and type ', code('yyyy-MM-dd'), '.')),
        h('li', {}, h('span', {}, 'Add a Text action and drag it inside the repeat too, just under Format Date. Insert Formatted Date, type a colon, then insert Repeat Item and tap it to choose Value. Repeat Item is in the row of bubbles above the keyboard (swipe the row, or tap Select Variable); it is offered only inside the repeat.')),
        h('li', {}, h('span', {}, 'After End Repeat, add Combine Text. Combine Repeat Results with Custom and type a comma.')),
        h('li', {}, h('span', {}, 'Add Base64 Encode right after Combine Text, so it takes the Combined Text. Tap the arrow and set Line Breaks to None.')),
        h('li', {}, h('span', {}, 'Add Copy to Clipboard. Tap its arrow and turn on Local Only.')),
        h('li', {}, h('span', {}, 'Add Show Notification with the text ', code('Weight ready. Open Sabr and tap Import weight.'), ' Do not add Show Result, Quick Look or Show: they would display the data.')),
        h('li', {}, h('span', {}, 'Tap Done, then run it once. Allow Health access to Weight when asked.')))),

    h('section', { class: 'section' },
      h('div', { class: 'label' }, 'Import'),
      h('p', { class: 'gap-s' }, 'Open Sabr, go to History, choose Weight and tap Import weight, then tap Paste in the small bubble. Sabr saves the entries and says only how many it imported.')),

    h('section', { class: 'section' },
      h('div', { class: 'label' }, 'Run it every week'),
      h('ol', { class: 'steps gap-s' },
        h('li', {}, h('span', {}, 'In Shortcuts, open the Automation tab and tap +.')),
        h('li', {}, h('span', {}, 'Choose Time of Day. Pick a time you usually have the phone in hand, such as 10:00, set Repeat to Weekly and choose Friday.')),
        h('li', {}, h('span', {}, 'Choose Run Immediately, then Next.')),
        h('li', {}, h('span', {}, `Pick ${SHORTCUT_NAME} and tap Done.`)),
        h('li', {}, h('span', {}, 'When the notification arrives, open Fast and tap Import weight. Health is locked while the iPhone is locked, so if the automation ran then, use Run the Fast Weight shortcut under History, Weight instead.')))),

    h('section', { class: 'section' },
      h('div', { class: 'label' }, 'Add Sabr to your Home Screen'),
      h('ol', { class: 'steps gap-s' },
        h('li', {}, h('span', {}, 'Open the Sabr link in Safari.')),
        h('li', {}, h('span', {}, 'Tap Share. In iOS 26 it sits inside the ••• button at the bottom right.')),
        h('li', {}, h('span', {}, 'Scroll down and tap Add to Home Screen.')),
        h('li', {}, h('span', {}, 'Keep Open as Web App switched on and tap Add.')),
        h('li', {}, h('span', {}, 'From now on open Sabr from its icon. The Home Screen app keeps its own data, separate from Safari.')))),

    h('section', { class: 'section' },
      h('div', { class: 'label' }, 'If an import fails'),
      h('ul', { class: 'plain gap-s small' },
        h('li', {}, 'No weight data on the clipboard: run the Shortcut again, come back to Sabr and tap Import weight.'),
        h('li', {}, 'Entries skipped: in the Health app, open Weight and set its unit to kg. In Settings, General, Language and Region, set Calendar to Gregorian.'),
        h('li', {}, 'The Paste bubble does not appear: tap Import weight again, or use the paste box that appears on the Weight screen.'))),
  );
}
