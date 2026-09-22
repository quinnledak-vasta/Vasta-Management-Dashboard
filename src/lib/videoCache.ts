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

function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function normalizeVideoMimeType(type?: string | null, fileName?: string | null): string {
  const ext = (fileName || '').toLowerCase().split('?')[0].split('#')[0];
  const t = (type || '').toLowerCase();

  if (t.startsWith('image/')) return t;
  if (t === 'application/pdf' || ext.endsWith('.pdf')) return 'application/pdf';
  if (t === 'video/webm' || ext.endsWith('.webm')) return 'video/webm';
  if (t === 'video/ogg' || ext.endsWith('.ogg') || ext.endsWith('.ogv')) return 'video/ogg';
  
  // QuickTime .mov, mp4, m4v, 3gp, octet-stream, or unknown video
  // video/mp4 is the universal container format that Chrome/Firefox/Safari use to activate H.264 video decoding
  return 'video/mp4';
}

function ensurePlayableBlob(blob: Blob | File | null, fileName?: string): Blob | null {
  if (!blob) return null;
  const targetMime = normalizeVideoMimeType(blob.type, fileName);
  if (blob.type === targetMime) {
    return blob;
  }
  // Wrap with normalized MIME type (e.g. converting video/quicktime to video/mp4 so Chrome decodes video frames)
  return new Blob([blob], { type: targetMime });
}

export async function dataUrlToBlobAsync(dataUrl: string, fallbackMime = 'video/mp4'): Promise<Blob> {
  if (!dataUrl) return new Blob([], { type: normalizeVideoMimeType(fallbackMime) });

  // 1. Native browser fetch on Data URLs is fast, memory-safe, and avoids atob callstack limitations
  if (typeof fetch === 'function' && dataUrl.startsWith('data:')) {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      if (blob && blob.size > 0) {
        return ensurePlayableBlob(blob) || blob;
      }
    } catch {
      // Fall through to manual chunked decode
    }
  }

  // 2. Robust manual base64 decode with Uint8Array
  try {
    let mime = fallbackMime;
    let base64Data = dataUrl;

    if (dataUrl.includes(',')) {
      const parts = dataUrl.split(',');
      const mimeMatch = parts[0].match(/:(.*?);/);
      if (mimeMatch) mime = mimeMatch[1];
      base64Data = parts[1] || '';
    }

    const normalizedMime = normalizeVideoMimeType(mime);
    const cleanB64 = base64Data.replace(/[\r\n\s]/g, '');
    if (!cleanB64) {
      return new Blob([], { type: normalizedMime });
    }

    const binaryString = atob(cleanB64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: normalizedMime });
  } catch (err) {
    console.error('Error converting data URL to Blob:', err);
    return new Blob([], { type: normalizeVideoMimeType(fallbackMime) });
  }
}

function chunkString(str: string, size = 350000): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.substring(i, i + size));
  }
  return chunks;
}

// Upload chunks in parallel batches of 4 for speed and reliable throughput
async function uploadChunksToFirestore(fileId: string, chunks: string[]): Promise<void> {
  const BATCH_SIZE = 4;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((chunkData, index) => {
        const chunkIndex = i + index;
        return setDoc(doc(db, 'lesson_files', fileId, 'chunks', `${chunkIndex}`), {
          chunkIndex,
          data: chunkData
        });
      })
    );
  }
}

export async function saveLocalVideo(file: File): Promise<string> {
  const dbInst = await getDB();
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 7);
  const fileId = `file_${timestamp}_${randomStr}_${cleanName}`;
  const key = `firestorefile_${fileId}`;

  // Normalize MIME type so videos (e.g. iPhone .mov/QuickTime or unspecified MP4) decode video frames cleanly
  const normalizedMime = normalizeVideoMimeType(file.type, file.name);

  // Create a clean, cloneable Blob to avoid DOM File handle serialization issues
  let blob: Blob;
  try {
    const arrayBuffer = await file.arrayBuffer();
    blob = new Blob([arrayBuffer], { type: normalizedMime });
  } catch {
    blob = new Blob([file], { type: normalizedMime });
  }

  // Save to IndexedDB locally for instant availability under multiple keys
  await new Promise<void>((resolve, reject) => {
    const transaction = dbInst.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put(blob, key);
    store.put(blob, fileId);
    store.put(blob, cleanName);
    store.put(blob, file.name);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  // Background sync to Firestore cloud storage so all team members can access it
  syncLocalBlobToFirestore(fileId, blob, file.name).catch((err) => {
    console.warn('Background Firestore sync queued/warn:', err);
  });

  return key;
}

const syncedKeys = new Set<string>();

export async function syncLocalBlobToFirestore(id: string, blob: Blob | File, originalName?: string): Promise<void> {
  if (!id || syncedKeys.has(id)) return;
  syncedKeys.add(id);

  try {
    const rawCleanId = id.replace(/^(firestorefile_|localfile_)/, '');
    const fileId = rawCleanId.startsWith('file_') ? rawCleanId : `file_${rawCleanId}`;
    const metaRef = doc(db, 'lesson_files', fileId);
    const metaSnap = await getDoc(metaRef);

    if (!metaSnap.exists()) {
      const altMetaRef = doc(db, 'lesson_files', rawCleanId);
      const altMetaSnap = await getDoc(altMetaRef);
      if (altMetaSnap.exists()) return;

      const fileName = originalName || (blob instanceof File ? blob.name : id.replace(/^(firestorefile_|localfile_)/, '').replace(/^file_\d+_[a-z0-9]+_/, ''));
      const dataUrl = await fileToDataUrl(blob);
      const chunks = chunkString(dataUrl, 350000);

      await setDoc(metaRef, {
        id: fileId,
        fileName: fileName || id,
        fileType: blob.type || 'video/mp4',
        size: blob.size,
        totalChunks: chunks.length,
        createdAt: new Date().toISOString()
      });

      await uploadChunksToFirestore(fileId, chunks);
      console.log(`Synced local blob ${id} to Firestore as ${fileId} (${chunks.length} chunks)`);
    }
  } catch (err) {
    syncedKeys.delete(id);
    console.warn(`Background cloud sync failed for ${id}:`, err);
  }
}

// Scans local IndexedDB and uploads ALL stored files to Firestore so other users can view them
export async function syncAllLocalVideosToFirestore(): Promise<number> {
  try {
    const dbInst = await getDB();
    const transaction = dbInst.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    const keys: string[] = await new Promise((resolve, reject) => {
      const req = store.getAllKeys();
      req.onsuccess = () => resolve((req.result || []).map(k => String(k)));
      req.onerror = () => reject(req.error);
    });

    let count = 0;
    for (const key of keys) {
      if (syncedKeys.has(key)) continue;
      const blob: Blob | File | null = await new Promise((resolve) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });

      if (blob && blob.size > 0) {
        await syncLocalBlobToFirestore(key, blob);
        count++;
      }
    }
    return count;
  } catch (err) {
    console.warn('Error syncing all local videos to Firestore:', err);
    return 0;
  }
}

export async function getLocalVideoBlob(id: string, fallbackName?: string): Promise<Blob | null> {
  if (!id) return null;

  // 1. Direct Data URL
  if (id.startsWith('data:')) {
    const blob = await dataUrlToBlobAsync(id);
    if (blob.size > 0) return blob;
  }

  // 2. Direct Blob URL (check if still accessible in current session)
  if (id.startsWith('blob:')) {
    try {
      const res = await fetch(id);
      if (res.ok) {
        const b = await res.blob();
        if (b.size > 0) return b;
      }
    } catch {
      // Object URL expired, continue searching by fallback / clean name
    }
  }

  // 3. Direct HTTP / HTTPS URL
  if (id.startsWith('http://') || id.startsWith('https://')) {
    try {
      const res = await fetch(id);
      if (res.ok) {
        const b = await res.blob();
        if (b.size > 0) return b;
      }
    } catch {
      // CORS or network failure, proceed to cache check
    }
  }

  const rawCleanId = id.replace(/^(firestorefile_|localfile_)/, '');
  const cleanFallbackName = fallbackName ? fallbackName.replace(/[^a-zA-Z0-9._-]/g, '_') : '';

  const candidateKeys = Array.from(new Set([
    id,
    rawCleanId,
    `firestorefile_${rawCleanId}`,
    `localfile_${rawCleanId}`,
    rawCleanId.startsWith('file_') ? rawCleanId : `file_${rawCleanId}`,
    `firestorefile_file_${rawCleanId}`,
    `localfile_file_${rawCleanId}`,
    ...(fallbackName ? [fallbackName, cleanFallbackName, `file_${cleanFallbackName}`] : [])
  ])).filter(Boolean);

  // 4. Try local IndexedDB first (fastest)
  try {
    const dbInst = await getDB();

    // Check candidate keys
    for (const keyCandidate of candidateKeys) {
      const localBlob: Blob | File | null = await new Promise((resolve) => {
        const transaction = dbInst.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(keyCandidate);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      });

      if (localBlob && localBlob.size > 0) {
        // Trigger background sync to Firestore if not synced
        syncLocalBlobToFirestore(keyCandidate, localBlob, fallbackName);
        return ensurePlayableBlob(localBlob, fallbackName);
      }
    }

    // Fallback search: scan all keys in IndexedDB if exact key match failed
    const allKeys: string[] = await new Promise((resolve) => {
      const transaction = dbInst.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAllKeys();
      request.onsuccess = () => resolve((request.result || []).map(k => String(k)));
      request.onerror = () => resolve([]);
    });

    const matchingKey = allKeys.find(k => {
      const kLower = k.toLowerCase();
      const rawLower = rawCleanId.toLowerCase();
      const fbLower = (fallbackName || '').toLowerCase();
      return (
        k === rawCleanId ||
        kLower.includes(rawLower) ||
        rawLower.includes(kLower) ||
        (fbLower && kLower.includes(fbLower)) ||
        (cleanFallbackName && k.includes(cleanFallbackName))
      );
    });

    if (matchingKey) {
      const matchedBlob: Blob | File | null = await new Promise((resolve) => {
        const transaction = dbInst.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(matchingKey);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      });

      if (matchedBlob && matchedBlob.size > 0) {
        // Cache under requested ID for future fast lookups
        try {
          const writeTx = dbInst.transaction(STORE_NAME, 'readwrite');
          writeTx.objectStore(STORE_NAME).put(matchedBlob, id);
        } catch {}

        return ensurePlayableBlob(matchedBlob, fallbackName);
      }
    }
  } catch (err) {
    console.warn('IndexedDB read error:', err);
  }

  // 5. If not in local IndexedDB, retrieve from Firestore cloud storage
  try {
    const firestoreDocCandidates = Array.from(new Set([
      rawCleanId,
      id,
      rawCleanId.startsWith('file_') ? rawCleanId : `file_${rawCleanId}`,
      rawCleanId.replace(/^file_/, ''),
      `firestorefile_${rawCleanId}`,
      `localfile_${rawCleanId}`,
      ...(cleanFallbackName ? [`file_${cleanFallbackName}`, cleanFallbackName] : [])
    ])).filter(Boolean);

    let targetDocSnap: any = null;
    let targetDocRef: any = null;

    for (const candidateId of firestoreDocCandidates) {
      const ref = doc(db, 'lesson_files', candidateId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        targetDocSnap = snap;
        targetDocRef = ref;
        break;
      }
    }

    // Fallback: query lesson_files collection if direct doc ID didn't match
    if (!targetDocSnap) {
      const filesColl = collection(db, 'lesson_files');
      const allFilesSnap = await getDocs(filesColl);
      
      const targetDoc = allFilesSnap.docs.find(d => {
        const data = d.data();
        const docId = d.id;
        const fileName = (data.fileName || '').toLowerCase();
        const rawLower = rawCleanId.toLowerCase();
        const fbLower = (fallbackName || '').toLowerCase();

        return (
          docId === rawCleanId ||
          docId.includes(rawCleanId) || 
          rawCleanId.includes(docId) || 
          fileName === rawLower ||
          (fbLower && (fileName === fbLower || docId.includes(fbLower) || fileName.includes(fbLower))) ||
          (rawCleanId.includes('_') && rawCleanId.split('_').slice(2).join('_').toLowerCase() === fileName)
        );
      });

      if (targetDoc) {
        targetDocSnap = targetDoc;
        targetDocRef = targetDoc.ref;
      }
    }

    if (targetDocSnap && targetDocRef) {
      const docData = targetDocSnap.data();

      // Check if file has subcollection chunks
      const chunksSnap = await getDocs(collection(targetDocRef, 'chunks'));
      if (!chunksSnap.empty) {
        const chunksData = chunksSnap.docs.map(d => d.data() as { chunkIndex: number; data: string });
        chunksData.sort((a, b) => Number(a.chunkIndex) - Number(b.chunkIndex));
        const fullDataUrl = chunksData.map(c => c.data).join('');
        const downloadedBlob = await dataUrlToBlobAsync(fullDataUrl, docData.fileType || 'video/mp4');

        if (downloadedBlob && downloadedBlob.size > 0) {
          // Save into local IndexedDB for fast subsequent reads
          try {
            const dbInst = await getDB();
            const transaction = dbInst.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            store.put(downloadedBlob, id);
            store.put(downloadedBlob, rawCleanId);
            store.put(downloadedBlob, targetDocSnap.id);
            if (fallbackName) {
              store.put(downloadedBlob, fallbackName);
            }
          } catch {}

          return ensurePlayableBlob(downloadedBlob, fallbackName || docData.fileName);
        }
      }

      // Check if file has direct dataUrl property in doc
      if (docData.dataUrl) {
        const downloadedBlob = await dataUrlToBlobAsync(docData.dataUrl, docData.fileType || 'video/mp4');
        if (downloadedBlob && downloadedBlob.size > 0) {
          try {
            const dbInst = await getDB();
            const transaction = dbInst.transaction(STORE_NAME, 'readwrite');
            transaction.objectStore(STORE_NAME).put(downloadedBlob, id);
          } catch {}
          return ensurePlayableBlob(downloadedBlob, fallbackName || docData.fileName);
        }
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
