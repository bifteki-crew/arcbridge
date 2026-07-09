import { load, save, type Bookmark } from "../lib/storage.js";
import { fetchBookmarks } from "../lib/api.js";

export interface BookmarksState {
  items: Bookmark[];
  add(bookmark: Bookmark): void;
  refresh(): Promise<void>;
}

export function useBookmarks(): BookmarksState {
  let items = load();

  function add(bookmark: Bookmark): void {
    items = [...items, bookmark];
    save(items);
  }

  async function refresh(): Promise<void> {
    items = await fetchBookmarks();
    save(items);
  }

  return { items, add, refresh };
}
