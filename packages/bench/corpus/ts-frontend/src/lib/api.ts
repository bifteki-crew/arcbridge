import type { Bookmark } from "./storage.js";

export async function fetchBookmarks(): Promise<Bookmark[]> {
  const res = await fetch("/api/bookmarks");
  if (!res.ok) throw new Error("Failed to load bookmarks");
  return (await res.json()) as Bookmark[];
}

export async function createBookmark(input: Omit<Bookmark, "id">): Promise<Bookmark> {
  const res = await fetch("/api/bookmarks", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return (await res.json()) as Bookmark;
}
