# Sabr: guide for Claude

How to work on Sabr, and what the owner has decided. README.md covers what the app does, the weight Shortcut and redeploying.

Sabr (صبر, patience) is the owner's second app: every feature and rule of Fast (https://github.com/asalkulaib/fast, which stays as it is) in a new design. Fast's `REDESIGN.md` and `redesign/inventory/` are the feature contract: every feature, rule and message listed there must exist here, unless the owner says otherwise.

## Working with the owner

- The owner doesn't write code. Do all the technical work yourself (code, tests, deploys) and explain only what they must do, such as steps on the iPhone or a login, one step at a time in plain words. No code walkthroughs. Use they/them for the owner.
- Before a big change, say what you will build and ask anything unclear first, with clear options and a recommendation. When the owner asks whether you understood, confirm before acting.
- Check every visual change in screenshots at 390×844 before it goes live. `tests/e2e/screens.spec.js` shoots every screen into `test-results/screens/` and audits text contrast. Go live only when the owner says so.
- The repository is public. Never commit personal data or the owner's email address; commits use the no-reply address set in this repo's git config.

## Where things live

- Live app: https://asalkulaib.github.io/sabr/ (GitHub Pages serves `docs/` from `main`).
- Code: https://github.com/asalkulaib/sabr.
- The owner's data lives only in IndexedDB (database `sabr`) on their iPhone, never in this repo. It shares the asalkulaib.github.io origin with Fast, so every stored name differs from Fast's: the database, the service worker cache (`sabr-`) and the `sabr.` localStorage keys.
- Restore accepts backups from Sabr and from Fast (same format), so the owner can move their data over when they ask.
- Plain HTML, CSS and JavaScript modules: no framework, no build step. `docs/js/core/` holds the pure rules (ported unchanged from Fast, with their tests), `docs/js/ui/` the screens.

## Every change

1. When behaviour changes, update README.md and the Help screen (`docs/js/ui/help.js`) to match, and keep this file current.
2. `npm test` (unit) and the browser tests in WebKit and Chromium (`npm run e2e`, or the cloud config below). Commit only when both pass in full: unit ends with `fail 0`, and e2e shows nothing failed or flaky. A filtered run is not enough.
3. Stamp after the last edit (`npm run release`); without it phones keep the old version.
4. Push, wait for the Pages build, then check that https://asalkulaib.github.io/sabr/js/version.js shows the new release.

## Rules the tests hold you to

- Colours only from the palette in `tests/unit/design.test.js`; drawing code takes them from `docs/js/ui/palette.js`, which must match the CSS tokens. Corners only `0` or the radius tokens. No shadows, gradients, blur or glass.
- Copy in the app and README: short and direct, with no em dashes, emojis, checkmarks or "it's not X, it's Y".
- The Content Security Policy blocks inline `style` attributes and `<style>`: set dynamic values with `element.style.setProperty`.
- Nothing loads from another origin; the font (Nunito) is bundled (`npm run fonts` copies it from `@fontsource/nunito`).

## Design decisions the owner made (October 2026)

- Direction A, Rings, chosen from three (Rings, Calm, Bold), inspired by Apple Fitness, Whoop and Oura, Zero and Gentler Streak, Nike and Strava. Light theme only. Name Sabr.
- White page, soft grey cards, ink text, Nunito. Three colours, one meaning each: red the fast, green the eating window, blue fullness. A miss is orange stripes and always has words. Weight is indigo. Every colour-coded visual has a labelled legend.
- Today leads with three rings (`docs/js/ui/rings.js`, used by `docs/js/ui/stages.js`): outer red fills from the last bite to the fasting goal and laps past it; middle green fills as the window is used, closes full on a successful day, stripes on a miss; inner blue closes when the day is left wanting (`dayFullness` is `before_full`). The owner confirmed these meanings. They show existing facts only, no new rules.
- The week row on Today and the Week schedule show each day as its window ring, with a blue dot when left wanting.
- Celebrations are big (owner's choice): when the fast reaches its goal, a window closes on a success or a day is left wanting, the rings spin and that ring's rays burst twice. Each moment once per phone (`sabr.celebrated` in localStorage); a redraw during it carries it on. Reduce Motion stops all movement.
- The stage icons move (kept from Fast): the stage the fast is in, in the middle of the rings and on the stage button under them.
- Start a meal and Finished this meal are green with ink words; other main actions are ink.
- Planned and agreed: a short skippable welcome on first open (goal, planned start times, Add to Home Screen). Not built yet.
- Fast's scenery, sand, gold and sun dial are gone by design.

## Behaviour decisions carried over from Fast (keep them)

- After the window closes, the new fast leads Today (owner's request): the fullness check reminder while it runs, then a Fasting card with the full-size dial and its two times, the stage panel, and the closed window's card, unchanged, below them (`fastFirst` in `docs/js/ui/today.js`). While a meal started after closing is still being eaten, the window's card (with Finished this meal) stays on top.
- The owner had Jebel Uhud (the fast and fullness climbers) removed: Today shows the Streak panel in its place, More has no climber switches, and the Tempted sheet speaks of the streak. Old `climb` settings may linger in a phone's data and are ignored.
- Big figures: large digits with small units (15h 10m).
- Anything tappable must look tappable (a pill or an outline), never plain text.
- Custom sets the goal by eating window or by fasting (`goal-by`). Fasting 12 to 23 h sets the window to the rest of the day; 24 to 72 h is a long fast the owner chose to keep for every fast (`goalChanges` entry `{ from, hours, fast }`): eating days keep their window and its rules, a past day that begins inside the fast's goal with nothing eaten is a success (state `fasted`, `insideLongFast` in `docs/js/core/rules.js`), breaking it early is not a miss, and the dial shows no goal tick past 24 h.
- Day fullness is the worst meal rating, and the blue dot in the week rows means left wanting only. The owner confirmed this twice: don't propose alternatives or extra marks.
- Just now on Last bite always moves the last bite to this minute, even when that makes the day a miss.
- Alarms start one kind of timer only: the 20-minute fullness check, when a meal is finished, the first meal of the day included. The owner had the timer for the window closing removed: starting a meal starts no timer.
- Add a meal adds a meal already eaten, whole, with no timer: today or yesterday from Today and Satiety, any day from a day in Week. It follows the same window rules as any meal (`placeAddedMeal` in `docs/js/core/added-meal.js`) and says before saving what it does to the day, misses in words. Start a meal, Finished this meal and the automatic 20-minute check stay exactly as they are; the owner asked for that.
- Weights arrive by clipboard paste from an iOS Shortcut (10 steps in Help and README), because iOS keeps a Home Screen app's storage apart from Safari. The Shortcut never shows a number, and import messages give counts only.
- Weight figures are 7-day averages that count every weigh-in, a single one included (`MIN_WEIGH_INS` is 1): the owner chose that so nothing goes stale, over the old rule of hiding a week with fewer than 3. The chart plots the 7-day average on each weigh-in day, the same figure as the big number, over 1 month, 3 months, 6 months, This year or All (remembered), breaks the line across a week with no weigh-in, and has a note under it saying so. Touching or dragging along the chart moves the big box to that day (average, Up to, weigh-ins, change); a Back to latest pill in the box returns, and leaving Weight or changing the time frame resets it.
- If weights stop arriving: Health must let Shortcuts read Weight, and the scale's own app must be allowed to write Weight to Health (some scale apps sync only when opened).
- Fasting stages run to 72 h and beyond: six stages, each worded within the human studies cited in `docs/js/core/stages.js`, with no hour given for autophagy. The dial stays a 24-hour scale; past a day one icon by the far horizon shows the stage the fast is in. The last stage says a fast that long is best done with a doctor's guidance. Read more on each card opens that stage's longer page in the same sheet (`docs/js/core/stage-more.js`): every finding names a study in `SOURCES` and stays within what it reports, with no links out of the app.

## Gotchas

- The app redraws once just after starting (it saves the `persisted` setting). `openAt` and `seed` in `tests/e2e/helpers.js` wait for that redraw; anything that reloads the page must wait too.
- WebKit can run `locator.evaluate` on an element a redraw just removed, so `setTime` and the slider drag helper retry.
- When cutting CSS, remove exact brace-matched rule blocks, never "from here to the next heading".

## Cloud sessions

- Chromium is at `/opt/pw-browsers/chromium`: run e2e through the untracked `playwright.cloud.config.js` (kept out by .gitignore; recreate it if missing): it spreads `playwright.config.js` and sets Chromium's `launchOptions.executablePath`. Run `node tools/release.mjs` first, as `npm run e2e` would.
- WebKit needs `cdn.playwright.dev` allowed in the environment's network settings (the owner added it). Its usual address redirects to a blocked Microsoft host, so curl `https://cdn.playwright.dev/builds/webkit/<revision>/webkit-ubuntu-24.04.zip` (the revision is in `node_modules/playwright-core/browsers.json`) into a folder of the scratchpad, unzip it into `webkit-<revision>/`, run with `PLAYWRIGHT_BROWSERS_PATH` set to that folder, and `apt-get install` the libraries the launch error names (libevent-2.1-7t64, libsoup-3.0-0, libavif16, libmanette-0.2-0, libenchant-2-2, libwoff1, libgstreamer-gl1.0-0, libgstreamer-plugins-bad1.0-0 and the like).
- Without WebKit, `screens.spec.js` skips, so shoot screens with an untracked copy that drops the skip, and say plainly which browser did not run.
- The icons are rendered from `docs/icons/icon.svg` with `CHROMIUM_PATH=/opt/pw-browsers/chromium node tools/render-icons.mjs`.
