const DB_NAME    = "lawrenn-docs";
const DB_VERSION = 1;
const STORE      = "documents";

export interface DocMeta {
  id:        string;
  name:      string;
  updatedAt: number;
}

export interface StoredDoc extends DocMeta {
  buffer: ArrayBuffer;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function listDocMeta(): Promise<DocMeta[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => {
      const all = (req.result as StoredDoc[]).map(({ id, name, updatedAt }) => ({ id, name, updatedAt }));
      resolve(all.sort((a, b) => b.updatedAt - a.updatedAt));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getDoc(id: string): Promise<StoredDoc | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as StoredDoc | undefined);
    req.onerror   = () => reject(req.error);
  });
}

export async function saveDoc(doc: StoredDoc): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).put(doc);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

export async function deleteDoc(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}
