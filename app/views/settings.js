// Settings sheet and the first-run setup screen. The GitHub token lives only in this device's
// localStorage. Without one the app is a read-only viewer.
import { h, icon } from '../util.js';
import { DEFAULT_CONFIG, getConfig, setConfig, getToken, setToken, clearToken } from '../config.js';
import * as gh from '../github.js';
import { state, loadAll, flush, discardPending } from '../store.js';
import { storage } from '../storage.js';
import { toast } from '../ui.js';

const SOURCE_LABEL = { api: 'Live from GitHub', static: 'The public site (can lag a minute or two)', cache: 'A saved copy on this device' };

/** Paste-your-token form. Checks the token with GitHub before keeping it. */
function tokenForm({ submitLabel = 'Save token', onDone } = {}) {
  const input = h('input', {
    type: 'password', name: 'token', autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false',
    placeholder: 'github_pat_…', 'aria-label': 'GitHub fine-grained token', required: true,
  });
  const msg = h('p', { class: 'form-msg', role: 'status' });
  const button = h('button', { type: 'submit', class: 'btn btn-solid' }, submitLabel);
  return h('form', { class: 'token-form', onSubmit: async (e) => {
    e.preventDefault();
    const token = input.value.trim();
    if (!token) return;
    button.disabled = true;
    button.textContent = 'Checking…';
    msg.className = 'form-msg';
    msg.textContent = '';
    try {
      const access = await gh.checkAccess({ cfg: getConfig(), token });
      if (access.canPush === false) throw new Error('This token can see the repo but not change it. When you create it, set Repository permissions → Contents → Read and write.');
      setToken(token);
      input.value = '';
      await loadAll();
      toast('Connected. Your taps now save to GitHub.');
      if (onDone) onDone();
    } catch (err) {
      msg.className = 'form-msg error';
      msg.textContent = err instanceof gh.GitHubError || err instanceof Error ? err.message : 'That didn’t work.';
    } finally {
      button.disabled = false;
      button.textContent = submitLabel;
    }
  } },
  h('label', { class: 'form-field' }, h('span', {}, 'GitHub token'), input), msg, h('div', { class: 'row' }, button));
}

const tokenHelp = () => h('details', { class: 'help' }, h('summary', {}, 'How do I get a token?'),
  h('ol', {},
    h('li', {}, 'On GitHub, open Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.'),
    h('li', {}, 'Repository access: Only select repositories, then pick this one.'),
    h('li', {}, 'Permissions: Repository permissions → Contents → Read and write. Nothing else.'),
    h('li', {}, 'Generate it, copy it, and paste it above. GitHub only shows it once.')));

// ---------- first-run setup ----------

export function showSetup(env) {
  if (document.getElementById('setup')) return;
  const close = () => { storage.set('pop.setupSeen', '1'); overlay.remove(); env.rerender(); };
  const overlay = h('div', { id: 'setup', class: 'setup', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'setup-title' },
    h('div', { class: 'setup-inner' },
      h('h1', { class: 'wordmark', id: 'setup-title', 'aria-label': 'POP! POP!' }, h('span', {}, 'POP!'), h('span', { class: 'hl' }, 'POP!')),
      h('p', { class: 'setup-lead' }, 'Every market you could vend, in one place.'),
      h('p', {}, 'To change things from this phone (tap a status, answer a question, log results) the app needs a GitHub token. It stays on this device only.'),
      tokenForm({ submitLabel: 'Save and connect', onDone: close }),
      tokenHelp(),
      h('button', { type: 'button', class: 'btn btn-line skip', onClick: close }, 'Skip for now. Just let me look.'),
      h('p', { class: 'small muted' }, 'You can add the token any time from the gear icon.')));
  document.body.append(overlay);
  const input = overlay.querySelector('input');
  if (input) input.focus();
}

// ---------- settings sheet ----------

function formatTime(ms) {
  if (!ms) return 'not yet';
  return new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function openSettings(env) {
  document.getElementById('settings')?.remove();
  const dlg = h('dialog', { id: 'settings', class: 'sheet', 'aria-labelledby': 'settings-title' });
  const body = h('div', { class: 'sheet-body' });
  dlg.append(body);

  const rebuild = () => body.replaceChildren(...build());
  const closeSheet = () => { if (dlg.open) dlg.close(); };
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeSheet(); });
  dlg.addEventListener('close', () => dlg.remove());

  function build() {
    const cfg = getConfig();
    const hasToken = !!getToken();
    const out = [];
    out.push(h('header', { class: 'sheet-head' },
      h('h2', { id: 'settings-title' }, 'Settings'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close settings', onClick: closeSheet }, icon('close'))));

    // GitHub connection
    const gitSection = h('section', { class: 'sheet-section' }, h('h3', {}, 'GitHub connection'));
    if (hasToken) {
      const replaceSlot = h('div', {});
      gitSection.append(
        h('p', {}, h('span', { class: 'tag acct acct-in_system' }, 'Connected'), ` ${cfg.owner}/${cfg.repo} · ${cfg.branch}`),
        state.authError ? h('p', { class: 'form-msg error' }, state.authError) : null,
        h('p', { class: 'small muted' }, 'Taps save straight to the repo. The token is stored on this device only.'),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn btn-line', onClick: () => replaceSlot.replaceChildren(tokenForm({ submitLabel: 'Replace token', onDone: rebuild })) }, 'Replace token'),
          h('button', { type: 'button', class: 'btn btn-line danger', onClick: () => {
            if (state.pending.length && !confirm(`You have ${state.pending.length} unsaved change(s). Remove the token anyway?`)) return;
            clearToken();
            toast('Token removed. The app is view-only now.');
            rebuild();
            env.rerender();
          } }, 'Remove token')),
        replaceSlot);
    } else {
      gitSection.append(
        h('p', {}, h('span', { class: 'tag acct acct-unknown' }, 'View-only'), ' Add a token to make changes from this phone.'),
        tokenForm({ onDone: () => { rebuild(); env.rerender(); } }),
        tokenHelp());
    }
    out.push(gitSection);

    // Unsaved changes
    if (state.pending.length) {
      out.push(h('section', { class: 'sheet-section' }, h('h3', {}, 'Unsaved changes'),
        h('p', {}, `${state.pending.length} change${state.pending.length === 1 ? '' : 's'} waiting to save.`),
        state.saveError ? h('p', { class: 'form-msg error' }, state.saveError.message) : null,
        h('ul', { class: 'plain-list' }, state.pending.map((op) => h('li', {}, op.msg))),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn btn-solid', onClick: async () => { await flush(); rebuild(); } }, 'Retry now'),
          h('button', { type: 'button', class: 'btn btn-line danger', onClick: () => { if (confirm('Throw these changes away?')) { discardPending(); loadAll().then(rebuild); } } }, 'Discard'))));
    }

    // Data
    out.push(h('section', { class: 'sheet-section' }, h('h3', {}, 'Data'),
      h('p', {}, `Showing: ${SOURCE_LABEL[state.source] || 'nothing loaded yet'}.`),
      h('p', { class: 'small muted' }, `Last updated ${formatTime(state.loadedAt)} · today is ${state.today}`),
      state.problems.length ? h('div', { class: 'callout' }, h('p', {}, `⚠️ ${state.problems.length} thing${state.problems.length === 1 ? '' : 's'} in the data files looked off. The app skipped ${state.problems.length === 1 ? 'it' : 'them'} and kept going:`),
        h('ul', { class: 'plain-list small' }, state.problems.slice(0, 8).map((p) => h('li', {}, p)))) : null,
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn-line', onClick: async (e) => { e.target.textContent = 'Reloading…'; await loadAll(); rebuild(); toast('Reloaded'); } }, 'Reload data'))));

    // Repo (advanced)
    const owner = h('input', { type: 'text', value: cfg.owner, 'aria-label': 'Repository owner', autocapitalize: 'none', spellcheck: 'false' });
    const repo = h('input', { type: 'text', value: cfg.repo, 'aria-label': 'Repository name', autocapitalize: 'none', spellcheck: 'false' });
    const branch = h('input', { type: 'text', value: cfg.branch, 'aria-label': 'Branch', autocapitalize: 'none', spellcheck: 'false' });
    out.push(h('details', { class: 'sheet-section advanced' }, h('summary', {}, 'Repository (advanced)'),
      h('p', { class: 'small muted' }, 'Where the data lives. The branch should be the one GitHub Pages serves.'),
      h('div', { class: 'form-grid' }, h('label', { class: 'form-field' }, h('span', {}, 'Owner'), owner), h('label', { class: 'form-field' }, h('span', {}, 'Repo'), repo)),
      h('label', { class: 'form-field' }, h('span', {}, 'Branch'), branch),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn btn-line', onClick: async () => {
          setConfig({ owner: owner.value.trim(), repo: repo.value.trim(), branch: branch.value.trim() });
          await loadAll();
          rebuild();
          toast('Repository saved');
        } }, 'Save'),
        h('button', { type: 'button', class: 'btn btn-line', onClick: async () => {
          setConfig({ owner: null, repo: null, branch: null, apiBase: null });
          await loadAll();
          rebuild();
        } }, `Reset to ${DEFAULT_CONFIG.owner}/${DEFAULT_CONFIG.repo}`))));

    out.push(h('p', { class: 'small muted sheet-foot' }, 'POP! POP! · a market hub for Brooklyn SoftBoys'));
    return out;
  }

  rebuild();
  document.body.append(dlg);
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open', '');
}
