// A tiny fake of the GitHub Contents API, just enough to test the app's save logic offline:
// real sha checking (stale sha → 409), and hooks to inject concurrent edits and failures.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export const TOKEN = 'test-token';

export function startMock({ port, dataDir }) {
  const files = new Map(); // path → { text, sha }
  let shaCounter = 1;
  const commits = []; // { path, message }
  const requests = []; // every request, for assertions
  const hooks = { failPuts: 0, failStatus: 409, failPath: null, beforePut: null };

  for (const name of fs.readdirSync(dataDir)) {
    if (name.endsWith('.json')) files.set(`data/${name}`, { text: fs.readFileSync(path.join(dataDir, name), 'utf8'), sha: `sha-${shaCounter++}` });
  }

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type, accept, x-github-api-version',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  };
  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', ...cors });
    res.end(JSON.stringify(body));
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    requests.push({ method: req.method, path: url.pathname });
    if (req.headers.authorization !== `Bearer ${TOKEN}`) { send(res, 401, { message: 'Bad credentials' }); return; }

    const repoMatch = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)$/);
    if (repoMatch && req.method === 'GET') { send(res, 200, { full_name: `${repoMatch[1]}/${repoMatch[2]}`, private: false, permissions: { push: true } }); return; }

    const m = url.pathname.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/);
    if (!m) { send(res, 404, { message: 'Not Found' }); return; }
    const filePath = decodeURIComponent(m[1]);
    const file = files.get(filePath);

    if (req.method === 'GET') {
      if (!file) { send(res, 404, { message: 'Not Found' }); return; }
      send(res, 200, { type: 'file', name: path.basename(filePath), path: filePath, sha: file.sha, content: Buffer.from(file.text).toString('base64'), encoding: 'base64' });
      return;
    }

    if (req.method === 'PUT') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      if (hooks.beforePut) await hooks.beforePut(filePath, body);
      if (hooks.failPuts > 0 && (!hooks.failPath || hooks.failPath === filePath)) {
        hooks.failPuts--;
        send(res, hooks.failStatus, { message: hooks.failStatus === 409 ? `${filePath} does not match ${file && file.sha}` : 'Server Error' });
        return;
      }
      if (!file || body.sha !== file.sha) { send(res, 409, { message: `${filePath} does not match ${file && file.sha}` }); return; }
      const text = Buffer.from(body.content, 'base64').toString('utf8');
      JSON.parse(text); // the app must always write valid JSON
      const next = { text, sha: `sha-${shaCounter++}` };
      files.set(filePath, next);
      commits.push({ path: filePath, message: body.message, branch: body.branch });
      send(res, 200, { content: { sha: next.sha }, commit: { message: body.message } });
      return;
    }
    send(res, 405, { message: 'Method not allowed' });
  });

  return new Promise((resolve) => server.listen(port, () => resolve({
    port, files, commits, requests, hooks,
    json: (p) => JSON.parse(files.get(p).text),
    /** Simulate Claude (or anyone) committing a change to a file between the app's load and its save. */
    edit(p, fn) {
      const data = JSON.parse(files.get(p).text);
      fn(data);
      files.set(p, { text: `${JSON.stringify(data, null, 2)}\n`, sha: `sha-${shaCounter++}` });
    },
    close: () => new Promise((r) => server.close(r)),
  })));
}
