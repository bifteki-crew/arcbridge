import { useBookmarks } from "../hooks/useBookmarks.js";

export function BookmarkList(): string {
  const { items } = useBookmarks();
  // Fixture stand-in for JSX — a real component would map items to <li>.
  return `BookmarkList(${items.length})`;
}
