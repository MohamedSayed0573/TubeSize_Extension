import { APIData, HumanizedFormat, StorageData } from "./types";

export async function saveToStorage(
  tag: string,
  response: APIData | HumanizedFormat | null,
) {
  if (!response) return;
  response.createdAt = new Date().toISOString();

  const ttlInSeconds = 60 * 60 * 24 * 7;
  const expiry = Date.now() + ttlInSeconds * 1000;

  const dataToStore = {
    response,
    expiry,
  };

  await chrome.storage.local.set({
    [tag]: dataToStore,
  });
}

export async function getFromStorage(tag: string) {
  const data = await chrome.storage.local.get(tag);
  const item = data[tag] as StorageData | undefined;

  if (!item) return null;

  // Tag expired
  if (item.expiry && item.expiry < Date.now()) {
    await chrome.storage.local.remove(tag);
    return null;
  }

  return item.response;
}
