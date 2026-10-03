// "For You": questions and ideas from Claude. Quick taps; nothing here is urgent.
import { h } from '../util.js';
import * as D from '../dates.js';
import * as V from '../derive.js';
import { pageTitle, empty, sticker } from '../ui.js';

const nameOf = (env, id) => (env.data.markets.find((m) => m.id === id) || {}).name || id;

function relatedLinks(q, env) {
  const m = q.related.marketIds, o = q.related.organizerIds;
  if (!m.length && !o.length || q.perMarket) return null;
  return h('p', { class: 'q-related' },
    m.map((id) => h('button', { type: 'button', class: 'chip chip-link', onClick: () => env.go('markets', id) }, nameOf(env, id))),
    o.map((id) => h('button', { type: 'button', class: 'chip chip-link', onClick: () => env.go('organizers', id) }, (env.data.organizers.find((x) => x.id === id) || {}).name || id)));
}

/** "Which of these…?" rows: one row per market, each with its own option buttons. */
function perMarketRows(q, env) {
  return h('ul', { class: 'q-rows' }, q.related.marketIds.map((id) => {
    const m = env.data.markets.find((x) => x.id === id);
    const picked = q.answers[id];
    return h('li', { class: `q-row${picked ? ' done' : ''}` },
      h('div', { class: 'q-row-head' },
        h('button', { type: 'button', class: 'inline-link strong', onClick: () => env.go('markets', id) }, m ? m.name : id),
        m ? h('span', { class: 'muted small' }, ` ${m.dates[0] ? `· ${D.fmtShort(m.dates[0].date)}` : ''}`) : null,
        m && !picked ? sticker(m.status, m.id) : null),
      h('div', { class: 'row' }, (q.options || []).map((opt) => h('button', {
        type: 'button', class: `btn btn-line btn-sm${picked === opt.label ? ' picked' : ''}`, 'aria-pressed': String(picked === opt.label),
        onClick: () => env.act('question.answerMarket', { id: q.id, marketId: id, label: opt.label, applyStatus: opt.status || null }),
      }, opt.label))));
  }));
}

function answerControls(q, env) {
  const box = [];
  if (q.options && !q.perMarket) {
    box.push(h('div', { class: 'row' }, q.options.map((opt) => h('button', {
      type: 'button', class: 'btn btn-line',
      onClick: () => env.act('question.answer', { id: q.id, answer: opt.label, applyStatus: opt.status || null, marketIds: q.related.marketIds }),
    }, opt.label))));
  }
  if (q.perMarket) return box;

  const isDate = q.input === 'date';
  const input = isDate
    ? h('input', { type: 'date', 'aria-label': 'Date', required: true })
    : h('input', { type: 'text', autocomplete: 'off', 'aria-label': 'Your answer', placeholder: q.options ? 'Or type something else…' : 'Type your answer…' });
  box.push(h('form', { class: 'q-form', onSubmit: (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    const marketId = q.related.marketIds[0];
    if (isDate && marketId && q.related.marketIds.length === 1) env.act('market.setDate', { id: marketId, date: value });
    env.act('question.answer', { id: q.id, answer: value, applyStatus: null, marketIds: [] });
  } }, input, h('button', { type: 'submit', class: 'btn btn-solid' }, isDate ? 'Save date' : 'Send')));
  return box;
}

function questionCard(q, env) {
  return h('article', { class: 'q-card', dataset: { id: q.id } },
    h('p', { class: 'q-text' }, q.text),
    relatedLinks(q, env),
    q.perMarket ? perMarketRows(q, env) : null,
    answerControls(q, env));
}

function ideaCard(q, env) {
  const options = q.options || [{ label: 'Sounds good' }, { label: 'Not for me' }];
  return h('article', { class: 'q-card idea', dataset: { id: q.id } },
    h('p', { class: 'q-kind' }, 'An idea from Claude'),
    h('p', { class: 'q-text' }, q.text),
    h('div', { class: 'row' }, options.map((opt) => h('button', { type: 'button', class: 'btn btn-line', onClick: () => env.act('question.answer', { id: q.id, answer: opt.label, applyStatus: null, marketIds: [] }) }, opt.label))));
}

export function renderQuestions(env) {
  const { questions } = env.data;
  const open = V.openQuestions(questions);
  const ideas = V.openIdeas(questions);
  const done = V.answered(questions);

  const root = h('div', { class: 'view view-foryou' });
  root.append(pageTitle('For Garrett', open.length ? 'A few things Claude couldn’t figure out alone. Tap an answer, or tell Claude in chat. No rush.' : null));

  if (!open.length) root.append(empty('Nothing to answer right now.', 'When something is missing or unclear, Claude asks here instead of guessing.'));
  else root.append(h('div', { class: 'cards' }, open.map((q) => questionCard(q, env))));

  if (ideas.length) root.append(h('h2', { class: 'subhead' }, 'Ideas'), h('div', { class: 'cards' }, ideas.map((q) => ideaCard(q, env))));

  if (done.length) {
    root.append(h('details', { class: 'answered' }, h('summary', {}, `Answered (${done.length})`),
      h('ul', { class: 'plain-list' }, done.map((q) => h('li', {}, h('span', { class: 'strong' }, q.text), h('br'), h('span', { class: 'muted' }, `${q.answeredAt ? D.fmtShort(q.answeredAt) : ''} · ${typeof q.answer === 'string' ? q.answer : JSON.stringify(q.answer)}`))))));
  }
  return root;
}
