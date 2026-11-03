import type { Register } from 'claude-code';

const SKIP = new Set(['node_modules', 'dist', 'build', 'out', 'target', 'vendor']);
const MAX_REPOS = 20;
const MAX_STATUS_LINES = 15;

const isAbsolute = (p: string) => /^([a-zA-Z]:[\\/]|[\\/])/.test(p);
const join = (base: string, name: string) => `${base.replace(/[\\/]+$/, '')}/${name}`;

// .code-workspace is JSONC: drop comments and trailing commas before parsing.
function parseJsonc(text: string): any {
  const noComments = text.replace(
    /("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (_m, str) => (str ? str : ''),
  );
  return JSON.parse(noComments.replace(/,(\s*[}\]])/g, '$1'));
}

async function build($: any, cwd: string): Promise<string | null> {
  const run = async (argv: string[], dir: string): Promise<string | null> => {
    try {
      const r = await $.process.run(argv, { cwd: dir, timeoutMs: 10000 });
      return r.exitCode === 0 ? r.stdout.trim() : null;
    } catch {
      return null;
    }
  };

  let entries: Array<{ name: string; kind: string }> = [];
  try {
    entries = await $.fs.list(cwd);
  } catch {
    return null;
  }

  const workspaceFile = entries.find((x) => x.kind === 'file' && x.name.endsWith('.code-workspace'));
  const cwdIsRepo = entries.some((x) => x.name === '.git');
  const dirs: string[] = [];
  let source = '';

  if (workspaceFile) {
    try {
      const ws = parseJsonc(await $.fs.read(join(cwd, workspaceFile.name)));
      for (const f of ws.folders ?? []) {
        if (typeof f?.path === 'string') dirs.push(isAbsolute(f.path) ? f.path : join(cwd, f.path));
      }
      source = `workspace file ${workspaceFile.name}`;
    } catch {
      /* unreadable workspace file: fall back to scanning */
    }
  }

  if (!dirs.length) {
    if (cwdIsRepo) return null; // the engine already reports a repo opened directly
    for (const x of entries) {
      if (x.kind !== 'directory' || x.name.startsWith('.') || SKIP.has(x.name)) continue;
      const child = join(cwd, x.name);
      if (await $.fs.exists(join(child, '.git'))) dirs.push(child);
    }
    source = 'git repos found in subfolders';
  }

  if (!dirs.length) return null;

  const lines: string[] = [];
  for (const dir of dirs.slice(0, MAX_REPOS)) {
    if (!(await $.fs.exists(join(dir, '.git')))) continue;
    const branch = (await run(['git', 'branch', '--show-current'], dir)) || '(detached)';
    const status = await run(['git', 'status', '--short'], dir);
    if (status === null) continue;
    const changed = status ? status.split('\n') : [];
    lines.push(`- ${dir} [branch: ${branch}] — ${changed.length ? `${changed.length} uncommitted change(s)` : 'clean'}`);
    for (const c of changed.slice(0, MAX_STATUS_LINES)) lines.push(`    ${c}`);
    if (changed.length > MAX_STATUS_LINES) lines.push(`    ... and ${changed.length - MAX_STATUS_LINES} more`);
  }
  if (!lines.length) return null;

  return [
    `The working directory ${cwd} is not itself a git repo, but it contains these (${source}).`,
    'Use `git -C <path>` to inspect or change them; each repo has its own branches, commits and PRs.',
    'Snapshot taken when the session started:',
    ...lines,
  ].join('\n');
}

export const register: Register = (on) => {
  let cached: Promise<string | null> | undefined;

  on('session.start', async ($, e, next) => {
    cached = build($, e.cwd);
    return next(e);
  });

  on('prompt.compose', async ($, e, next) => {
    const result = await next(e);
    cached ??= build($, await $.session.cwd());
    const text = await cached;
    if (!text) return result;
    return {
      sections: [...result.sections, { id: 'workspace-git:repos', text, scope: 'session' as const }],
    };
  });
};
