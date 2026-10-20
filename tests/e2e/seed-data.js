// A known week, Sunday 20 to Saturday 26 September 2026 (the same numbers as
// the unit test in tests/unit/review.test.js).
const T = (s) => new Date(`${s}:00+03:00`).getTime();

const day = (d, first, last, extra = {}) => ({
  day: `2026-09-${d}`,
  firstBite: first ? T(`2026-09-${d}T${first}`) : null,
  lastBite: last ? T(`2026-09-${d}T${last}`) : null,
  ...extra,
});

export const WEEK = {
  days: [
    day(20, '17:30', '21:00', { energy4pm: 4, trained: true, trainingType: 'weights' }),
    day(21, '15:00', '18:00', { energy4pm: 2 }),
    day(22, '17:40', '21:50', { energy4pm: 5, trained: true, trainingType: 'cardio' }),
    day(23, '17:30', '21:50', { energy4pm: 4, trained: false }),
    day(24, '18:00', '20:00', { energy4pm: 3, trained: true, trainingType: 'weights' }),
    day(25, '14:00', '17:00'),
    day(26, '19:00', '22:00'),
  ],
  meals: [
    { id: 1, day: '2026-09-20', name: 'Dinner', startedAt: T('2026-09-20T17:30'), finishedAt: T('2026-09-20T18:00'), hungerBefore: 7, stop: 'before_full', fullnessNow: 5, fullness20: 7 },
    { id: 2, day: '2026-09-22', name: 'Dinner', startedAt: T('2026-09-22T17:40'), finishedAt: T('2026-09-22T18:10'), hungerBefore: 6, stop: 'full', fullnessNow: 6, fullness20: 7 },
    { id: 3, day: '2026-09-23', name: 'Dinner', startedAt: T('2026-09-23T17:30'), finishedAt: T('2026-09-23T18:15'), hungerBefore: 8, stop: 'stuffed', fullnessNow: 8, fullness20: 9 },
    { id: 4, day: '2026-09-24', name: 'Dinner', startedAt: T('2026-09-24T18:00'), finishedAt: T('2026-09-24T18:30'), hungerBefore: 5, stop: 'before_full', fullnessNow: 5, fullness20: null },
  ],
  outside: [{ id: 1, day: '2026-09-24', at: T('2026-09-24T22:00'), trigger: 'boredom', amount: 'little', source: 'today' }],
  temptations: [
    { id: 1, day: '2026-09-21', startedAt: T('2026-09-21T13:00'), endedAt: T('2026-09-21T13:10'), trigger: 'boredom', outcome: 'held', urges: [{ min: 0, value: 6 }], context: 'before', step: 'held' },
    { id: 2, day: '2026-09-22', startedAt: T('2026-09-22T13:00'), endedAt: T('2026-09-22T13:10'), trigger: 'social', outcome: 'held', urges: [], context: 'before', step: 'held' },
    { id: 3, day: '2026-09-24', startedAt: T('2026-09-24T21:50'), endedAt: T('2026-09-24T22:00'), trigger: 'boredom', outcome: 'ate_little', urges: [], context: 'after', step: 'slip' },
    { id: 4, day: '2026-09-25', startedAt: T('2026-09-25T11:00'), endedAt: T('2026-09-25T11:10'), trigger: 'stress', outcome: 'held', urges: [], context: 'before', step: 'held' },
  ],
  weights: [
    { date: '2026-09-14', kg: 106 }, { date: '2026-09-16', kg: 105.5 }, { date: '2026-09-18', kg: 105 },
    { date: '2026-09-21', kg: 104.9 }, { date: '2026-09-23', kg: 104.7 }, { date: '2026-09-25', kg: 104.5 },
  ],
  settings: [
    { key: 'installedAt', value: T('2026-09-20T08:00') },
    { key: 'lastImportAt', value: T('2026-09-26T09:00') },
  ],
};

const dayAt = (i) => new Date(Date.UTC(2026, 8, 25 + i)).toISOString().slice(0, 10); // 25 September + i

/** What Fast's Back up now writes (docs/js/core/backup.js in Fast): 25 September to 14 October. */
export function fastBackup() {
  const days = [];
  const meals = [];
  const weights = [];
  for (let i = 0; i < 20; i++) {
    const day = dayAt(i);
    days.push({ day, firstBite: T(`${day}T17:30`), lastBite: T(`${day}T21:00`), noEating: false, updatedAt: T(`${day}T21:00`) });
    meals.push({
      id: i + 1, day, name: 'Dinner', startedAt: T(`${day}T17:30`), finishedAt: T(`${day}T18:10`), hungerBefore: 6, stop: 'before_full',
      fullnessNow: 6, fullness20DueAt: T(`${day}T18:30`), fullness20: 7, fullness20Skipped: false, fullness20At: T(`${day}T18:31`),
    });
    if (i % 3 === 0) weights.push({ date: day, kg: 104 - i / 10 });
  }
  return {
    app: 'fast',
    schema: 1,
    version: '2026.10.14-0f1e2d3c',
    exportedAt: new Date(T('2026-10-14T22:00')).toISOString(),
    data: {
      days,
      meals,
      outside: [],
      temptations: [{ id: 1, day: '2026-10-01', startedAt: T('2026-10-01T13:00'), endedAt: T('2026-10-01T13:10'), trigger: 'boredom', outcome: 'held', urges: [], context: 'before', step: 'held' }],
      weights,
      // Fast writes every setting it knows, its defaults included.
      settings: Object.entries({
        workdayStart: '17:30', weekendStart: '14:00', holdTime: '13:00', trainingTime: '16:30',
        installedAt: T('2026-09-24T08:00'), lastBackupAt: T('2026-10-14T22:00'), lastImportAt: T('2026-10-12T10:00'),
        icsSequence: 1, icsTimes: 'local|13:00|16:30|17:30|14:00', persisted: true, goalChanges: [], alarms: false,
        zoneSeenAt: T('2026-10-14T22:00'), historyMetric: 'fast', climb: { fast: true, fullness: true },
      }).map(([key, value]) => ({ key, value })),
    },
  };
}
