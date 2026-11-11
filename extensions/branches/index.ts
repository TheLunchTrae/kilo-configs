import type { TuiPluginModule } from '@opencode-ai/plugin/tui';
import { dialogNavigation } from '../tui/navigation.ts';
import { type BranchAction, BranchError, BranchRepository, type BranchSnapshot } from './git.ts';
import { activity, localDirectory } from './state.ts';

export default {
  id: 'branches',
  // eslint-disable-next-line @typescript-eslint/require-await -- OpenCode requires a Promise-returning registration hook.
  tui: async (api) => {
    const view = dialogNavigation(api);
    let generation = 0;
    let running = false;
    let repository: BranchRepository;
    const valid = (token: number, client: typeof api.client) =>
      token === generation && client === api.client && !api.lifecycle.signal.aborted;
    const safe = (action: () => Promise<void>) => {
      void action().catch((error: unknown) => {
        if (!api.lifecycle.signal.aborted) {
          api.ui.toast({
            title: 'Branches',
            variant: 'error',
            message:
              error instanceof BranchError
                ? error.message
                : 'Could not read repository or server state. Refresh and retry.',
          });
        }
      });
    };
    const confirm = async (action: BranchAction, state: BranchSnapshot) => {
      const client = api.client;
      const token = generation;
      const sourceView = view.revision;
      const directory = await localDirectory(api);
      const warning = await activity(api, directory);
      if (
        token !== generation ||
        client !== api.client ||
        api.lifecycle.signal.aborted ||
        sourceView !== view.revision
      ) {
        return;
      }
      const label = `${action.kind}${'branch' in action ? ` ${action.branch}` : ''}${'name' in action ? ` → ${action.name}` : ''}${'remote' in action ? ` ${action.remote}` : ''}`;
      let confirmationView = -1;
      view.menu({
        title: `Confirm: ${label}`,
        current: 'cancel',
        options: [
          { title: 'Cancel', value: 'cancel', description: 'Leave the repository unchanged' },
          { title: warning, value: 'activity', disabled: true },
          {
            title: 'Other directory instances and processes cannot be detected. Sessions are never stopped.',
            value: 'limits',
            disabled: true,
          },
          {
            title: state.dirty ? 'Uncommitted changes exist. Git must preserve them.' : 'Working tree is clean.',
            value: 'dirty',
            disabled: true,
          },
          {
            title: 'Switching branches does not reset agent context. Reorient or start a new session.',
            value: 'context',
            disabled: true,
          },
          {
            title: `Continue: ${label}`,
            value: 'continue',
            description: 'No automatic stash, discard, force, or conflict resolution',
          },
        ],
        onSelect: (option) => {
          if (option.value === 'cancel') {
            view.back();
            return;
          }
          if (option.value !== 'continue' || running) {
            return;
          }
          safe(async () => {
            running = true;
            try {
              if (!valid(token, client) || confirmationView !== view.revision) {
                return;
              }
              if ((await localDirectory(api)) !== directory) {
                throw new BranchError('Project changed. Open /branches again.');
              }
              if ((await activity(api, directory)) !== warning) {
                throw new BranchError('Agent activity changed. Confirm again.');
              }
              if (!valid(token, client) || confirmationView !== view.revision || !api.ui.dialog.open) {
                return;
              }
              api.ui.toast({ title: 'Branches', message: `Running ${action.kind}…`, variant: 'info' });
              try {
                await repository.execute(
                  action,
                  state,
                  () => valid(token, client) && confirmationView === view.revision && api.ui.dialog.open,
                );
              } catch (error) {
                running = false;
                if (valid(token, client) && confirmationView === view.revision) {
                  // eslint-disable-next-line @typescript-eslint/no-use-before-define -- Confirmation callbacks run after panel registration.
                  await open();
                }
                throw error;
              }
              if (!valid(token, client)) {
                return;
              }
              running = false;
              // eslint-disable-next-line @typescript-eslint/no-use-before-define -- Confirmation callbacks run after panel registration.
              await open();
              api.ui.toast({
                title: 'Branches',
                message: 'Git operation completed. Repository state refreshed.',
                variant: 'success',
              });
            } finally {
              running = false;
            }
          });
        },
      });
      confirmationView = view.revision;
    };
    const prompt = (title: string, action: (name: string) => BranchAction, state: BranchSnapshot) => {
      view.prompt({ title, onConfirm: (name) => safe(() => confirm(action(name), state)) });
    };
    const open = async () => {
      if (running) {
        return;
      }
      const token = ++generation;
      const client = api.client;
      const directory = await localDirectory(api);
      repository = new BranchRepository(directory, api.lifecycle.signal);
      const state = await repository.snapshot();
      if (token !== generation || client !== api.client || api.lifecycle.signal.aborted) {
        return;
      }
      view.menu(
        {
          title: `Branches: ${state.current} · ${state.dirty ? 'dirty' : 'clean'}${state.conflicts > 0 ? ` · ${state.conflicts} conflict(s)` : ''}${state.operation ? ' · Git operation in progress' : ''}`,
          placeholder: 'Search branches or actions…',
          options: [
            ...state.branches.map((branch) => ({
              title: `${!branch.remote && branch.name === state.current ? '* ' : ''}${branch.name}`,
              value: branch.ref,
              category: branch.remote ? 'Remote' : 'Local',
              description: [
                branch.upstream,
                branch.tracking,
                branch.worktree !== '' ? `checked out: ${branch.worktree}` : '',
              ]
                .filter(Boolean)
                .join(' · '),
            })),
            { title: 'Create branch from current HEAD', value: 'create', category: 'Actions' },
            { title: 'Fetch a remote', value: 'fetch', category: 'Actions' },
            { title: 'Pull current upstream (fast-forward only)', value: 'pull', category: 'Actions' },
            { title: 'Refresh', value: 'refresh', category: 'Actions' },
          ],
          onSelect: (option) => {
            if (running) {
              return;
            }
            if (option.value === 'refresh') {
              safe(open);
              return;
            }
            if (option.value === 'create') {
              prompt('New branch name', (name) => ({ kind: 'create', name }), state);
              return;
            }
            if (option.value === 'pull') {
              safe(() => confirm({ kind: 'pull' }, state));
              return;
            }
            if (option.value === 'fetch') {
              view.menu({
                title: 'Fetch remote',
                options: state.remotes.map((remote) => ({ title: remote, value: remote })),
                onSelect: (remote) => safe(() => confirm({ kind: 'fetch', remote: remote.value }, state)),
              });
              return;
            }
            const branch = state.branches.find((item) => item.ref === option.value);
            if (branch === undefined) {
              return;
            }
            if (branch.remote) {
              view.menu({
                title: branch.name,
                options: [
                  { title: 'Create local tracking branch', value: 'track' },
                  { title: `Merge into ${state.current}`, value: 'merge' },
                ],
                onSelect: (selection) => {
                  if (selection.value === 'track') {
                    prompt(
                      `Track ${branch.name}: local branch name`,
                      (name) => ({ kind: 'create', name, start: branch.ref }),
                      state,
                    );
                  } else if (selection.value === 'merge') {
                    safe(() => confirm({ kind: 'merge', branch: branch.ref }, state));
                  }
                },
              });
              return;
            }
            view.menu({
              title: branch.name,
              options: [
                { title: 'Switch', value: 'switch' },
                { title: 'Rename', value: 'rename' },
                { title: 'Delete (merged branches only)', value: 'delete' },
                { title: `Merge into ${state.current}`, value: 'merge' },
              ],
              onSelect: (selection) => {
                if (selection.value === 'rename') {
                  prompt('New branch name', (name) => ({ kind: 'rename', branch: branch.name, name }), state);
                  return;
                }
                if (selection.value === 'switch' || selection.value === 'delete' || selection.value === 'merge') {
                  const kind = selection.value;
                  safe(() => confirm({ kind, branch: branch.name }, state));
                }
              },
            });
          },
        },
        true,
      );
    };
    api.keymap.registerLayer({
      commands: [
        {
          name: 'branches.open',
          title: 'Manage Git branches',
          category: 'Git',
          namespace: 'palette',
          slashName: 'branches',
          run: () => safe(open),
        },
      ],
    });
  },
} satisfies TuiPluginModule;
