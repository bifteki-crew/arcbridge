import { BookmarkList } from "./components/BookmarkList.js";
import { BookmarkForm } from "./components/BookmarkForm.js";

export function App(): string {
  const list = BookmarkList();
  const form = BookmarkForm({ onCreated: () => undefined });
  return `${form}\n${list}`;
}
