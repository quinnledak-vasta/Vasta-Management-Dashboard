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

// Helper to safely convert base64 chunk to Uint8Array without stack overflow
export function safeBase64ToUint8Array(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, '').replace(/[\r\n\s]/g, '');
  if (!clean) return new Uint8Array(0);
  const binStr = atob(clean);
  const len = binStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes;
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
    const bytes = safeBase64ToUint8Array(base64Data);
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

  // Auto-transcode iPhone .mov / QuickTime / HEVC videos on upload to universal H.264 MP4
  const isMovOrQuickTime = file.type === 'video/quicktime' || /\.mov$/i.test(file.name);
  if (isMovOrQuickTime) {
    try {
      const transcodeRes = await fetch('/api/transcode-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Original-Name': encodeURIComponent(cleanName)
        },
        body: blob
      });
      if (transcodeRes.ok) {
        const transcodedBlob = await transcodeRes.blob();
        if (transcodedBlob.size > 0) {
          blob = new Blob([transcodedBlob], { type: 'video/mp4' });
          console.log(`Auto-transcoded video upload ${file.name} to universal H.264 MP4 (${blob.size} bytes)`);
        }
      }
    } catch (err) {
      console.warn('Auto-transcode skipped on upload:', err);
    }
  }

  // 1. Upload to persistent server disk storage (/api/upload-media)
  let serverMediaUrl = '';
  try {
    const uploadRes = await fetch('/api/upload-media', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
        'X-File-Type': blob.type || normalizedMime
      },
      body: blob
    });
    if (uploadRes.ok) {
      const data = await uploadRes.json();
      if (data.url) {
        serverMediaUrl = data.url;
      }
    }
  } catch (err) {
    console.warn('Server disk media upload skipped/failed:', err);
  }

  // 2. Save to IndexedDB locally for instant availability under multiple keys
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = dbInst.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put(blob, key);
      store.put(blob, fileId);
      store.put(blob, cleanName);
      store.put(blob, file.name);
      if (serverMediaUrl) {
        store.put(blob, serverMediaUrl);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (idbErr) {
    console.warn('IndexedDB write error:', idbErr);
  }

  // 3. Sync to Firestore cloud storage so all team members can access it
  try {
    await syncLocalBlobToFirestore(fileId, blob, file.name);
  } catch (err) {
    console.warn('Firestore cloud sync warning:', err);
  }

  return serverMediaUrl || key;
}

const syncedKeys = new Set<string>();

export async function syncLocalBlobToFirestore(id: string, blob: Blob | File, originalName?: string): Promise<void> {
  if (!id) return;

  try {
    const rawCleanId = id.replace(/^(firestorefile_|localfile_)/, '');
    const fileId = rawCleanId.startsWith('file_') ? rawCleanId : `file_${rawCleanId}`;
    const metaRef = doc(db, 'lesson_files', fileId);
    const metaSnap = await getDoc(metaRef);

    const isCorruptOrEmpty = !metaSnap.exists() || 
      (metaSnap.data()?.size && metaSnap.data()?.size <= 500) || 
      (metaSnap.data()?.totalChunks === 0);

    if (isCorruptOrEmpty && blob && blob.size > 500) {
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
      syncedKeys.add(id);
      syncedKeys.add(fileId);
      console.log(`Synced local blob ${id} to Firestore as ${fileId} (${chunks.length} chunks, ${blob.size} bytes)`);
    } else {
      syncedKeys.add(id);
    }
  } catch (err) {
    syncedKeys.delete(id);
    console.warn(`Cloud sync failed for ${id}:`, err);
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

  // 3. Direct HTTP / HTTPS / API URL
  if (id.startsWith('http://') || id.startsWith('https://') || id.startsWith('/api/')) {
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

  // 3.5 Check persistent server-side media storage
  const serverEndpointsToCheck = [
    `/api/media/${encodeURIComponent(rawCleanId)}`,
    `/api/media/${encodeURIComponent(id)}`,
    ...(cleanFallbackName ? [`/api/media/${encodeURIComponent(cleanFallbackName)}`] : [])
  ];

  for (const endpoint of serverEndpointsToCheck) {
    try {
      const serverRes = await fetch(endpoint);
      if (serverRes.ok) {
        const serverBlob = await serverRes.blob();
        if (serverBlob.size > 0) {
          // Cache into IndexedDB for fast subsequent local reads
          try {
            const dbInst = await getDB();
            const tx = dbInst.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(serverBlob, id);
            tx.objectStore(STORE_NAME).put(serverBlob, rawCleanId);
          } catch {}
          return ensurePlayableBlob(serverBlob, fallbackName);
        }
      }
    } catch {
      // Server check failed or not found, proceed
    }
  }

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

        const uint8Chunks: Uint8Array[] = [];
        for (const chunkDoc of chunksData) {
          const dataStr = chunkDoc.data || '';
          const bytes = safeBase64ToUint8Array(dataStr);
          if (bytes.length > 0) {
            uint8Chunks.push(bytes);
          }
        }

        if (uint8Chunks.length > 0) {
          const targetMime = normalizeVideoMimeType(docData.fileType, docData.fileName || fallbackName);
          const downloadedBlob = new Blob(uint8Chunks, { type: targetMime });

          if (downloadedBlob.size > 0) {
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

export async function replaceStoredVideo(id: string, newBlob: Blob, originalName?: string): Promise<void> {
  if (!id || !newBlob || newBlob.size === 0) return;

  const rawCleanId = id.replace(/^(firestorefile_|localfile_)/, '');
  const fileId = rawCleanId.startsWith('file_') ? rawCleanId : `file_${rawCleanId}`;
  const cleanName = originalName ? originalName.replace(/[^a-zA-Z0-9._-]/g, '_') : '';

  try {
    const dbInst = await getDB();
    const writeTx = dbInst.transaction(STORE_NAME, 'readwrite');
    const store = writeTx.objectStore(STORE_NAME);
    store.put(newBlob, id);
    store.put(newBlob, rawCleanId);
    store.put(newBlob, fileId);
    store.put(newBlob, `firestorefile_${fileId}`);
    if (cleanName) store.put(newBlob, cleanName);
    if (originalName) store.put(newBlob, originalName);
    await new Promise<void>((resolve, reject) => {
      writeTx.oncomplete = () => resolve();
      writeTx.onerror = () => reject(writeTx.error);
    });

    // Reset sync key tracking so the new transcoded version uploads to Firestore
    syncedKeys.delete(fileId);
    syncedKeys.delete(rawCleanId);
    syncedKeys.delete(id);

    const fileName = originalName || id;
    const dataUrl = await fileToDataUrl(newBlob);
    const chunks = chunkString(dataUrl, 350000);

    const metaRef = doc(db, 'lesson_files', fileId);
    await setDoc(metaRef, {
      id: fileId,
      fileName,
      fileType: 'video/mp4',
      size: newBlob.size,
      totalChunks: chunks.length,
      createdAt: new Date().toISOString(),
      transcoded: true
    });

    await uploadChunksToFirestore(fileId, chunks);
    console.log(`Updated stored video ${fileId} with transcoded universal MP4 (${chunks.length} chunks)`);
  } catch (err) {
    console.warn(`Failed to replace stored video ${id}:`, err);
  }
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
