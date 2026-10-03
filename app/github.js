// Minimal GitHub Contents API client. The token comes from this device's localStorage and is only
// ever sent to the API host as an Authorization header. Never in a URL, never logged.

export class GitHubError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = 'GitHubError';
    this.status = status; // 0 = network failure
    this.detail = detail || null;
  }
}

const decodeB64 = (b64) => {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};
const encodeB64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

const headers = (token) => ({
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  Authorization: `Bearer ${token}`,
});

const contentsUrl = (cfg, path, withRef) => {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const base = `${cfg.apiBase}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${encoded}`;
  return withRef ? `${base}?ref=${encodeURIComponent(cfg.branch)}` : base;
};

async function request(url, init) {
  let res;
  try {
    res = await fetch(url, { cache: 'no-store', ...init });
  } catch (e) {
    throw new GitHubError("Can't reach GitHub. Are you offline?", 0, String(e && e.message));
  }
  if (res.ok) return res;
  let detail = null;
  try { detail = (await res.json()).message; } catch { /* body wasn't JSON */ }
  throw new GitHubError(describe(res.status, detail), res.status, detail);
}

function describe(status, detail) {
  if (status === 401) return 'GitHub rejected the token. It may have expired or been revoked.';
  if (status === 403) return 'GitHub refused the request. The token may be missing "Contents: read and write", or you hit a rate limit.';
  if (status === 404) return "GitHub can't find that file. Check the repo name and branch, and that the token is scoped to this repo.";
  if (status === 409 || status === 422) return 'Someone else changed this file at the same moment.';
  return `GitHub said ${status}${detail ? `: ${detail}` : ''}`;
}

/** A write lost a race (stale sha). Safe to re-fetch and retry. */
export const isConflict = (e) => e instanceof GitHubError && (e.status === 409 || e.status === 422);

/** Fetch a JSON file and its blob sha. */
export async function getFile({ cfg, token, path }) {
  const res = await request(contentsUrl(cfg, path, true), { headers: headers(token) });
  const body = await res.json();
  if (!body || body.type !== 'file' || typeof body.content !== 'string') throw new GitHubError(`${path} isn't a file on ${cfg.branch}`, 404);
  let data;
  try { data = JSON.parse(decodeB64(body.content)); } catch { throw new GitHubError(`${path} isn't valid JSON right now`, 0); }
  return { data, sha: body.sha };
}

/** Write a JSON file. `sha` must be the sha you read; GitHub rejects the write if the file moved on. */
export async function putFile({ cfg, token, path, data, sha, message }) {
  const body = { message, content: encodeB64(`${JSON.stringify(data, null, 2)}\n`), branch: cfg.branch };
  if (sha) body.sha = sha;
  const res = await request(contentsUrl(cfg, path, false), {
    method: 'PUT',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const out = await res.json();
  return { sha: out && out.content && out.content.sha };
}

/** Check a token can see the repo (and, when GitHub says so, write to it). */
export async function checkAccess({ cfg, token }) {
  const res = await request(`${cfg.apiBase}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`, { headers: headers(token) });
  const repo = await res.json();
  const perms = repo && repo.permissions;
  return { fullName: repo && repo.full_name, canPush: perms ? !!(perms.push || perms.admin) : null, private: !!(repo && repo.private) };
}
