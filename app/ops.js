// Every change the app can make, written as a small named operation.
//
// An op is applied twice: once to the in-memory data (so the UI updates instantly) and once to
// the *latest* file fetched from GitHub just before saving. That is how a tap never overwrites
// something Claude changed a minute earlier. Steps work on a list of entries (markets, questions…)
// and must be idempotent: a retry after a half-finished save must not double-apply. History
// entries carry the op id so a repeat can be spotted and skipped.

// Fields that only make sense on a search find, not on a hub card.
const EXPLORE_ONLY = ['foundBy', 'foundAt', 'worthALook', 'worthReason', 'dismissed', 'moved'];

const find = (list, id) => list.find((x) => x && x.id === id);
const seen = (entity, ctx) => (entity.history || []).some((h) => h.op === ctx.opId);
const log = (entity, change, ctx) => {
  if (!Array.isArray(entity.history)) entity.history = [];
  entity.history.push({ at: ctx.today, by: 'app', change, op: ctx.opId });
};
const nameOf = (list, id) => (find(list, id) || {}).name || id;
const short = (name) => (name.length > 48 ? `${name.slice(0, 45)}…` : name);

function setStatus(list, id, status, ctx, why) {
  const m = find(list, id);
  if (!m || seen(m, ctx) || m.status === status) return;
  const before = m.status || 'unknown';
  m.status = status;
  if (status !== 'unknown' && Array.isArray(m.flags)) {
    m.flags = m.flags.filter((f) => !(f && f.type === 'unconfirmed' && f.field === 'status'));
  }
  log(m, `Status: ${before} → ${status}${why ? ` (${why})` : ''}`, ctx);
}

export const OPS = {
  'market.setStatus': {
    msg: (a, d) => `app: ${short(nameOf(d.markets, a.id))} → ${a.status}`,
    steps: (a) => [{ file: 'markets', apply: (list, ctx) => setStatus(list, a.id, a.status, ctx) }],
  },

  'market.addNote': {
    msg: (a, d) => `app: note on ${short(nameOf(d.markets, a.id))}`,
    steps: (a) => [{
      file: 'markets',
      apply: (list, ctx) => {
        const m = find(list, a.id);
        if (!m || seen(m, ctx)) return;
        m.notes = `${m.notes ? `${m.notes}\n` : ''}${ctx.today}: ${a.text}`;
        log(m, 'Note added', ctx);
      },
    }],
  },

  'market.setResults': {
    msg: (a, d) => `app: results for ${short(nameOf(d.markets, a.id))}`,
    steps: (a) => [{
      file: 'markets',
      apply: (list, ctx) => {
        const m = find(list, a.id);
        if (!m || seen(m, ctx)) return;
        m.results = { ...(m.results || {}), ...a.results };
        log(m, 'Results logged', ctx);
      },
    }],
  },

  // Fill in the date for a market that had none (e.g. answering "what's the date?").
  'market.setDate': {
    msg: (a, d) => `app: date for ${short(nameOf(d.markets, a.id))} → ${a.date}`,
    steps: (a) => [{
      file: 'markets',
      apply: (list, ctx) => {
        const m = find(list, a.id);
        if (!m || seen(m, ctx)) return;
        m.dates = [{ date: a.date, start: null, end: null, rainDate: null }];
        if (Array.isArray(m.flags)) m.flags = m.flags.filter((f) => !(f && f.type === 'unconfirmed' && f.field === 'dates'));
        log(m, `Date set to ${a.date}`, ctx);
      },
    }],
  },

  'organizer.setAccount': {
    msg: (a, d) => `app: ${short(nameOf(d.organizers, a.id))} account → ${a.status}`,
    steps: (a) => [{
      file: 'organizers',
      apply: (list, ctx) => {
        const o = find(list, a.id);
        if (!o || seen(o, ctx) || (o.account && o.account.status === a.status)) return;
        const before = (o.account && o.account.status) || 'unknown';
        o.account = { ...(o.account || {}), status: a.status };
        log(o, `Account: ${before} → ${a.status}`, ctx);
      },
    }],
  },

  'explore.dismiss': {
    msg: (a, d) => `app: dismissed ${short(nameOf(d.explore, a.id))}`,
    steps: (a) => [{ file: 'explore', apply: (list) => { const x = find(list, a.id); if (x) x.dismissed = true; } }],
  },

  // Moves a search find into the hub as "researching". `a.item` is a snapshot of the find.
  'explore.addToHub': {
    msg: (a) => `app: added ${short(a.item.name || a.item.id)} to the hub`,
    steps: (a) => [
      {
        file: 'markets',
        apply: (list, ctx) => {
          if (find(list, a.item.id)) return;
          const market = { ...a.item };
          for (const key of EXPLORE_ONLY) delete market[key];
          const flags = (market.flags || []).filter((f) => f.type !== 'verify');
          flags.push({ type: 'verify', field: null, text: 'Found by search. Verify the details.' });
          list.push({
            ...market, status: 'researching', flags,
            source: { type: 'search', ref: a.item.foundAt ? `search ${a.item.foundAt}` : 'search', addedAt: ctx.today },
            history: [...(market.history || []), { at: ctx.today, by: 'app', change: 'Moved from Explore into the hub', op: ctx.opId }],
          });
        },
      },
      { file: 'explore', apply: (list) => { const x = find(list, a.item.id); if (x) x.moved = true; } },
    ],
  },

  // Answer a question. If the chosen option carries a status, apply it to the related markets too.
  'question.answer': {
    msg: (a, d) => `app: answered "${short(((find(d.questions, a.id) || {}).text) || a.id)}"`,
    steps: (a) => [
      ...(a.applyStatus ? (a.marketIds || []).map((id) => ({ file: 'markets', apply: (list, ctx) => setStatus(list, id, a.applyStatus, ctx, 'answered a question') })) : []),
      {
        file: 'questions',
        apply: (list, ctx) => {
          const q = find(list, a.id);
          if (!q) return;
          q.answer = a.answer;
          q.answeredAt = ctx.today;
        },
      },
    ],
  },

  // One row of a "which of these…?" question. The question closes when every market has an answer.
  'question.answerMarket': {
    msg: (a, d) => `app: ${short(nameOf(d.markets, a.marketId))} → ${a.label}`,
    steps: (a) => [
      ...(a.applyStatus ? [{ file: 'markets', apply: (list, ctx) => setStatus(list, a.marketId, a.applyStatus, ctx, 'answered a question') }] : []),
      {
        file: 'questions',
        apply: (list, ctx) => {
          const q = find(list, a.id);
          if (!q) return;
          q.answers = { ...(q.answers || {}), [a.marketId]: a.label };
          const ids = (q.related && q.related.marketIds) || [];
          if (ids.length && ids.every((id) => q.answers[id])) {
            q.answeredAt = ctx.today;
            q.answer = ids.map((id) => `${id}: ${q.answers[id]}`).join('; ');
          }
        },
      },
    ],
  },
};
