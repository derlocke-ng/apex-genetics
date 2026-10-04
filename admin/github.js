// Minimal GitHub REST client for the admin panel.
// Reads the repository tree, fetches file contents and writes atomic
// multi-file commits through the Git Data API.

export class GitHubError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function explain(status, message) {
  if (status === 401) return 'GitHub rejected the token (expired or revoked?). Please sign in again.';
  if (status === 403 && /rate limit/i.test(message || '')) return 'GitHub API rate limit reached. Try again in a few minutes.';
  if (status === 403) return `Permission denied by GitHub${message ? `: ${message}` : ''}. Does the token have "Contents: Read and write" for this repository?`;
  if (status === 404) return 'Not found. Check the repository name, branch and that the token can access this repository.';
  if (status === 409) return 'The repository is empty or the branch is in a conflicting state.';
  return message || `GitHub request failed (HTTP ${status})`;
}

export function base64ToText(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

const memoryBlobs = new Map();

export class GitHub {
  constructor({ token, owner, repo, branch = 'main', apiBase = 'https://api.github.com' }) {
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.apiBase = apiBase.replace(/\/+$/, '');
  }

  get repoPath() {
    return `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
  }

  get webUrl() {
    return this.apiBase === 'https://api.github.com' ? `https://github.com/${this.owner}/${this.repo}` : null;
  }

  async request(method, path, body) {
    let res;
    try {
      res = await fetch(this.apiBase + path, {
        method,
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new GitHubError('Could not reach GitHub. Are you offline?', 0);
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new GitHubError(explain(res.status, data && data.message), res.status);
    return data;
  }

  user() {
    return this.request('GET', '/user');
  }

  repository() {
    return this.request('GET', this.repoPath);
  }

  async head() {
    const b = await this.request('GET', `${this.repoPath}/branches/${encodeURIComponent(this.branch)}`);
    return { headSha: b.commit.sha, treeSha: b.commit.commit.tree.sha };
  }

  /** Current branch head plus a Map of every file path -> { sha, size }. */
  async snapshot() {
    const { headSha, treeSha } = await this.head();
    const tree = await this.request('GET', `${this.repoPath}/git/trees/${treeSha}?recursive=1`);
    const files = new Map();
    for (const e of tree.tree) if (e.type === 'blob') files.set(e.path, { sha: e.sha, size: e.size });
    return { headSha, files, truncated: Boolean(tree.truncated) };
  }

  /** Raw base64 content of a blob (blobs are immutable, so cache by sha). */
  async blobBase64(sha) {
    if (memoryBlobs.has(sha)) return memoryBlobs.get(sha);
    const promise = this.request('GET', `${this.repoPath}/git/blobs/${sha}`).then((b) => b.content);
    memoryBlobs.set(sha, promise);
    promise.catch(() => memoryBlobs.delete(sha));
    return promise;
  }

  async text(sha) {
    const key = `kb-blob:${sha}`;
    try {
      const hit = localStorage.getItem(key);
      if (hit !== null) return hit;
    } catch { /* storage unavailable */ }
    const text = base64ToText(await this.blobBase64(sha));
    try {
      if (text.length < 200_000) localStorage.setItem(key, text);
    } catch { /* quota exceeded: fine, it's only a cache */ }
    return text;
  }

  /**
   * Create one commit on the branch.
   * @param {string} message
   * @param {Array<{path: string, content?: string, base64?: string, delete?: boolean}>} changes
   * @returns {Promise<string>} the new commit sha
   */
  async commit(message, changes) {
    const entries = [];
    for (const c of changes) {
      if (c.delete) {
        entries.push({ path: c.path, mode: '100644', type: 'blob', sha: null });
      } else if (c.base64 != null) {
        const blob = await this.request('POST', `${this.repoPath}/git/blobs`, { content: c.base64, encoding: 'base64' });
        entries.push({ path: c.path, mode: '100644', type: 'blob', sha: blob.sha });
      } else {
        entries.push({ path: c.path, mode: '100644', type: 'blob', content: c.content });
      }
    }
    for (let attempt = 0; ; attempt++) {
      const { headSha, treeSha } = await this.head();
      const tree = await this.request('POST', `${this.repoPath}/git/trees`, { base_tree: treeSha, tree: entries });
      const commit = await this.request('POST', `${this.repoPath}/git/commits`, { message, tree: tree.sha, parents: [headSha] });
      try {
        await this.request('PATCH', `${this.repoPath}/git/refs/heads/${this.branch}`, { sha: commit.sha, force: false });
        return commit.sha;
      } catch (err) {
        // Someone pushed in between: rebuild on top of the new head.
        if (err.status === 422 && attempt < 2) continue;
        throw err;
      }
    }
  }

  async workflowRuns(sha) {
    const q = sha ? `head_sha=${sha}` : `branch=${encodeURIComponent(this.branch)}`;
    const data = await this.request('GET', `${this.repoPath}/actions/runs?${q}&per_page=5`);
    return data.workflow_runs || [];
  }
}
