// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, diffDays, dow, nthWeekday, federalHolidays, makeCalendar, availabilityFor, marketAvailability,
  nextKeyDate, upcomingDates, isPast, calendarMarkers, fmtTime, fmtTimeRange, fmtDay, relDays,
} from '../app/dates.js';

const cal = makeCalendar({});
const TODAY = '2026-10-03';

test('basic date math', () => {
  assert.equal(dow('2026-10-03'), 6); // Saturday
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(diffDays('2026-10-03', '2026-10-13'), 10);
  // DST boundaries must not shift whole days
  assert.equal(diffDays('2026-11-01', '2026-11-02'), 1);
  assert.equal(addDays('2026-03-08', 1), '2026-03-09');
});

test('floating holidays land on the right day (2026)', () => {
  assert.equal(nthWeekday(2026, 10, 1, 2), '2026-10-12'); // Columbus / Indigenous Peoples' Day
  assert.equal(nthWeekday(2026, 11, 4, 4), '2026-11-26'); // Thanksgiving
  assert.equal(nthWeekday(2026, 5, 1, -1), '2026-05-25'); // Memorial Day
  assert.equal(nthWeekday(2026, 9, 1, 1), '2026-09-07'); // Labor Day
  assert.equal(nthWeekday(2027, 1, 1, 3), '2027-01-18'); // MLK
});

test('observed-date rules', () => {
  const by = (year, short) => federalHolidays(year).find((h) => h.short === short);
  assert.equal(by(2026, 'Fourth of July').observed, '2026-07-03'); // Sat → Fri
  assert.equal(by(2027, 'Fourth of July').observed, '2027-07-05'); // Sun → Mon
  assert.equal(by(2026, 'Christmas').observed, '2026-12-25'); // Fri, stays
  assert.equal(by(2028, "New Year's Day").observed, '2027-12-31'); // Sat Jan 1 → Fri Dec 31 of the prior year
  // floating holidays never shift
  assert.equal(by(2026, 'Columbus Day').observed, '2026-10-12');
});

test('a Saturday and Sunday event carry no flag', () => {
  assert.equal(availabilityFor('2026-10-17', cal).level, 'free');
  assert.equal(availabilityFor('2026-10-18', cal).level, 'free');
  assert.equal(availabilityFor('2026-10-17', cal).label, null);
});

test('an ordinary weekday is flagged to confirm', () => {
  const a = availabilityFor('2026-10-14', cal); // Wednesday after Columbus Day weekend
  assert.equal(a.level, 'confirm');
  assert.match(a.label, /Availability to confirm/);
});

test('Columbus / Indigenous Peoples\' Day weekend: Mon Oct 12, 2026', () => {
  const mon = availabilityFor('2026-10-12', cal);
  assert.equal(mon.level, 'likely');
  assert.equal(mon.label, 'Falls on Columbus Day weekend');
  const fri = availabilityFor('2026-10-09', cal);
  assert.equal(fri.level, 'likely');
  assert.equal(fri.label, 'Next to Columbus Day weekend');
  const tue = availabilityFor('2026-10-13', cal);
  assert.equal(tue.level, 'likely');
  assert.equal(availabilityFor('2026-10-08', cal).level, 'confirm'); // Thursday, two days out
});

test('Thanksgiving: the Friday after is a bridge day', () => {
  assert.equal(availabilityFor('2026-11-26', cal).label, 'Falls on Thanksgiving weekend');
  assert.equal(availabilityFor('2026-11-27', cal).label, 'Falls on Thanksgiving weekend');
  assert.equal(availabilityFor('2026-11-25', cal).label, 'Next to Thanksgiving weekend');
  assert.equal(availabilityFor('2026-11-24', cal).level, 'confirm');
});

test('Christmas on a Friday and the day before', () => {
  assert.equal(availabilityFor('2026-12-25', cal).label, 'Falls on Christmas weekend');
  assert.equal(availabilityFor('2026-12-24', cal).level, 'likely');
});

test('observed July 3, 2026 makes a long weekend', () => {
  assert.equal(availabilityFor('2026-07-03', cal).label, 'Falls on Fourth of July weekend');
});

test('companyLongWeekends are honoured, and nothing is assumed without them', () => {
  assert.equal(availabilityFor('2026-12-30', cal).level, 'confirm'); // Wednesday, two days before New Year's Day weekend
  assert.equal(availabilityFor('2026-12-31', cal).label, "Next to New Year's Day weekend"); // Jan 1, 2027 is a Friday
  assert.equal(availabilityFor('2026-12-16', cal).level, 'confirm');
  const withCompany = makeCalendar({ companyLongWeekends: [{ start: '2026-12-14', end: '2026-12-16', label: 'Winter break' }] });
  assert.equal(availabilityFor('2026-12-15', withCompany).level, 'likely');
  assert.equal(availabilityFor('2026-12-15', withCompany).label, 'Falls on Winter break');
  const single = makeCalendar({ companyLongWeekends: ['2026-10-16'] }); // company gives Friday Oct 16
  assert.equal(availabilityFor('2026-10-16', single).level, 'likely');
});

test('multi-day market: the most-flagged upcoming day wins', () => {
  const sat = { dates: [{ date: '2026-12-05' }, { date: '2026-12-06' }] };
  const mixed = { dates: [{ date: '2026-12-11' }, { date: '2026-12-12' }] }; // Fri + Sat
  assert.equal(marketAvailability(sat, cal, TODAY).level, 'free');
  assert.equal(marketAvailability(sat, cal, TODAY).weekendOnly, true);
  assert.equal(marketAvailability(mixed, cal, TODAY).level, 'confirm');
  assert.equal(marketAvailability(mixed, cal, TODAY).weekendOnly, false);
  assert.equal(marketAvailability({ dates: [] }, cal, TODAY).level, 'unknown');
});

test('rain date: past only after the rain date', () => {
  const osh = { id: 'osh', status: 'unknown', dates: [{ date: '2026-10-17', rainDate: '2026-10-18' }] };
  assert.equal(isPast(osh, '2026-10-17'), false);
  assert.equal(isPast(osh, '2026-10-18'), false);
  assert.equal(isPast(osh, '2026-10-19'), true);
});

test('next key date follows status', () => {
  const base = { id: 'x', dates: [{ date: '2026-12-19' }, { date: '2026-12-20' }], application: { opens: null, closes: '2026-10-08', decisionBy: '2026-10-13', state: 'open' } };
  // not applied yet: the application deadline is what matters
  assert.deepEqual(pick(nextKeyDate({ ...base, status: 'to-apply' }, TODAY)), ['appCloses', '2026-10-08']);
  // applied: wait for the decision date
  assert.deepEqual(pick(nextKeyDate({ ...base, status: 'applied' }, TODAY)), ['decisionBy', '2026-10-13']);
  // accepted/paid: just the event
  assert.deepEqual(pick(nextKeyDate({ ...base, status: 'paid' }, TODAY)), ['event', '2026-12-19']);
  // skipped: the deadline is irrelevant
  assert.deepEqual(pick(nextKeyDate({ ...base, status: 'skipped' }, TODAY)), ['event', '2026-12-19']);
  // closed application is never a "next" date, and a decision date means nothing until he has applied
  const closed = { ...base, status: 'unknown', application: { ...base.application, state: 'closed' } };
  assert.deepEqual(pick(nextKeyDate(closed, TODAY)), ['event', '2026-12-19']);
});

test('recurring market yields the next occurrence, including today', () => {
  const fg = { id: 'fg', kind: 'recurring', status: 'unknown', dates: [], recurrenceRule: { weekdays: [6], start: '09:00', end: '16:00' }, application: {} };
  assert.deepEqual(pick(nextKeyDate(fg, '2026-10-03')), ['event', '2026-10-03']); // Saturday today
  assert.deepEqual(pick(nextKeyDate(fg, '2026-10-05')), ['event', '2026-10-10']); // Monday → next Saturday
  assert.equal(marketAvailability(fg, cal, TODAY).level, 'free');
  assert.equal(isPast(fg, '2027-01-01'), false);
});

test('calendar markers expand recurring series and honour status relevance', () => {
  const fg = { id: 'fg', kind: 'recurring', status: 'unknown', dates: [], recurrenceRule: { weekdays: [6] }, application: {} };
  const applied = { id: 'a', status: 'applied', dates: [{ date: '2026-12-19' }], application: { closes: '2026-09-27', decisionBy: '2026-10-13', state: 'closed' } };
  const marks = calendarMarkers([fg, applied], '2026-10-01', '2026-10-31');
  assert.equal(marks.filter((k) => k.type === 'recurring').length, 5); // Saturdays: Oct 3, 10, 17, 24, 31
  assert.ok(marks.some((k) => k.marketId === 'a' && k.type === 'decisionBy' && k.date === '2026-10-13'));
  assert.ok(!marks.some((k) => k.marketId === 'a' && k.type === 'appCloses'));
});

test('formatting', () => {
  assert.equal(fmtTime('10:00'), '10am');
  assert.equal(fmtTime('17:30'), '5:30pm');
  assert.equal(fmtTime('12:00'), '12pm');
  assert.equal(fmtTime('00:15'), '12:15am');
  assert.equal(fmtTimeRange('10:00', '17:00'), '10am–5pm');
  assert.equal(fmtDay('2026-10-17'), 'Sat, Oct 17');
  assert.equal(relDays('2026-10-04', TODAY), 'tomorrow');
  assert.equal(relDays('2026-10-13', TODAY), 'in 10 days');
});

function pick(k) {
  return k ? [k.type, k.date] : null;
}
