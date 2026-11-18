import type { Agent, AssistantMessage, Config, Message, Part } from '@kilocode/sdk/v2';

export interface Entry {
  info: Message;
  parts: Part[];
}
export class PanelError extends Error {}
export const historyLimit = 200;

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasResponseData<T extends object | null | undefined>(value: T): value is NonNullable<T> {
  return Boolean(value);
}

export function clean(value: unknown, limit = 400): string {
  if (typeof value !== 'string') {
    return '';
  }
  return (
    value
      // eslint-disable-next-line no-control-regex -- Remove terminal OSC sequences and their control-character terminators.
      .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '')
      // eslint-disable-next-line no-control-regex, regexp/no-obscure-range -- These ranges define the standard terminal CSI sequence syntax.
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
      // eslint-disable-next-line no-control-regex -- Remove control characters from user-visible terminal text.
      .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '')
      .slice(0, limit)
  );
}

function cleanOr(value: unknown, fallback: string): string {
  const text = clean(value);
  return text.length > 0 ? text : fallback;
}

function nonzero(value: number | undefined): boolean {
  const number = value ?? 0;
  return number !== 0 && !Number.isNaN(number);
}

export function ordered(entries: readonly Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    const difference = a.info.time.created - b.info.time.created;
    return difference !== 0 && !Number.isNaN(difference) ? difference : a.info.id.localeCompare(b.info.id);
  });
}

export function lastAssistant(entries: readonly Entry[], agent?: string): AssistantMessage | undefined {
  return ordered(entries)
    .map((entry) => entry.info)
    .findLast(
      (info): info is AssistantMessage =>
        info.role === 'assistant' && (agent === undefined || agent === '' || info.agent === agent),
    );
}

export interface ContextRecord {
  kind: 'file' | 'skill' | 'compaction';
  label: string;
  evidence: string;
  messageID: string;
}
export function contextRecords(entries: readonly Entry[]): ContextRecord[] {
  const result: ContextRecord[] = [];
  for (const entry of ordered(entries)) {
    for (const part of entry.parts) {
      const source = { messageID: entry.info.id };
      if (part.type === 'file') {
        result.push({
          ...source,
          kind: 'file',
          label: cleanOr(part.filename, 'Unnamed attachment'),
          evidence: 'Attachment recorded in history',
        });
      }
      if (part.type === 'compaction') {
        result.push({
          ...source,
          kind: 'compaction',
          label: part.auto ? 'Automatic compaction requested' : 'Manual compaction requested',
          evidence: 'Request recorded; history presence does not prove current prompt inclusion',
        });
      }
      if (entry.info.role === 'assistant' && entry.info.summary === true && part.type === 'text') {
        if (!result.some((item) => item.kind === 'compaction' && item.messageID === entry.info.id)) {
          result.push({
            ...source,
            kind: 'compaction',
            label: 'Summary recorded',
            evidence: nonzero(entry.info.time.completed)
              ? 'Summary response completed'
              : 'Summary response in progress',
          });
        }
      }
      if (part.type !== 'tool' || part.state.status !== 'completed') {
        continue;
      }
      if (part.tool === 'read') {
        result.push({
          ...source,
          kind: 'file',
          label: cleanOr(part.state.input.filePath ?? part.state.input.path, 'Read target unavailable'),
          evidence: nonzero(part.state.time.compacted)
            ? 'Read completed; tool output later compacted'
            : 'Read tool completed',
        });
      }
      if (part.tool === 'skill') {
        result.push({
          ...source,
          kind: 'skill',
          label: cleanOr(part.state.input.name, 'Skill name unavailable'),
          evidence: 'Skill tool completed',
        });
      }
    }
  }
  return result;
}

export interface Fact {
  label: string;
  value: string;
}

function parameterText(name: string, value: unknown): string {
  const credential = (key: string) =>
    /api[_-]?key|secret|password|authorization|cookie|private[_-]?key|^token$|(?:access|refresh|auth|session|bearer|security|id)[_-]?token$/i.test(
      key,
    );
  return JSON.stringify(
    credential(name) ? '[redacted]' : value,
    (key, item: unknown) => (credential(key) ? '[redacted]' : typeof item === 'string' ? clean(item, 30_000) : item),
    2,
  );
}

export function configFacts(
  agent: Omit<Agent, 'model'> & { model?: Agent['model'] | null },
  config: Config,
  global: Config | null | undefined,
  entries: readonly Entry[],
): Fact[] {
  const last = lastAssistant(entries, agent.name);
  const model = hasResponseData(agent.model) ? `${agent.model.providerID}/${agent.model.modelID}` : undefined;
  const facts: Fact[] = [
    { label: 'Agent default (server-resolved)', value: model ?? 'No agent model; Kilo selects a fallback' },
    { label: 'Provider', value: agent.model?.providerID ?? 'Kilo fallback' },
    { label: 'Model', value: agent.model?.modelID ?? 'Kilo fallback' },
    { label: 'Configured variant', value: cleanOr(agent.variant, 'Model default') },
    ...(agent.temperature === undefined
      ? []
      : [{ label: 'Configured temperature', value: parameterText('temperature', agent.temperature) }]),
    ...(agent.topP === undefined ? [] : [{ label: 'Configured top_p', value: parameterText('top_p', agent.topP) }]),
    ...Object.entries(agent.options).map(([key, value]) => ({
      label: `options.${clean(key)}`,
      value: parameterText(key, value),
    })),
    { label: 'Workspace default (merged)', value: cleanOr(config.model, 'Kilo fallback') },
    {
      label: 'Global file default',
      value: hasResponseData(global) ? cleanOr(global.model, 'Not configured') : 'Unavailable',
    },
    {
      label: 'Last recorded model for this agent',
      value: last !== undefined ? `${last.providerID}/${last.modelID}` : 'No recorded turn in loaded history',
    },
    {
      label: 'Last recorded variant',
      value: last !== undefined ? cleanOr(last.variant, 'Not recorded') : 'No recorded turn',
    },
    {
      label: 'Model source',
      value:
        model !== undefined
          ? 'Resolved agent configuration, including plugin changes'
          : 'No agent pin. Session selection, workspace default, or provider fallback can apply.',
    },
    { label: 'Origin file', value: 'V1 returns merged settings; exact file provenance is not exposed' },
  ];
  return facts.map((fact) => ({ label: fact.label, value: clean(fact.value, 30_000) }));
}
