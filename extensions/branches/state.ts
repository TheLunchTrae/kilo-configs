import type { TuiPluginApi } from '@opencode-ai/plugin/tui';
import { realpath } from 'node:fs/promises';
import { isAbsolute, relative } from 'node:path';
import { BranchError, BranchRepository } from './git.ts';

export function embeddedRequest(request: Request): boolean {
  const url = new URL(request.url);
  return (
    url.origin === 'http://opencode.internal' &&
    !url.searchParams.has('workspace') &&
    !request.headers.has('x-opencode-workspace')
  );
}

export async function localDirectory(api: TuiPluginApi): Promise<string> {
  const response = await api.client.path.get(
    {},
    { signal: AbortSignal.any([api.lifecycle.signal, AbortSignal.timeout(10_000)]) },
  );
  if (
    Boolean(response.error) ||
    response.data === undefined ||
    !embeddedRequest(response.request) ||
    process.argv.includes('attach')
  ) {
    throw new BranchError(
      '/branches requires the local embedded OpenCode server. Attached or remote servers are not supported.',
    );
  }
  const directory = await realpath(response.data.directory);
  if (directory !== (await realpath(process.cwd())) || directory !== (await realpath(api.state.path.directory))) {
    throw new BranchError('Project location changed or is not local. Open OpenCode in the worktree root.');
  }
  return directory;
}

export async function activity(api: TuiPluginApi, directory: string): Promise<string> {
  try {
    const options = { signal: AbortSignal.any([api.lifecycle.signal, AbortSignal.timeout(10_000)]) };
    const [statuses, permissions, questions] = await Promise.all([
      api.client.session.status({ directory }, options),
      api.client.permission.list({ directory }, options),
      api.client.question.list({ directory }, options),
    ]);
    if (
      Boolean(statuses.error) ||
      Boolean(permissions.error) ||
      Boolean(questions.error) ||
      statuses.data === undefined ||
      permissions.data === undefined ||
      questions.data === undefined
    ) {
      return 'Activity unavailable. An agent could still be working.';
    }
    const ids = new Set([
      ...Object.entries(statuses.data)
        .filter(([, status]) => status.type !== 'idle')
        .map(([id]) => id),
      ...permissions.data.map((item) => item.sessionID),
      ...questions.data.map((item) => item.sessionID),
    ]);
    let active = 0;
    for (const sessionID of ids) {
      const session = await api.client.session.get({ sessionID, directory }, options);
      if (Boolean(session.error) || session.data === undefined) {
        return 'Activity unavailable. An agent could still be working.';
      }
      const sessionDirectory = await realpath(session.data.directory);
      const within = relative(directory, sessionDirectory);
      if (within === '..' || within.startsWith('../') || within.startsWith('..\\') || isAbsolute(within)) {
        continue;
      }
      if ((await new BranchRepository(sessionDirectory, options.signal).root()) === directory) {
        active++;
      }
    }
    return active > 0
      ? `${active} active or waiting session(s) in this worktree. Wait for them to finish.`
      : 'No active sessions reported for this directory instance.';
  } catch {
    return 'Activity unavailable. An agent could still be working.';
  }
}
