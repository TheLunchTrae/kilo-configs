import type { TuiPluginApi } from '@opencode-ai/plugin/tui';
import type { Session } from '@opencode-ai/sdk/v2';
import { type Bookmark, type BookmarkStore, PanelError, bookmarkKey, readBookmarks } from './model.ts';

export function bookmarkStore(api: Pick<TuiPluginApi, 'kv'>, data: { session: Session }) {
  const key = bookmarkKey(data.session);
  const read = () => {
    if (!api.kv.ready) {
      throw new PanelError('Bookmark storage is still loading. Try again shortly.');
    }
    return readBookmarks(api.kv.get(key), data.session.id);
  };
  const write = (change: (current: Bookmark[]) => Bookmark[]) => {
    const next = change(read());
    const payload: BookmarkStore = { version: 1, bookmarks: next };
    readBookmarks(payload, data.session.id);
    api.kv.set(key, payload);
  };
  return { read, write };
}
