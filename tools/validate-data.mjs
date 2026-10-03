// Checks the data files before a commit. Run from the repo root:  node tools/validate-data.mjs
// Exits 1 on any error. Warnings (such as a skipped-looking phone number) don't fail the run.
// Claude runs this before every data commit (see CLAUDE.md). The repo is public, so it also scans for secrets.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATUSES } from '../app/dates.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [], warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isRealDate = (s) => ISO.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

function read(name) {
  const p = path.join(root, 'data', name);
  const text = fs.readFileSync(p, 'utf8');
  try { return { data: JSON.parse(text), text }; } catch (e) { err(`${name}: not valid JSON (${e.message})`); return { data: null, text }; }
}

const files = {};
for (const n of ['markets', 'organizers', 'explore', 'questions', 'settings']) {
  files[n] = read(`${n}.json`);
  if (files[n].data && files[n].data.version !== 1) err(`${n}.json: "version" should be 1`);
  if (files[n].text && !files[n].text.endsWith('\n')) warn(`${n}.json: no trailing newline`);
}

const markets = (files.markets.data && files.markets.data.markets) || [];
const organizers = (files.organizers.data && files.organizers.data.organizers) || [];
const explore = (files.explore.data && files.explore.data.items) || [];
const questions = (files.questions.data && files.questions.data.items) || [];

const orgIds = new Set(organizers.map((o) => o.id));
const marketIds = new Set();

const checkDate = (where, v) => { if (v != null && !isRealDate(v)) err(`${where}: "${v}" is not a real YYYY-MM-DD date`); };

function checkMarket(m, where) {
  if (!m.id || typeof m.id !== 'string') { err(`${where}: missing id`); return; }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(m.id)) warn(`${where}: id "${m.id}" is not a lowercase slug`);
  const at = `${where} ${m.id}`;
  if (!m.name) err(`${at}: missing name`);
  if (m.organizerId && !orgIds.has(m.organizerId)) err(`${at}: organizerId "${m.organizerId}" is not in organizers.json`);
  if (!STATUSES.includes(m.status)) err(`${at}: status "${m.status}" is not one of ${STATUSES.join(', ')}`);
  if (!['event', 'recurring'].includes(m.kind)) err(`${at}: kind must be "event" or "recurring"`);
  for (const d of m.dates || []) { checkDate(`${at} dates`, d.date); checkDate(`${at} rainDate`, d.rainDate); }
  for (const k of ['opens', 'closes', 'decisionBy', 'paymentDeadline']) checkDate(`${at} application.${k}`, m.application && m.application[k]);
  checkDate(`${at} lastVerified`, m.lastVerified);
  for (const f of m.flags || []) if (!f.text) err(`${at}: a flag has no text`);
  for (const h of m.history || []) {
    if (!h.at || !h.by || !h.change) err(`${at}: a history entry needs at, by and change`);
    else checkDate(`${at} history.at`, h.at);
  }
  if (m.kind === 'recurring' && m.recurrenceRule && !Array.isArray(m.recurrenceRule.weekdays)) err(`${at}: recurrenceRule.weekdays must be an array of 0-6`);
  if (m.status === 'applied' && m.application && m.application.state === 'open') warn(`${at}: applied but application.state is still "open"`);
}

const seen = new Set();
for (const m of markets) {
  if (seen.has(m.id)) err(`markets: duplicate id "${m.id}"`);
  seen.add(m.id); marketIds.add(m.id);
  checkMarket(m, 'markets');
}
for (const m of explore) {
  if (marketIds.has(m.id) && !m.moved) warn(`explore: "${m.id}" is already in the hub (should be marked moved)`);
  checkMarket({ status: 'unknown', kind: 'event', ...m }, 'explore');
  if (!m.foundBy) warn(`explore ${m.id}: missing foundBy`);
}
for (const o of organizers) {
  if (!o.id || !o.name) err('organizers: every organizer needs id and name');
  if (!['in_system', 'not_signed_up', 'unknown', 'direct'].includes(o.account && o.account.status)) err(`organizers ${o.id}: account.status must be in_system, not_signed_up, unknown or direct`);
}
const qIds = new Set();
for (const q of questions) {
  if (qIds.has(q.id)) err(`questions: duplicate id "${q.id}"`);
  qIds.add(q.id);
  if (!['question', 'idea'].includes(q.type)) err(`questions ${q.id}: type must be question or idea`);
  if (!q.text) err(`questions ${q.id}: missing text`);
  for (const id of (q.related && q.related.marketIds) || []) if (!marketIds.has(id) && !explore.some((e) => e.id === id)) err(`questions ${q.id}: unknown market "${id}"`);
  for (const id of (q.related && q.related.organizerIds) || []) if (!orgIds.has(id)) err(`questions ${q.id}: unknown organizer "${id}"`);
}

// ---- the repo is public: nothing sensitive in the data ----
const SECRETS = [
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/, 'a GitHub token'],
  [/github_pat_[A-Za-z0-9_]{20,}/, 'a GitHub fine-grained token'],
  [/password\s*[:=]/i, 'the word "password" followed by a value'],
  [/\b(api[_-]?key|secret|bearer)\b\s*[:=]/i, 'an API key or secret'],
  [/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/, 'a phone number', 'warn'],
];
for (const [name, { text }] of Object.entries(files)) {
  for (const [re, label, level] of SECRETS) {
    if (re.test(text)) (level === 'warn' ? warn : err)(`${name}.json looks like it contains ${label}. This repo is public: remove it.`);
  }
}

for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.log(`ERROR:   ${e}`);
console.log(errors.length ? `\n${errors.length} error(s), ${warnings.length} warning(s)` : `OK: ${markets.length} markets, ${organizers.length} organizers, ${explore.length} finds, ${questions.length} questions (${warnings.length} warning(s))`);
process.exit(errors.length ? 1 : 0);
