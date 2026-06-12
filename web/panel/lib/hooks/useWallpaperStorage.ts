"use client";

import { useCallback, useEffect, useState } from "react";

const IDB_NAME = "EyedBotWallpaper";
const IDB_VERSION = 1;
const IDB_STORE = "wallpaper";
const IDB_RECORD_ID = "panel-bg";

type WallpaperRecord = {
  id: string;
  kind: "image" | "video";
  mime: string;
  blob: Blob;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveWallpaperToIdb(file: File): Promise<{ kind: "image" | "video"; mime: string }> {
  const kind = file.type.startsWith("video/") ? "video" : "image";
  const db = await openDb();
  const record: WallpaperRecord = {
    id: IDB_RECORD_ID,
    kind,
    mime: file.type || (kind === "video" ? "video/mp4" : "image/jpeg"),
    blob: file,
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();
  return { kind, mime: record.mime };
}

export async function loadWallpaperFromIdb(): Promise<{ url: string; kind: "image" | "video"; mime: string } | null> {
  const db = await openDb();
  const record = await new Promise<WallpaperRecord | null>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const request = tx.objectStore(IDB_STORE).get(IDB_RECORD_ID);
    request.onsuccess = () => resolve((request.result as WallpaperRecord) || null);
    request.onerror = () => reject(request.error);
  });
  db.close();

  if (!record?.blob) return null;
  const url = URL.createObjectURL(record.blob);
  return { url, kind: record.kind, mime: record.mime };
}

export async function clearWallpaperFromIdb() {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(IDB_RECORD_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export function useWallpaperBlobUrl(enabled: boolean, storage: string) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || storage !== "indexeddb") {
      setBlobUrl((current) => {
        if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
        return null;
      });
      return;
    }

    const loaded = await loadWallpaperFromIdb();
    setBlobUrl((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return loaded?.url || null;
    });
  }, [enabled, storage]);

  useEffect(() => {
    void refresh();
    return () => {
      setBlobUrl((current) => {
        if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
        return null;
      });
    };
  }, [refresh]);

  return { blobUrl, refreshWallpaper: refresh };
}
