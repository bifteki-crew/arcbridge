import { createBookmark } from "../lib/api.js";
import type { Bookmark } from "../lib/storage.js";

export interface BookmarkFormProps {
  onCreated(bookmark: Bookmark): void;
}

export function BookmarkForm({ onCreated }: BookmarkFormProps): string {
  async function submit(title: string, url: string): Promise<void> {
    const created = await createBookmark({ title, url });
    onCreated(created);
  }

  // Fixture stand-in for JSX — returns a marker so the indexer sees a component.
  void submit;
  return "BookmarkForm";
}
