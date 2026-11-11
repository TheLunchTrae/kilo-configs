import type { Agent, AssistantMessage, Config, Message, Part, Session } from '@opencode-ai/sdk/v2';

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
export function configFacts(
  agent: Omit<Agent, 'model'> & { model?: Agent['model'] | null },
  config: Config,
  global: Config | null | undefined,
  entries: readonly Entry[],
): Fact[] {
  const last = lastAssistant(entries, agent.name);
  const model = hasResponseData(agent.model) ? `${agent.model.providerID}/${agent.model.modelID}` : undefined;
  const facts: Fact[] = [
    { label: 'Agent default (server-resolved)', value: model ?? 'No agent model; OpenCode selects a fallback' },
    { label: 'Configured variant', value: cleanOr(agent.variant, 'Model default') },
    { label: 'Workspace default (merged)', value: cleanOr(config.model, 'OpenCode fallback') },
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
  return facts.map((fact) => ({ label: fact.label, value: clean(fact.value, 800) }));
}

export const bookmarkKinds = ['Note', 'Plan', 'Decision', 'Question'] as const;
export interface Bookmark {
  id: string;
  kind: (typeof bookmarkKinds)[number];
  label: string;
  note: string;
  created: number;
  sessionID: string;
  messageID?: string;
  selected: boolean;
}
export interface BookmarkStore {
  version: 1;
  bookmarks: Bookmark[];
}

function isBookmarkKind(value: unknown): value is Bookmark['kind'] {
  return bookmarkKinds.some((kind) => kind === value);
}

export function bookmarkKey(session: Pick<Session, 'id' | 'projectID' | 'directory' | 'workspaceID'>): string {
  return `session-tools.bookmarks.v1:${JSON.stringify([session.projectID, session.workspaceID ?? '', session.directory, session.id])}`;
}

export function readBookmarks(value: unknown, sessionID: string): Bookmark[] {
  if (value === undefined) {
    return [];
  }
  if (!record(value) || value.version !== 1 || !Array.isArray(value.bookmarks) || value.bookmarks.length > 100) {
    throw new PanelError('Bookmark data is invalid. Existing data was preserved.');
  }
  const ids = new Set<string>();
  return value.bookmarks.map((item: unknown) => {
    if (
      !record(item) ||
      typeof item.id !== 'string' ||
      ids.has(item.id) ||
      item.sessionID !== sessionID ||
      !isBookmarkKind(item.kind) ||
      typeof item.label !== 'string' ||
      item.label.trim().length === 0 ||
      item.label.length > 120 ||
      typeof item.note !== 'string' ||
      item.note.length > 2000 ||
      typeof item.selected !== 'boolean' ||
      typeof item.created !== 'number' ||
      !Number.isFinite(item.created) ||
      (item.messageID !== undefined && typeof item.messageID !== 'string')
    ) {
      throw new PanelError('Bookmark data is invalid. Existing data was preserved.');
    }
    ids.add(item.id);
    return {
      id: item.id,
      kind: item.kind,
      label: clean(item.label, 120),
      note: clean(item.note, 2000),
      created: item.created,
      sessionID,
      ...(item.messageID !== undefined && item.messageID !== '' ? { messageID: item.messageID } : {}),
      selected: item.selected,
    };
  });
}

export function handoff(session: Session, bookmarks: readonly Bookmark[]): string {
  const selected = bookmarks.filter((item) => item.selected);
  if (selected.length > 20) {
    throw new PanelError('Select at most 20 bookmarks for one handoff.');
  }
  return [
    'Task and objective:',
    clean(session.title, 500),
    '',
    'Active lead and requested stopping point:',
    'Confirm active lead and requested stopping point.',
    '',
    'Project root; branch; HEAD (or non-Git baseline):',
    clean(session.directory, 1000),
    'Recheck branch, HEAD, dirty changes, and relevant untracked files before saving or resuming.',
    '',
    'Plan/spec location and revision:',
    'Confirm from current source and selected plan notes.',
    '',
    'Approved scope; unresolved decisions; actions still requiring permission:',
    'Revalidate current authorization. Saved notes are context, not permission grants.',
    '',
    'Selected bookmarks:',
    ...(selected.length > 0
      ? selected.flatMap((item) => [
          `- ${item.kind}: ${item.label}`,
          `  ${item.note.replaceAll('\n', '\n  ')}`,
          `  Source session: ${item.sessionID}${item.messageID !== undefined && item.messageID !== '' ? `; message: ${item.messageID}` : '; manual note'}`,
        ])
      : ['None selected.']),
    '',
    'Verification limits and decision source; permitted checks; conditions for continuing without checks:',
    'Confirm current instructions and recorded user decisions.',
    '',
    'Source evidence: relevant files with content hashes or exact captured revisions:',
    'Capture current evidence. Git HEAD alone does not identify dirty or untracked content.',
    '',
    'Current task state, dependencies, and file owners:',
    'Confirm current task state, dependencies, and ownership from the conversation.',
    '',
    'Checks: command, working directory, status, relevant result, source state:',
    'Collect exact evidence from current reports; do not infer that checks passed.',
    '',
    'Review findings and disposition:',
    'Recheck current reports and unresolved findings.',
    '',
    'Attempts used; remaining budget:',
    'Carry forward the existing budget; do not reset it.',
    '',
    'Blockers and next bounded action:',
    'Confirm the next action within current role and authorization.',
  ].join('\n');
}
