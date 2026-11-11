import type { TuiPluginModule } from '@opencode-ai/plugin/tui';
import { clean, configFacts, hasResponseData } from './model.ts';
import { currentSession, snapshot, ui } from './client.ts';

export default {
  id: 'effective-config',
  // eslint-disable-next-line @typescript-eslint/require-await -- OpenCode requires a Promise-returning TUI registration hook.
  tui: async (api) => {
    const view = ui(api);
    const open = async () => {
      const client = api.client;
      const sessionID = api.route.current.name === 'session' ? currentSession(api) : undefined;
      const options = { signal: AbortSignal.any([api.lifecycle.signal, AbortSignal.timeout(15_000)]) };
      const [agents, config, global] = await Promise.all([
        client.app.agents({}, options),
        client.config.get({}, options),
        client.global.config.get(options),
      ]);
      const requestFailed = Boolean(agents.error) || Boolean(config.error);
      if (requestFailed || !hasResponseData(agents.data) || !hasResponseData(config.data)) {
        throw new Error('Configuration unavailable');
      }
      const effectiveConfig = config.data;
      let entries: Awaited<ReturnType<typeof snapshot>>['entries'] = [];
      if (sessionID !== undefined && sessionID !== '') {
        entries = (await snapshot(api, sessionID)).entries;
      }
      const activeID = api.route.current.name === 'session' ? currentSession(api) : undefined;
      if (api.lifecycle.signal.aborted || client !== api.client || sessionID !== activeID) {
        return;
      }
      view.menu(
        'Effective config: agent',
        agents.data.map((agent) => ({
          title: clean(agent.name),
          value: agent.name,
          description: clean(agent.description),
          category: agent.mode,
          run: () => {
            const facts = configFacts(agent, effectiveConfig, global.data, entries);
            view.menu(`Config: ${clean(agent.name)}`, [
              ...facts.map((fact, index) => ({
                title: fact.label,
                value: `fact:${index}`,
                description: fact.value,
                run: () => view.alert(fact.label, fact.value),
              })),
              {
                title: 'Effective permission rules',
                value: 'permissions',
                description: 'Ordered runtime rules; saved session approvals can also apply',
                run: () => {
                  view.menu(
                    'Agent permission rules',
                    agent.permission.map((rule, index) => ({
                      title: `${clean(rule.permission)}: ${clean(rule.action)}`,
                      value: String(index),
                      description: clean(rule.pattern, 800),
                      run: () =>
                        view.alert(
                          'Permission rule',
                          `${clean(rule.permission)}\n${clean(rule.pattern, 2000)}\n${clean(rule.action)}`,
                        ),
                    })),
                  );
                },
              },
              {
                title: 'MCP connections',
                value: 'mcp',
                description: 'Names and status only',
                run: () => {
                  const items = api.state.mcp();
                  view.menu(
                    'MCP connections',
                    items.length > 0
                      ? items.map((item) => ({
                          title: clean(item.name),
                          value: item.name,
                          description: clean(item.status),
                        }))
                      : [{ title: 'No MCP connections reported', value: 'empty' }],
                  );
                },
              },
              { title: 'Refresh configuration', value: 'refresh', run: open },
            ]);
          },
        })),
        true,
      );
    };
    view.command('effective-config.open', 'Inspect effective config', 'inspect-config', 'Config', open);
  },
} satisfies TuiPluginModule;
