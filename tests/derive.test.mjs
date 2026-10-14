// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMarket } from '../app/normalize.js';
import {
  statusGroup, headDate, compareByEvent, nextStep, needsAction, applyFor, dueSoon, shortDates, datesRun, groupSeries, weekendsAhead, weekendLabel, isHeadsUp,
} from '../app/derive.js';

const TODAY = '2026-10-14'; // a Wednesday
const mk = (o) => normalizeMarket({ id: o.id || 'x', name: o.name || 'X Market', organizerId: 'org', ...o });
const day = (date) => ({ date });

test('status stickers collapse to four looks', () => {
  assert.equal(statusGroup('unknown'), 'need');
  assert.equal(statusGroup('to-apply'), 'need');
  assert.equal(statusGroup('applied'), 'wait');
  assert.equal(statusGroup('researching'), 'wait');
  assert.equal(statusGroup('accepted'), 'going');
  assert.equal(statusGroup('paid'), 'going');
  assert.equal(statusGroup('skipped'), 'out');
  assert.equal(statusGroup('lapsed'), 'out');
});

test('data-quality flags are Claude\'s notes; only real heads-ups show on the card', () => {
  assert.equal(isHeadsUp({ type: 'unconfirmed' }), false);
  assert.equal(isHeadsUp({ type: 'fit-conflict' }), true);
  assert.equal(isHeadsUp({ type: 'postponed' }), true);
});

test('next step: one plain sentence per situation', () => {
  const open = (closes, status = 'to-apply') => mk({ status, dates: [day('2026-12-05')], application: { state: 'open', closes } });
  assert.deepEqual(nextStep(open('2026-10-28'), null, TODAY), { text: 'Apply by Oct 28 · in 14 days', urgent: false });
  assert.deepEqual(nextStep(open('2026-10-16'), null, TODAY), { text: 'Apply by Oct 16 · in 2 days', urgent: true });
  assert.equal(nextStep(open(null, 'unknown'), null, TODAY).text, 'Apply (no deadline listed)');
  assert.deepEqual(nextStep(open('2026-10-28'), { name: 'BKPU', account: { status: 'not_signed_up' } }, TODAY), { text: 'Sign up with BKPU first', urgent: true });

  const accepted = mk({ status: 'accepted', dates: [day('2026-12-12')], application: { paymentDeadline: '2026-10-28' } });
  assert.equal(nextStep(accepted, null, TODAY).text, 'Pay by Oct 28 · in 14 days');
  const acceptedNoPay = mk({ status: 'accepted', dates: [day('2026-10-24')] });
  assert.equal(nextStep(acceptedNoPay, null, TODAY).text, 'Accepted · in 10 days');
  assert.equal(nextStep(mk({ status: 'paid', dates: [day('2026-10-15')] }), null, TODAY).text, 'Paid · tomorrow');

  const applied = mk({ status: 'applied', dates: [day('2026-12-19')], application: { decisionBy: '2026-10-20' } });
  assert.deepEqual(nextStep(applied, null, TODAY), { text: 'Decision by Oct 20 · in 6 days', urgent: true });
  assert.equal(nextStep(mk({ status: 'applied', dates: [day('2026-12-19')] }), null, TODAY).text, 'Waiting to hear back');

  assert.equal(nextStep(mk({ status: 'skipped', dates: [day('2026-11-01')] }), null, TODAY).text, 'Not going');
  assert.equal(nextStep(mk({ status: 'lapsed', dates: [day('2026-07-25')] }), null, TODAY).text, 'Spot lapsed (payment missed)');
  assert.equal(nextStep(mk({ status: 'unknown', dates: [day('2026-09-13')] }), null, TODAY).text, 'Did you vend this one?');
  assert.equal(nextStep(mk({ status: 'unknown', dates: [day('2026-10-24')], application: { state: 'closed' } }), null, TODAY).text, 'Closed. Did you apply?');
});

test('needs action: open applications, payments due, and unanswered unknowns', () => {
  assert.equal(needsAction(mk({ status: 'to-apply', dates: [day('2026-12-05')], application: { state: 'open', closes: '2026-10-28' } }), TODAY), true);
  assert.equal(needsAction(mk({ status: 'accepted', dates: [day('2026-12-12')], application: { paymentDeadline: '2026-10-28' } }), TODAY), true);
  assert.equal(needsAction(mk({ status: 'unknown', dates: [day('2026-11-07')] }), TODAY), true);
  assert.equal(needsAction(mk({ status: 'applied', dates: [day('2026-11-07')] }), TODAY), false);
  assert.equal(needsAction(mk({ status: 'skipped', dates: [day('2026-11-07')] }), TODAY), false);
  assert.equal(needsAction(mk({ status: 'unknown', dates: [day('2026-09-13')] }), TODAY), false, 'past things are not "to do"');
});

test('apply for: soonest deadline first, no-deadline last', () => {
  const a = mk({ id: 'a', status: 'to-apply', dates: [day('2026-12-05')], application: { state: 'open', closes: '2026-10-28' } });
  const b = mk({ id: 'b', status: 'unknown', dates: [day('2026-11-14')], application: { state: 'open' } });
  const c = mk({ id: 'c', status: 'to-apply', dates: [day('2026-12-05')], application: { state: 'open', closes: '2026-10-16' } });
  const done = mk({ id: 'd', status: 'applied', dates: [day('2026-12-05')], application: { state: 'open', closes: '2026-10-15' } });
  assert.deepEqual(applyFor([a, b, c, done], TODAY).map((m) => m.id), ['c', 'a', 'b']);
});

test('due soon: payments and decisions, not application deadlines; one row per market', () => {
  const pay = mk({ id: 'pay', status: 'accepted', dates: [day('2026-12-12')], application: { paymentDeadline: '2026-10-28' } });
  const decide = mk({ id: 'decide', status: 'applied', dates: [day('2026-12-19')], application: { decisionBy: '2026-10-20' } });
  const apply = mk({ id: 'apply', status: 'to-apply', dates: [day('2026-12-05')], application: { state: 'open', closes: '2026-10-16' } });
  const farPay = mk({ id: 'far', status: 'accepted', dates: [day('2026-12-12')], application: { paymentDeadline: '2026-11-20' } });
  const eventSoon = mk({ id: 'soon', status: 'paid', dates: [day('2026-10-17')] });
  const eventLater = mk({ id: 'later', status: 'paid', dates: [day('2026-10-31')] });
  const maybe = mk({ id: 'maybe', status: 'applied', dates: [day('2026-10-17')] });
  const rows = dueSoon([pay, decide, apply, farPay, eventSoon, eventLater, maybe], TODAY, 14);
  assert.deepEqual(rows.map((r) => r.m.id), ['soon', 'decide', 'pay']); // by date: Oct 17 event, Oct 20 decision, Oct 28 payment
});

test('similar markets on several dates become one entry', () => {
  const nov14 = mk({ id: 'n14', name: 'Monsta House Universe Market', dates: [day('2026-11-14')] });
  const nov21 = mk({ id: 'n21', name: 'Monsta House Universe Market', dates: [day('2026-11-21')] });
  const other = mk({ id: 'o', name: 'Different Market', dates: [day('2026-11-15')] });
  const otherOrg = mk({ id: 'p', name: 'Monsta House Universe Market', organizerId: 'someone-else', dates: [day('2026-11-28')] });
  const twoDay = mk({ id: 't', name: 'Two Day Market', dates: [day('2026-12-05'), day('2026-12-06')] });
  const out = groupSeries([nov14, other, nov21, otherOrg, twoDay]);
  assert.deepEqual(out.map((e) => (e.type === 'group' ? e.items.map((m) => m.id).join('+') : e.m.id)), ['n14+n21', 'o', 'p', 't']);
  assert.equal(groupSeries([nov14])[0].type, 'single', 'a group of one is just a card');
});

test('weekends: going, waiting, free (and what you could still consider)', () => {
  const going = mk({ id: 'g', status: 'accepted', dates: [day('2026-10-24'), day('2026-10-25')] });
  const waiting = mk({ id: 'w', status: 'applied', dates: [day('2026-10-31')] });
  const maybe = mk({ id: 'm', status: 'unknown', dates: [day('2026-11-07')] });
  const skipped = mk({ id: 's', status: 'skipped', dates: [day('2026-11-14')] });
  const weekly = mk({ id: 'fg', status: 'applied', kind: 'recurring', recurrenceRule: { weekdays: [6] } });
  const ws = weekendsAhead([going, waiting, maybe, skipped, weekly], TODAY, 6);
  assert.equal(ws[0].sat, '2026-10-17');
  assert.deepEqual(ws.map((w) => w.state), ['free', 'going', 'waiting', 'free', 'free', 'free']);
  assert.equal(ws[3].options, 1, 'an unknown market is something you could still consider');
  assert.equal(ws[4].options, 0, 'a skipped market is not an option');
  assert.equal(ws[0].here.length, 0, 'weekly series without dates never fill a weekend');
});

test('weekends: on a Sunday the current weekend is still shown', () => {
  const ws = weekendsAhead([], '2026-10-18', 2); // Sunday
  assert.equal(ws[0].sat, '2026-10-17');
  const onSat = weekendsAhead([], '2026-10-17', 1);
  assert.equal(onSat[0].sat, '2026-10-17');
});

test('short date text', () => {
  assert.equal(shortDates(mk({ dates: [day('2026-10-24')] })), 'Sat, Oct 24');
  assert.equal(shortDates(mk({ dates: [day('2026-10-24'), day('2026-10-25')] })), 'Sat–Sun, Oct 24–25');
  assert.equal(shortDates(mk({ dates: [day('2026-10-31'), day('2026-11-01')] })), 'Sat–Sun, Oct 31–Nov 1');
  assert.equal(shortDates(mk({ kind: 'recurring', recurrenceRule: { weekdays: [6] } })), 'Every Saturday');
  assert.equal(shortDates(mk({})), 'Date not set');
  assert.equal(datesRun(['2026-11-21', '2026-11-14']), 'Nov 14 & 21');
  assert.equal(datesRun(['2026-10-31', '2026-11-07']), 'Oct 31 & Nov 7');
  assert.equal(weekendLabel('2026-10-24'), 'Oct 24–25');
  assert.equal(weekendLabel('2026-10-31'), 'Oct 31–Nov 1');
});

test('date block shows the event day, not the pay-by date; the card still turns urgent', () => {
  const m = mk({ id: 'rh', status: 'accepted', dates: [day('2026-12-12'), day('2026-12-13')], application: { paymentDeadline: '2026-10-17' } });
  const head = headDate(m, TODAY);
  assert.equal(head.date, '2026-12-12');
  assert.equal(head.upcoming, true);
  assert.equal(head.urgent, true); // payment due in 3 days
  const over = mk({ id: 'old', status: 'completed', dates: [day('2026-09-01')] });
  assert.deepEqual([headDate(over, TODAY).date, headDate(over, TODAY).upcoming], ['2026-09-01', false]);
  assert.equal(headDate(mk({ id: 'tbd', status: 'unknown' }), TODAY), null);
});

test('upcoming list sorts by event day, with skipped ones last', () => {
  const soon = mk({ id: 'a', name: 'A', status: 'applied', dates: [day('2026-10-24')] });
  const later = mk({ id: 'b', name: 'B', status: 'accepted', dates: [day('2026-12-12')], application: { paymentDeadline: '2026-10-17' } });
  const skipped = mk({ id: 'c', name: 'C', status: 'skipped', dates: [day('2026-10-20')] });
  const undated = mk({ id: 'd', name: 'D', status: 'unknown' });
  const order = [later, skipped, undated, soon].sort((x, y) => compareByEvent(x, y, TODAY)).map((m) => m.id);
  assert.deepEqual(order, ['a', 'b', 'd', 'c']);
});
