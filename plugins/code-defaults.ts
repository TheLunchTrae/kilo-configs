import type { Plugin } from '@kilocode/plugin';

// eslint-disable-next-line @typescript-eslint/require-await -- Kilo's plugin factory requires a Promise result.
const CodeDefaultsPlugin: Plugin = async () => ({
  // eslint-disable-next-line @typescript-eslint/require-await -- The config hook contract returns a Promise.
  config: async (config) => {
    const permission = config.agent?.code?.permission;
    if (permission === undefined) {
      return;
    }

    // The pinned SDK types omit the runtime's object-valued edit rules.
    const edit: unknown = permission.edit;
    if (edit === 'ask') {
      permission.edit = 'allow';
    } else if (typeof edit === 'object' && edit !== null && '*' in edit && edit['*'] === 'ask') {
      edit['*'] = 'allow';
    }
  },
});

export default { id: 'code-defaults', server: CodeDefaultsPlugin };
