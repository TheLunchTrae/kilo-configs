import type { TuiDialogSelectOption, TuiPluginApi } from '@opencode-ai/plugin/tui';
import type { Session } from '@opencode-ai/sdk/v2';
import { type Entry, PanelError, clean, hasResponseData, historyLimit } from './model.ts';
import { dialogNavigation } from '../tui/navigation.ts';

export type Action = TuiDialogSelectOption<string> & { run?: () => void | Promise<void> };
export interface Snapshot {
  session: Session;
  entries: Entry[];
  limited: boolean;
}

export function currentSession(api: TuiPluginApi): string {
  const route = api.route.current;
  const id = route.name === 'session' ? route.params?.sessionID : undefined;
  if (typeof id !== 'string') {
    throw new PanelError('Open a session before using this panel.');
  }
  return id;
}

export async function snapshot(api: TuiPluginApi, sessionID: string, signal = api.lifecycle.signal): Promise<Snapshot> {
  const client = api.client;
  const options = { signal: AbortSignal.any([signal, api.lifecycle.signal, AbortSignal.timeout(15_000)]) };
  const [session, messages] = await Promise.all([
    client.session.get({ sessionID }, options),
    client.session.messages({ sessionID, limit: historyLimit }, options),
  ]);
  const requestFailed = Boolean(session.error) || Boolean(messages.error);
  if (requestFailed || !hasResponseData(session.data) || !hasResponseData(messages.data)) {
    throw new PanelError('Could not read this session. It may have been deleted or the server is unavailable.');
  }
  return { session: session.data, entries: messages.data, limited: messages.data.length >= historyLimit };
}

export function ui(api: TuiPluginApi) {
  const navigation = dialogNavigation(api);
  const run = (action: () => void | Promise<void>) => {
    const client = api.client;
    return Promise.resolve()
      .then(() => {
        if (api.lifecycle.signal.aborted || client !== api.client) {
          return;
        }
        return action();
      })
      .catch((error: unknown) => {
        if (api.lifecycle.signal.aborted || client !== api.client) {
          return;
        }
        try {
          api.ui.toast({
            title: 'Session tools',
            variant: 'error',
            message:
              error instanceof PanelError
                ? error.message
                : 'Could not complete the action. Check the session and server connection, then retry.',
            duration: 6000,
          });
        } catch {
          // Notifications are best effort. A UI failure must not reject a host callback.
        }
      });
  };
  const menu = (title: string, actions: readonly Action[] | (() => readonly Action[]), root = false) => {
    if (api.lifecycle.signal.aborted) {
      return;
    }
    const items = () => (typeof actions === 'function' ? actions() : actions);
    navigation.menu(
      {
        title,
        placeholder: 'Search…',
        get options() {
          return [...items()];
        },
        onSelect: (option) => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises -- run reports action failures through the UI.
          void run(() =>
            items()
              .find((item) => item.value === option.value)
              ?.run?.(),
          );
        },
      },
      root,
    );
  };
  const alert = (title: string, message: string) => {
    if (api.lifecycle.signal.aborted) {
      return;
    }
    navigation.alert({ title, message: clean(message, 30_000) });
  };
  const prompt = (title: string, value: string, save: (text: string) => void | Promise<void>) => {
    if (api.lifecycle.signal.aborted) {
      return;
    }
    navigation.prompt({
      title,
      value,
      onConfirm: (text) => {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises -- run reports action failures through the UI.
        void run(() => save(text));
      },
    });
  };
  const command = (
    name: string,
    title: string,
    slashName: string,
    category: string,
    action: () => void | Promise<void>,
  ) => {
    api.keymap.registerLayer({
      commands: [
        {
          name,
          title,
          category,
          namespace: 'palette',
          slashName,
          run: () => {
            navigation.reset();
            return run(action);
          },
        },
      ],
    });
  };
  return { run, menu, alert, prompt, command, navigation };
}

export function historyNote(value: Snapshot): string {
  return value.limited ? `Recent ${historyLimit} messages; older evidence is not loaded.` : 'Loaded session history.';
}
