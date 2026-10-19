/* Save the encrypted portfolio back to this public repo with a fine-grained PAT.
   The token is sent only to api.github.com. It is not written into the repository. */
(function (g) {
  'use strict';
  const REPO = 'JMP90/portfolio-tracker';
  const BRANCH = 'main';
  const API = 'https://api.github.com';

  async function api(token, method, path, body) {
    const res = await fetch(API + path, {
      method: method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'portfolio-tracker',
        'Content-Type': 'application/json'
      },
      body: body == null ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { json = { message: text }; }
    if (!res.ok) {
      const err = new Error((json && json.message) || ('GitHub ' + res.status));
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  }
  async function getFile(token, path) {
    const j = await api(token, 'GET', '/repos/' + REPO + '/contents/' + path + '?ref=' + BRANCH);
    let bytes;
    if (j.content) bytes = g.PTCrypto.unb64(j.content);
    else if (j.download_url) {
      const res = await fetch(j.download_url);
      if (!res.ok) throw new Error('Could not download ' + path);
      bytes = new Uint8Array(await res.arrayBuffer());
    } else throw new Error('Empty file response for ' + path);
    return { sha: j.sha, bytes: bytes, json: j };
  }
  async function putFile(token, path, bytes, sha, message) {
    const body = {
      message: message || 'Update portfolio',
      content: g.PTCrypto.b64(bytes),
      branch: BRANCH
    };
    if (sha) body.sha = sha;
    try {
      return await api(token, 'PUT', '/repos/' + REPO + '/contents/' + path, body);
    } catch (e) {
      if (e.status === 422 || /too large|size/i.test(e.message || '')) {
        await putViaGit(token, path, bytes, message);
        const again = await getFile(token, path);
        return { content: { sha: again.sha }, commit: {} };
      }
      throw e;
    }
  }
  async function putViaGit(token, path, bytes, message) {
    const blob = await api(token, 'POST', '/repos/' + REPO + '/git/blobs', { content: g.PTCrypto.b64(bytes), encoding: 'base64' });
    const ref = await api(token, 'GET', '/repos/' + REPO + '/git/ref/heads/' + BRANCH);
    const commit = await api(token, 'GET', '/repos/' + REPO + '/git/commits/' + ref.object.sha);
    const tree = await api(token, 'POST', '/repos/' + REPO + '/git/trees', {
      base_tree: commit.tree.sha,
      tree: [{ path: path, mode: '100644', type: 'blob', sha: blob.sha }]
    });
    const neu = await api(token, 'POST', '/repos/' + REPO + '/git/commits', {
      message: message || 'Update portfolio', tree: tree.sha, parents: [ref.object.sha]
    });
    try {
      await api(token, 'PATCH', '/repos/' + REPO + '/git/refs/heads/' + BRANCH, { sha: neu.sha });
    } catch (e) {
      if (e.status === 422) {
        const err = new Error('GitHub moved while saving. Reload and try again.');
        err.status = 409;
        throw err;
      }
      throw e;
    }
    return neu;
  }
  g.PTGitHub = { REPO: REPO, BRANCH: BRANCH, api: api, getFile: getFile, putFile: putFile, putViaGit: putViaGit };
})(typeof globalThis !== 'undefined' ? globalThis : this);
