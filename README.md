# Sabr

A personal eating-window and satiety tracker for iPhone, with every feature and rule of [Fast](https://github.com/asalkulaib/fast) in a new design: the three rings. It is a Progressive Web App: it installs to the Home Screen, works fully offline and keeps every piece of data on the phone. There is no account, no server and no analytics.

Live app: https://asalkulaib.github.io/sabr/

## The look

Rings. The page is white and the words are ink. Each screen has one lead, set on the page with no frame: the rings on Today, the week's ring and its count on Week, the day's ring on a day, the average and its chart on History and Weight, the drift on Satiety, and your goal on More. What supports it sits on soft grey cards. Three colours each mean one thing: red is the fast, green the eating window, blue fullness. Today leads with three rings, one inside the other. The outer red ring fills as the fast goes on and closes at your fasting goal; past it, it laps itself in a deeper red. The green ring fills as you use the window and closes full on a successful day. The blue ring closes when every meal of the day was left wanting. A miss is orange stripes and always has words. Weight is indigo. Every coloured mark has a legend that names it. Ink is for everything you choose or press: the selected option, the main button, the focus ring and the screen you are on.

Rings draw to their value when they appear and when something you do changes them. Big moments are celebrated: when the fast reaches its goal, the window closes on a success or a day is left wanting, that ring spins and its rays burst. Each moment is celebrated once. Sheets slide up from the bottom. With Reduce Motion on, nothing moves and sheets fade; the words and colours still say it.

Nunito sets every word and number, in sentence case. Big figures have large digits and small units, as in 15h 10m, 5 of 7 or 104.7 kg. What you tap is a pill, an outlined tile or a row with an arrow at its end. Every choice and rating is a sliding track with an ink pill under your choice; the tabs at the foot have icons, with an ink pill under the screen you are on.

## Use it on your iPhone

1. Open the link above in Safari.
2. Tap Share. In iOS 26 it sits inside the three-dot button at the bottom right.
3. Scroll down and tap Add to Home Screen.
4. Keep Open as Web App switched on and tap Add.
5. From now on, open Sabr from its Home Screen icon. The Home Screen app keeps its own data, separate from Safari.

## First open

On first open, a short welcome sets your goal and planned start times and shows how to add Sabr to the Home Screen. Skip it any time. It shows once, only on a fresh install with nothing logged, and never after a restored backup. Opened from the Home Screen, it leaves out the Home Screen step.

## The rules Sabr follows

- Times follow your phone's time zone: Kuwait time at home, local time when you travel (see Travel). Workdays are Sunday to Thursday, weekends Friday and Saturday, wherever you are.
- Your goal is an eating window: 16:8, 18:6, 20:4 (the default), 23:1, or any whole number of hours from 1 to 12. The fasting goal is the rest of the 24 hours. Change it in More, Goal, or by tapping the goal under the rings on Today. A change applies from that day on; past days keep the goal they had.
- Custom sets the goal by its eating window or by its fast. A fast of 12 to 23 hours leaves the rest of the day to eat (fast 17 hours and the window is 7). A fast of 24 to 72 hours is a long fast, kept for every fast until you change it: each eating day keeps the window you had, with the same rules, and a day that begins inside the fast's goal, with nothing eaten, counts as a success on its own (Week calls it Fasted). A day past the goal with nothing logged asks to be filled in, as any other. Breaking a long fast early is not a miss; History shows that fast short of its goal. On a long fast Today calls a day the fast fills a Fasting day, says when the fast reaches its goal in place of the planned time, and the red ring runs to the long fast's goal (the line under it gives the hours to go). The calendar file drops the window alerts, since not every day has a window.
- Starting your first meal opens the window: its start is the first bite, and the countdown of your eating window begins. A window belongs to the day of its first bite, even when it runs past midnight.
- A day succeeds when all eating falls within the window goal, with 15 minutes of grace. Beyond that it is a miss, shown as the time over the goal.
- What makes a day a success is set in More. With Planned start (the default), a workday window that opens before 16:00 is a miss, and a day marked as a day off follows weekend rules. With Feasting hours, the window opens at any hour of any day, and only its length and eating outside it count. Today then shows no planned time, and the calendar file drops the window alerts. Like the goal, a change applies from that day on, and past days keep the rule they had.
- Eating after "I'm done eating" counts as outside the window and makes the day a miss. While you are still inside the window goal, you can reopen the window instead.
- Between midnight and 04:00, late eating can be counted against the night before.
- The streak counts consecutive successful days, shown on Today and in Week. A day with nothing logged breaks it, so Sabr asks you to fill in any gap.
- A paused day is not tracked for fasting: it is never a miss, and it neither counts towards the streak nor breaks it. Fullness still counts.

## Today

- Across the top, the week: Sunday to Saturday, each day as a small window ring (green for a success, orange stripes for a miss, grey for a paused day or one not logged, dashed ahead, a blue dot when left wanting), today's name on an ink pill. Tap a day to open it. A legend names the marks in the row.
- Before your window, one card holds the fast: the three rings with the time fasted, the stage under them, then two times side by side, when the fast began (your last bite) and the clock time it reaches your fasting goal, then Start a meal, with Add a meal under it for a meal you already ate. On a workday before 16:00 the warning sits just above the button. Tap either time to change it; once the goal is reached it turns red. The planned time, what you can drink until then, a day off and Pause today follow on their own panel.
- Starting your first meal ends the fast. A note at the top of Today says how long it was, beside its red ring, with the length in red and "Fasting goal of 20 h reached." when it reached your goal; a shorter fast just gets its length. Close puts the note away; it also goes when the window closes.
- When you close your window, the new fast moves to the top of Today: a Fasting card with the full rings, your last bite and when the fast reaches its goal, then the stage panel, and under them the window you just closed, with its hours, first and last bite, the result in words, Reopen window while you still can, Add a meal, Start a meal, I ate something, Change times and when tomorrow's window opens. While a 20-minute fullness check is running, its reminder sits above the fast. While a meal started after the window closed is still being eaten, no fast has begun, so the window's card stays on top with Finished this meal.

## Starting: a meal or Begin fast

Before your window, Today offers Start a meal. Begin fast appears beside it only when Sabr has nothing to time a fast from: on your first day, after a reset, or when no last bite is on record.

- Start a meal: your first meal opens the window. The sheet has the eating reminders; what the meal is: Snack, Breakfast, Lunch or Dinner, or Other to type a name (names you typed before come back as one-tap shortcuts); hunger before; and its start time, with quick times (30 min, 1 h, 2 h ago) and the wheel. Already finished? Add a meal opens Add a meal (see below), with the time, meal and hunger you picked. On a workday before 16:00, the sheet says the day will count as a miss.
- Begin fast: for a fast already under way, for example on your first day with Sabr or after a pause. Pick Now, 1 or 2 hours ago, last night, or any time on the wheel, so none of the fast is lost. Tap Sabr began on Today to adjust it later. A fast start never changes the result of the day it falls on, and it cannot be earlier than the last bite on record.

Until you tap a meal, Sabr picks one from the start time: breakfast from 05:00, lunch from 11:00, dinner from 16:00 and a snack from 22:00. A snack follows the same rules as any meal. The choice is saved as the meal's name, so it shows in the Meals list and the export, and older meals typed as, say, "dinner" open as Dinner when you edit them.

Each meal is tracked on its own: its start, its finish, hunger before, how you finished and the 20-minute check. One meal at a time: Start another meal first asks how the open one finished. I'm done eating closes the window; when the last bite you set would make the day a miss (past the goal and its grace), the sheet says so in orange before you save. After closing, a meal within your goal's hours reopens the window; later, it counts as eating outside the window, so the day is a miss, and its satiety is still tracked.

## Add a meal you already ate

Forgot to start a meal? Add it afterwards, whole, with no timer. Add a meal sits on Today (before, during and after your window, and on a paused day), at the top of Satiety, and under Meals on a day in Week. Already finished? in Start a meal opens it too. Start a meal, Finished this meal and the 20-minute check that follows work as before.

- One sheet asks for everything: today or yesterday (a day opened from Week keeps its own date), when it started (quick times 30 min, 1 h or 2 h ago, or the wheel; it starts an hour ago, or for an earlier day after its last meal, else at its first bite or planned time, clear of meals already logged), how long it took (15, 30 or 45 min or 1 h, or the finish time on its wheel, which cannot be still ahead, before the start, or more than 12 hours after it), what the meal was, hunger before, how you finished, fullness right after and fullness at 20 minutes.
- Before you save, the sheet says what the meal does to the day. It follows the same rules as any meal:
  - The first meal of the day opens the window at its start. Last meal of the day? Yes closes the window when the meal ends; No leaves it open until I'm done eating. For a day whose window Today would already ask to close, Yes is picked unless you change it.
  - A meal before the first bite opens the window earlier.
  - Inside the window, the meal is added; one that ends after the last bite moves the last bite to its end. While the window is open, Last meal of the day? Yes closes it after the latest meal.
  - After the window closed, still within your goal's hours, the window runs on to the end of the meal.
  - Later than that, it counts as eating outside the window, and the day is a miss.
  - On a paused day, it counts for Satiety only.
- A rule the meal would break (opening before 16:00 on a workday, a window longer than the goal, eating outside it) is spelled out in orange before you save.
- A meal that overlaps one already logged is refused. So is any meal while an earlier day's window is still open: close it on Today first.
- Leave fullness at 20 minutes blank and a meal that has only just ended still gets its 20-minute check. For an older one, tap the meal in Satiety, Meals later to add it.
- Saving shows Meal saved, with Undo for 10 seconds.

## Changing a time

Every time in Sabr is set on a rolling 24-hour wheel, like the iPhone clock. The hours and minutes wrap around, so 23 rolls straight on to 00.

- On Today, tap Last bite (before your window) or First bite and Last bite (after it) to change that time. On Last bite, Just now moves it to this minute; the sheet shows the window's new length before you save, so you can see if it stretches the window.
- While the window is open, tap Opened to move the opening time, or remove a window opened by mistake.
- After the window, Change times sets the first and last bite together. When the new times would make the day a miss (opening before 16:00 on a workday, or a window past its goal), the sheet says so in orange, in the same words Add a meal uses, before you save.
- Any day can be corrected from Week: tap the day.
- After a change is saved, the message above the tabs offers Undo for 10 seconds. Removing a window, a meal or an entry can be undone the same way.

## Satiety tab

Satiety has its own tab, laid out after your earlier satiety page. It has three views, and it opens on the last one you used:

- Insights (the default) leads with your satiety drift as a big figure (how much fullness rises in the 20 minutes after a meal), with what drives it in rows under it: meals landed in the comfortable zone (6 to 8), meals complete, and meals stopped past full. Four charts follow, each led by its number: Where you land (average fullness 20 minutes after a meal), The 20-minute lag (the average rise, then a line per way of finishing, from fullness right after to 20 minutes on), How often you stop where (meals left wanting, the goal, out of all rated meals) and Arriving hungry (average hunger before a meal). Then come findings from your own meals once ten are rated, and a table view.
- Now shows the fullness check waiting, with its countdown and Score my fullness now; any meal in progress, with Finished this meal; and how the day's eating ended.
- Meals lists the last 30 days by day, newest first. Each meal reads hunger before → fullness right after → fullness at 20 minutes, followed by the drift. Tap one to edit it.

At the top of every view, once a meal is rated, a line counts your rated meals and those with the 20-minute check; Add a meal, beside it, adds a meal you already ate (see Add a meal you already ate). Today keeps the meal buttons, the check-in and the streak. While a fullness check is running, Today shows a short line with a button to Satiety.

## Legends

On Satiety and History, tap a legend item to show only that one; the rest fade out. On Satiety you can also tap a mark, line or bar, and the choice applies to every chart and the meal list at once. Tap the item again, or Show all, to see everything; leaving the tab also resets it. (On the History chart, tapping a day still reads that day.)

Every colour-coded visual has a legend that names each colour in words: the week row, the rings and the window band on Today, the Week schedule, the History chart, the weight chart and the Satiety charts. Orange stripes always mean a miss. Grey means a paused day on the schedule and the chart; soft green is window time still ahead on the band, and a grey band the comfortable zone on Satiety. On Satiety each way of finishing also has its own shape and tone: a blue triangle for left wanting, a grey square for satisfied and an ink diamond for overfull. Overfull is never orange: orange means a miss.

## Fullness

When you finish a meal, Sabr asks how you finished: Left wanting (the goal), Satisfied, or Overfull. A day counts as left wanting only when every meal was. When the day's meals were not all rated, and on paused days, Satiety › Now asks once how the day's eating ended, and the worst answer of the day counts. Once every meal is rated, the meals alone decide. Satiety's charts and findings use each meal's own ratings. Fullness is logged every day, holidays and pauses included.

As you pick a number for hunger or fullness, a line under the scale says what that number means, the same words wherever you rate. Hunger runs from "1: Not hungry at all." to "10: Starving. Weak or shaky." Fullness runs from "1: Empty. Very hungry." through "7: Comfortably full." to "10: Stuffed. Painfully full." The words follow the hunger and fullness scale dietitians use; on fullness, 5 is neutral and 7 comfortably full. The line stays blank until you pick.

## Streak

Today shows your streak under the stage panel: the run of successful days in a row as a big figure, with your best beside it. The Week tab shows it too, and the Tempted sheet reminds you of it.

## The rings

Today leads with three rings. Outside, red: the fast, from your last bite (or when you began your fast) to your fasting goal, which closes it; past the goal it laps itself in a deeper red. In the middle, green: the day's eating window, filling as you use it, closed full on a successful day and orange stripes on a miss. Inside, blue: fullness, closed when every meal of the day was left wanting. Beside them, the time fasted in red and what each ring stands at in words; under them, the stage the fast is in. A legend names the three rings. On empty screens the three rings wait to fill.

## Fasting stages

While you fast, the stage the fast is in sits in the middle of the rings, and below them as a small button; the stage panel further down says what happens in it, how far the goal is and when the next stage begins. An icon marks each stage: a plate while digesting, a drop as blood sugar settles, a flame for the metabolic switch, a bolt as ketones climb, a brain for the brain on ketones and a shield for protein sparing. The icon of the stage the fast is in moves, in the rings and in the stage button: the fork taps by the plate, the drop sways and settles, the flame flickers, the bolt strikes, the brain pulses with its folds firing in turn, and the shield braces while a line runs down it. In the stages sheet the stage in view moves the same way. With Reduce Motion on, the icons rest. Before your window the rings lead Today, and once you close the window the new fast leads it again; on a day logged without eating, smaller rings sit below that note. The hours are typical, not exact, and never a target. The stages go on to 72 hours and beyond.

Tap the stage under the rings, or About the stages, to see the stages one at a time: all six along a line across the top, three at a time with the next ones peeking in at the edges, the one the fast is in ringed in red, and a card for each below, marked Now on the current one. The cards are plain grey and all one height, with Read more at the foot of each. Swipe the line to see the other stages, swipe the cards, or tap a stage; the line follows the card in view.

Read more, at the foot of each card, turns the sheet to that stage's own page: what happens in your body, what the studies found (each finding named by its first author and year), plain advice, and the studies it draws on. Nothing in it links out of the app. Back to the stages returns to that stage's card.

While the window is open, a band under the countdown fills as the hours pass: time used in green, time left in soft green, then the dashed 15 minutes of grace. Past the grace it turns to orange stripes. Beside the countdown, the rings show the window ring filling.

| Stage | Typical time | Based on |
|---|---|---|
| Digesting | 0 to about 4 h | [Dimitriadis et al., Nutrients 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC7825450/) |
| Blood sugar settles | about 4 to 12 h | [Dimitriadis et al., Nutrients 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC7825450/); [Rothman et al., Science 1991](https://pubmed.ncbi.nlm.nih.gov/1948033/) |
| Metabolic switch | from about 12 h, up to 36 h | [Anton et al., Obesity 2018](https://pubmed.ncbi.nlm.nih.gov/29086496/) |
| Ketones climbing | about 24 to 48 h | [Rothman et al., Science 1991](https://pubmed.ncbi.nlm.nih.gov/1948033/); [Hartman et al., JCEM 1992](https://pubmed.ncbi.nlm.nih.gov/1548337/) |
| Brain on ketones | about 48 to 72 h | [Pan et al., 2000](https://pubmed.ncbi.nlm.nih.gov/11043913/); [Hasselbalch et al., 1994](https://pubmed.ncbi.nlm.nih.gov/8263048/) |
| Protein sparing | 72 h and beyond | [Göschke et al., 1975](https://pubmed.ncbi.nlm.nih.gov/1177405/); [Ho et al., J Clin Invest 1988](https://pmc.ncbi.nlm.nih.gov/articles/PMC329619/) |

Protein sparing also says that a fast this long is best done with a doctor's guidance, more so with medicine or a health condition.

Read more on Blood sugar settles also cites [Natalucci et al., 2005](https://pubmed.ncbi.nlm.nih.gov/15941923/): in a 24-hour fast, the hunger hormone ghrelin still rose and fell at the usual meal times. From Ketones climbing on, Read more advises a doctor's guidance, above all with medicine or a health condition, and says to end the fast and eat if you feel faint, dizzy, confused or unwell.

Autophagy is described as uncertain instead of being given an hour: the evidence comes mostly from cell and animal studies ([Bagherniya et al., 2018](https://pubmed.ncbi.nlm.nih.gov/30172870/); [Bensalem et al., 2025](https://pubmed.ncbi.nlm.nih.gov/40345145)).

## History

History has three views: Fast, Feast and Weight. Weight opens your 7-day weight average, its chart and the import (see below). Fast and Feast chart, day by day, either your fasts or your eating windows, as bars or a line, over 7, 30 or 90 days. The average leads as a big figure with the dates it covers, then the switches on one slim line and the chart, full width on the page, so the chart is on the first screen. Over 7 days each bar carries its hours. A day's fast runs from your last bite before it to that day's first bite. Fasts that reached your fasting goal are red, and the rest soft red; windows are green. Missed days show in orange stripes, even after a long fast; the selected day is solid ink. A solid line shows the 7-day trend and a dashed line the average. A legend names every mark: goal reached, short of the goal (or hours in the window), miss, selected day, trend, average and paused. Paused days are shaded and left out. Tap a day, or touch and drag along the chart, to read the day under your finger with its trend, then Open this day to edit it. Show as a table lists every value. Sabr remembers your choices.

Weight shows your 7-day average as a big figure: the average of every weigh-in in the 7 days up to your latest, a single one included, so nothing goes stale. Beside it, the day it runs up to and how many weigh-ins it holds; under it, the change from the 7 days before. Over time charts that same 7-day average on each day you weighed in, over 1 month, 3 months, 6 months, This year or All; Sabr remembers your choice. A week with no weigh-in breaks the line, and a note under the chart says what each point is. Touch or drag along the chart and the box at the top follows the day under your finger: its 7-day average, the day, its weigh-ins and the change from the 7 days before. Back to latest, in that box, returns to your newest weigh-in, as does leaving Weight or changing the time frame. Show as a table lists every point.

## More

More opens with your goal: the fast and the window as two figures, the presets 16:8, 18:6, 20:4 and 23:1, and Custom, with a note that a change applies from today on. Under it, the settings come in groups. Settings, with a line on what it covers, holds what makes a day a success and the planned window start. Reminders holds the reminder times, the calendar file and Alarms. Pauses lists the pauses running or ahead, with Add a pause. Your data holds Backup, Copies on this iPhone, Export and Storage, with Back up now as the one main button. Then Help, a row to the help page (the weight Shortcut, the Home Screen, backups and moving from Fast), Reset, with Reset all history, and the version. Each time is a row with its value in a pill; tap it to roll a new time, which saves as it settles.

Tempted? at the top of a screen opens a full-screen flow, one step at a time. Every step has the same frame: its label and headline at the top, what supports it under them, and its buttons at the foot. The steps: what is pulling at you, what waiting gives you, a 10-minute urge timer as an ink ring that drains, ways out when you are with people or cannot avoid eating, and how it ended.

## Pauses

For travel, illness, holidays, leave or Ramadan. On Today, Pause today pauses the day in one tap. In More, Pauses, Add a pause sets a from and an until date (up to 60 days, and it can start ahead, for example for Ramadan) with an optional reason. While a day is paused, Today shows Paused until the last day, with no window to log; only the day's fullness is asked. Paused days are left out of the Week and History counts. End a pause early from Today or from More; unpause a single day from Week by tapping it. A window still open must be closed before its day can be paused.

## Weight Shortcut

Your scale syncs each weigh-in to Apple Health. This Shortcut reads the last 14 days, scrambles them and copies them to the clipboard. The Shortcut never shows a number. Sabr shows your 7-day average: the average of every weigh-in in the 7 days up to your latest, a single one included, so nothing goes stale.

Build it once in the Shortcuts app:

1. Tap + to start a new shortcut. Tap its name at the top, choose Rename, and call it `Fast Weight`.
2. Add the action Find Health Samples. Tap Add Filter and set Type is Weight; tap Add Filter again and set Start Date is in the last 14 days. Set Unit to kg, Sort by to Start Date and Order to Oldest First. Leave Limit off.
3. Add Repeat with Each. It repeats over the Health Samples, down to End Repeat.
4. Add Format Date and drag it inside the repeat, between Repeat with each item and End Repeat. For the date, choose Repeat Item, tap it and pick Start Date. Tap the arrow, set Date Format to Custom and type `yyyy-MM-dd`.
5. Add a Text action and drag it inside the repeat too, just under Format Date. Insert Formatted Date, type a colon, then insert Repeat Item and tap it to choose Value. Repeat Item is in the row of bubbles above the keyboard (swipe the row, or tap Select Variable); it is offered only inside the repeat.
6. After End Repeat, add Combine Text: combine Repeat Results with Custom and type a comma.
7. Add Base64 Encode right after Combine Text, so it takes the Combined Text. Tap the arrow and set Line Breaks to None.
8. Add Copy to Clipboard. Tap its arrow and turn on Local Only.
9. Add Show Notification with the text `Weight ready. Open Sabr and tap Import weight.` Do not add Show Result, Quick Look or Show: they would display the data.
10. Tap Done and run it once. Allow Health access to Weight when asked.

The finished shortcut, top to bottom: Find Health Samples; Repeat with each item in Health Samples, holding Format Date and Text; End Repeat; Combine Text; Base64 Encode; Copy to Clipboard; Show Notification. Sabr also accepts the older version with a `w=` Text step before Base64 Encode.

To import: open Sabr, go to History, choose Weight, tap Import weight, then tap Paste in the small bubble. Sabr saves the entries and reports only how many it imported. Duplicate dates keep the latest value.

Run it every week with a Personal Automation:

1. In Shortcuts, open the Automation tab and tap +.
2. Choose Time of Day. Pick a time you usually have the phone in hand, such as 10:00, set Repeat to Weekly and choose Friday.
3. Choose Run Immediately, then Next.
4. Pick Fast Weight and tap Done.
5. When the notification arrives, open Sabr and tap Import weight. Health is locked while the iPhone is locked, so if the automation ran then, use Run the Fast Weight shortcut under History, Weight instead.

Why the clipboard: iOS gives a Home Screen web app its own storage, separate from Safari, and a Shortcut can only open links in Safari. Sabr also accepts a link, `https://asalkulaib.github.io/sabr/import/#w=2026-09-25:104.6,...`, but opened from a Shortcut it saves into Safari's copy of Sabr, not the Home Screen app.

If an import fails:

- No weight data on the clipboard: run the Shortcut again, come back to Sabr and tap Import weight.
- Entries skipped: in the Health app, open Weight and set its unit to kg. In Settings, General, Language and Region, set Calendar to Gregorian.
- The Paste bubble does not appear: tap Import weight again, or use the paste box that appears on the Weight screen.

## Alarms

Sabr cannot ring while it is closed. In More, Alarms, switch it on and build a shortcut once: in Shortcuts, tap +, name it Fast Timer, add the action Start Timer, set its duration to Shortcut Input in minutes, and tap Done. Sabr then starts an iPhone timer when you finish a meal, for the 20-minute fullness check. Every meal works the same way, the first one of the day included: starting a meal starts no timer. Add a meal starts one only when its fullness check is still ahead. The Shortcuts app opens for a moment each time. The time left in your window shows on Today.

## Week

The week opens as a schedule: a row a day, Sunday to Saturday, each eating window drawn on a line from 04:00 to 04:00 (late eating sits with its evening, as Sabr counts it), with its times and result beside it. A success is green, a miss orange stripes, a paused day grey; an orange cross marks eating outside the window, and a dashed line marks 16:00 on workdays. The ring at the start of each row repeats the result, with a blue dot on days left wanting. Tap a row to open the day. A legend under the schedule names every mark. Satiety numbers and findings are on the Satiety tab.

## Travel

Sabr follows your phone's time zone. When you land somewhere on a different clock, Sabr says "Times now follow Dubai time." (for example), and the header shows "Dubai time" while you are away. Every time you see or enter then is local: the time wheels, the window's opening and closing, the 16:00 rule and the planned starts. Days change at local midnight, so a travel day can run 23 or 25 hours; fasting hours and window lengths are always exact.

Each day keeps the times it happened in. Back home Sabr says "Back on Kuwait time.", and your Dubai dinner still reads 19:00 to 22:30. A day that happened on another clock says so in its day view, for example "Times in Dubai time". The change starts just after Sabr was last open, so anything you log after landing is on local time. Flying west late at night, the date never goes back: the new clock starts at its own midnight. Zones on Kuwait's clock, such as Riyadh, count as home.

## Calendar reminders

More, Add to Calendar creates four repeating alerts: hold the line at 13:00 and training at 16:30 on workdays, and the window start at your workday and weekend times. With Feasting hours the file keeps the first two and cancels the two window alerts. In the share sheet choose Calendar, or Save to Files and then open the file and tap Add All. If you change the times, add the new file and delete the old Sabr events (open one, Delete Event, Delete All Future Events). The alerts use local times, so on a trip they ring by your phone's clock. A file added before 1 October 2026 rang by Kuwait time; More asks you to add the new one. After a restore from Fast, More says to delete the Fast events first (see Moving from Fast).

## Backups

Everything lives only on the phone. More, Back up now saves a JSON file: save it to iCloud Drive, in a folder named Sabr (On My iPhone goes with the phone). Sabr reminds you after 7 days without a backup. More, Restore from a backup brings everything back. Before you confirm, the sheet says which days the file runs over ("This backup runs 25 Sep to 16 Oct.") and how many days logged on this iPhone after its last day it would remove. A copy of what was there is kept first, so the message after a restore offers Undo. Export CSV files gives five files for Excel, one fact per column:

- `fast-windows.csv`: every day from the start of tracking to today, gaps marked not logged. Weekday, workday or weekend, planned start or feasting hours, the time zone, the planned time, first and last bite, the window's length and goal, the result with its reasons, the fast before it (when it began, how long, its goal and whether it was reached) and how full the day ended. A day that begins inside a long fast's goal, with nothing eaten, reads fasted.
- `fast-meals.csv`: each meal, its type (Snack, Breakfast, Lunch, Dinner or Other) and name, start, finish and minutes, hunger before, how you stopped, fullness right after and at 20 minutes, the rise, and a skipped 20-minute check. Eating logged outside the window is listed too, with its trigger and amount.
- `fast-weight.csv`: every weigh-in in kg, one per row.
- `fast-checkins.csv`: energy at 4 PM and training.
- `fast-temptations.csv`: when, where the day stood, the trigger, the outcome, the urge at 0, 3, 6 and 9 minutes, and how long it took.

## Copies on this iPhone

Sabr also keeps copies of everything, in a small database of its own on the phone: one each day you open it with something logged, and one just before a restore, a reset or bringing back a copy. It keeps the 7 newest daily copies, the newest daily copy of each of the 4 weeks before them, and the 5 newest of the other kinds, and lets the rest go after each new copy. More, Copies on this iPhone lists them, newest first: when ("Today, 07:12" or "Mon 19 Oct, 07:30"), what kind and what each holds. Bring back asks once, keeps a copy of now, then puts that copy back; the message offers Undo. Copies protect against a wrong restore or reset, not against a lost phone: for that, save backups to iCloud Drive. If the phone cannot keep them, Sabr carries on without.

## If Sabr cannot start

If Sabr has not shown its first screen 6 seconds after it opens, or an error stops it starting, a plain screen says "Sabr could not start." and "Your data is safe on this iPhone." Save my data reads the data straight from the phone and hands over the same backup file Back up now makes, ready for Restore from a backup. Try again opens Sabr afresh.

## Moving from Fast

Restore from a backup also takes Fast's backups. To move:

1. In Fast, tap Back up now and save the file to iCloud Drive.
2. In Sabr, tap Restore from a backup and pick that file.
3. Check that Week and History match in both apps.
4. In Calendar, delete the Fast events, then add Sabr's file from More.
5. Keep Fast on the Home Screen, unused, until Sabr has made two backups of its own, then remove it.

Fast's calendar file stays Fast's: Sabr leaves its record out, so More says "Restored from Fast." with how to delete the Fast events (open one, tap Delete Event, then Delete All Future Events), next to Add to Calendar for Sabr's own file. Undo, right after the restore, brings back what Sabr held before.

## Start again

More, Reset all history deletes every window, meal, check-in, pause, temptation and weigh-in from the phone. It asks twice, and the first step offers a backup. Your planned times and reminder times stay. A backup made before the reset can bring everything back with Restore from a backup, and so can the copy Sabr keeps just before it, in Copies on this iPhone.

## Redeploy after a change

Needs Git, Node 20 or later and the GitHub CLI, logged in.

```
npm install
npx playwright install webkit chromium
npm test
npm run e2e
npm run release
git add -A
git commit -m "Describe the change"
git push
```

- `npm test` runs the unit tests (rules, streaks, weekly review, weight import, calendar, CSV and backup formats, which copies stay, design and copy guards).
- `npm run e2e` stamps a release and runs the browser tests in WebKit and Chromium at iPhone size, including offline use. Screenshots of every screen land in `test-results/screens`.
- `npm run release` stamps the service worker with the list of files and a new version. Always run it before pushing, or phones keep the old version.
- GitHub Pages publishes the `docs` folder a minute or two after the push. The phone picks up the new version the next time Sabr is opened (close it from the app switcher and open it again).
- If `npx playwright install` times out on Windows, download the browser archives listed by `npx playwright install --dry-run webkit chromium` with curl and unzip them into the listed folders.

## Project layout

- `docs/`: the app exactly as served. `index.html`, `import/index.html`, `sw.js`, `manifest.webmanifest`, `css/`, `fonts/` (Nunito, SIL Open Font License), `icons/`, `js/core/` (pure rules and file formats), `js/ui/` (screens), `js/db.js` (IndexedDB), `js/store.js`, `js/copies.js` (the copies on the phone), `js/rescue.js` (the screen for when Sabr cannot start).
- `tests/unit/`: Node's built-in test runner.
- `tests/e2e/`: Playwright tests.
- `tools/`: local server (`npm run serve`), font download, icon rendering, release stamp.

The code in this repository is public; your data never leaves your phone.
