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

function dataUrlToBlob(dataUrl: string): Blob {
  try {
    let mime = 'application/octet-stream';
    let base64Data = dataUrl;

    if (dataUrl.includes(',')) {
      const parts = dataUrl.split(',');
      const mimeMatch = parts[0].match(/:(.*?);/);
      if (mimeMatch) mime = mimeMatch[1];
      base64Data = parts[1] || '';
    }

    if (!base64Data) {
      return new Blob([], { type: mime });
    }

    const bstr = atob(base64Data);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (err) {
    console.error('Error converting data URL to Blob:', err);
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

// Upload chunks in parallel batches of 5 for speed and reliability
async function uploadChunksToFirestore(fileId: string, chunks: string[]): Promise<void> {
  const BATCH_SIZE = 5;
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

  // Create a clean, cloneable Blob to avoid DOM File handle serialization issues
  let blob: Blob;
  try {
    const arrayBuffer = await file.arrayBuffer();
    blob = new Blob([arrayBuffer], { type: file.type || 'application/octet-stream' });
  } catch {
    blob = new Blob([file], { type: file.type || 'application/octet-stream' });
  }

  // Save to IndexedDB locally for instant availability
  await new Promise<void>((resolve, reject) => {
    const transaction = dbInst.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put(blob, key);
    if (fileId !== key) {
      store.put(blob, fileId);
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  // Background sync to Firestore cloud storage so other team members can access it
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

      const fileName = blob instanceof File ? blob.name : id.replace(/^(firestorefile_|localfile_)/, '').replace(/^file_\d+_[a-z0-9]+_/, '');
      const dataUrl = await fileToDataUrl(blob);
      const chunks = chunkString(dataUrl, 400000);

      await setDoc(metaRef, {
        id: fileId,
        fileName: fileName || id,
        fileType: blob.type || 'application/octet-stream',
        size: blob.size,
        totalChunks: chunks.length,
        createdAt: new Date().toISOString()
      });

      await uploadChunksToFirestore(fileId, chunks);
      console.log(`Synced local blob ${id} to Firestore as ${fileId}`);
    }
  } catch (err) {
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

export async function getLocalVideoBlob(id: string): Promise<Blob | null> {
  if (!id) return null;

  const rawCleanId = id.replace(/^(firestorefile_|localfile_)/, '');
  const candidateKeys = Array.from(new Set([
    id,
    rawCleanId,
    `firestorefile_${rawCleanId}`,
    `localfile_${rawCleanId}`,
    rawCleanId.startsWith('file_') ? rawCleanId : `file_${rawCleanId}`,
    `firestorefile_file_${rawCleanId}`,
    `localfile_file_${rawCleanId}`,
  ]));

  // 1. Try local IndexedDB first
  try {
    const dbInst = await getDB();
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
        syncLocalBlobToFirestore(keyCandidate, localBlob);
        return localBlob;
      }
    }
  } catch (err) {
    console.warn('IndexedDB read error:', err);
  }

  // 2. If not in local IndexedDB, download from Firestore
  try {
    // Check candidate Firestore doc IDs
    const firestoreDocCandidates = Array.from(new Set([
      rawCleanId,
      id,
      rawCleanId.startsWith('file_') ? rawCleanId : `file_${rawCleanId}`,
      `firestorefile_${rawCleanId}`,
      `localfile_${rawCleanId}`
    ]));

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

    // 3. Fallback: query lesson_files collection if doc ID mismatch
    if (!targetDocSnap) {
      const filesColl = collection(db, 'lesson_files');
      const allFilesSnap = await getDocs(filesColl);
      
      const targetDoc = allFilesSnap.docs.find(d => {
        const data = d.data();
        const docId = d.id;
        const fileName = data.fileName || '';
        
        return docId.includes(rawCleanId) || 
               rawCleanId.includes(docId) || 
               fileName === rawCleanId ||
               (rawCleanId.includes('_') && rawCleanId.split('_').slice(2).join('_') === fileName);
      });

      if (targetDoc) {
        targetDocSnap = targetDoc;
        targetDocRef = targetDoc.ref;
      }
    }

    if (targetDocSnap && targetDocRef) {
      const chunksSnap = await getDocs(collection(targetDocRef, 'chunks'));
      if (!chunksSnap.empty) {
        const chunksData = chunksSnap.docs.map(d => d.data() as { chunkIndex: number; data: string });
        chunksData.sort((a, b) => a.chunkIndex - b.chunkIndex);
        const fullDataUrl = chunksData.map(c => c.data).join('');
        const downloadedBlob = dataUrlToBlob(fullDataUrl);

        if (downloadedBlob && downloadedBlob.size > 0) {
          // Save into local IndexedDB for fast subsequent reads under candidate keys
          try {
            const dbInst = await getDB();
            const transaction = dbInst.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            store.put(downloadedBlob, id);
            if (rawCleanId !== id) {
              store.put(downloadedBlob, rawCleanId);
            }
          } catch {}

          return downloadedBlob;
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
