export interface Bookmark {
  id: string;
  title: string;
  url: string;
}

const KEY = "bookmarks";

export function load(): Bookmark[] {
  const raw = globalThis.localStorage?.getItem(KEY);
  return raw ? (JSON.parse(raw) as Bookmark[]) : [];
}

export function save(bookmarks: Bookmark[]): void {
  globalThis.localStorage?.setItem(KEY, JSON.stringify(bookmarks));
}
