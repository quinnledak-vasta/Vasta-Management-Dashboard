import { db } from './firebase';
import { doc, setDoc, getDoc, collection, getDocs } from 'firebase/firestore';

const DB_NAME = 'VastaVideoCache';
const STORE_NAME = 'videos';
const DB_VERSION = 1;

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  try {
    const parts = dataUrl.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch {
    return new Blob([], { type: 'application/octet-stream' });
  }
}

function chunkString(str: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.substring(i, i + size));
  }
  return chunks;
}

export async function saveLocalVideo(file: File): Promise<string> {
  const dbInst = await getDB();
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${cleanName}`;
  const key = `firestorefile_${fileId}`;

  // Save to IndexedDB locally for instant local response
  await new Promise<void>((resolve, reject) => {
    const transaction = dbInst.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(file, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  // Convert and sync to Firestore for cloud sharing across all team members
  try {
    const dataUrl = await fileToDataUrl(file);
    const chunks = chunkString(dataUrl, 450000);

    await setDoc(doc(db, 'lesson_files', fileId), {
      id: fileId,
      fileName: file.name,
      fileType: file.type || 'application/octet-stream',
      size: file.size,
      totalChunks: chunks.length,
      createdAt: new Date().toISOString()
    });

    for (let i = 0; i < chunks.length; i++) {
      await setDoc(doc(db, 'lesson_files', fileId, 'chunks', `${i}`), {
        chunkIndex: i,
        data: chunks[i]
      });
    }
  } catch (err) {
    console.warn('Failed to sync lesson file to Firestore cloud storage:', err);
  }

  return key;
}

const syncedKeys = new Set<string>();

async function syncLocalBlobToFirestore(id: string, blob: Blob | File): Promise<void> {
  if (syncedKeys.has(id)) return;
  syncedKeys.add(id);

  try {
    const fileId = id.replace(/^(firestorefile_|localfile_)/, '');
    const metaRef = doc(db, 'lesson_files', fileId);
    const metaSnap = await getDoc(metaRef);

    if (!metaSnap.exists()) {
      const file = blob instanceof File ? blob : new File([blob], id, { type: blob.type });
      const dataUrl = await fileToDataUrl(file);
      const chunks = chunkString(dataUrl, 450000);

      await setDoc(metaRef, {
        id: fileId,
        fileName: file.name || id,
        fileType: blob.type || 'application/octet-stream',
        size: blob.size,
        totalChunks: chunks.length,
        createdAt: new Date().toISOString()
      });

      for (let i = 0; i < chunks.length; i++) {
        await setDoc(doc(db, 'lesson_files', fileId, 'chunks', `${i}`), {
          chunkIndex: i,
          data: chunks[i]
        });
      }
    }
  } catch (err) {
    console.warn(`Background cloud sync failed for ${id}:`, err);
  }
}

export async function getLocalVideoBlob(id: string): Promise<Blob | null> {
  if (!id) return null;

  // 1. Try local IndexedDB first
  try {
    const dbInst = await getDB();
    const localBlob: Blob | File | null = await new Promise((resolve, reject) => {
      const transaction = dbInst.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });

    if (localBlob) {
      // Trigger background sync to Firestore if legacy or unsynced
      syncLocalBlobToFirestore(id, localBlob);
      return localBlob;
    }
  } catch (err) {
    console.warn('IndexedDB read error:', err);
  }

  // 2. If not in local IndexedDB, download from Firestore
  try {
    const fileId = id.replace(/^(firestorefile_|localfile_)/, '');
    
    // Attempt lookup by clean fileId first, then by raw id
    let metaRef = doc(db, 'lesson_files', fileId);
    let metaSnap = await getDoc(metaRef);
    if (!metaSnap.exists() && fileId !== id) {
      metaRef = doc(db, 'lesson_files', id);
      metaSnap = await getDoc(metaRef);
    }

    if (metaSnap.exists()) {
      const chunksSnap = await getDocs(collection(metaRef, 'chunks'));
      if (!chunksSnap.empty) {
        const chunksData = chunksSnap.docs.map(d => d.data() as { chunkIndex: number; data: string });
        chunksData.sort((a, b) => a.chunkIndex - b.chunkIndex);
        const fullDataUrl = chunksData.map(c => c.data).join('');
        const downloadedBlob = dataUrlToBlob(fullDataUrl);

        // Save into local IndexedDB for fast subsequent reads
        try {
          const dbInst = await getDB();
          const transaction = dbInst.transaction(STORE_NAME, 'readwrite');
          const store = transaction.objectStore(STORE_NAME);
          store.put(downloadedBlob, id);
        } catch {}

        return downloadedBlob;
      }
    }
  } catch (err) {
    console.error('Failed to fetch lesson file from Firestore cloud storage:', err);
  }

  return null;
}

export async function deleteLocalVideo(id: string): Promise<void> {
  try {
    const dbInst = await getDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = dbInst.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to delete video from IndexedDB:', err);
  }
}
