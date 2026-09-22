import { replaceStoredVideo } from './videoCache';

export interface TranscodeResult {
  blob: Blob;
  url: string;
  durationMs?: number;
}

/**
 * Checks if the backend FFmpeg transcoding service is alive and ready
 */
export async function isTranscodeServerAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/api/transcode-status');
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.available);
  } catch {
    return false;
  }
}

/**
 * Sends any video Blob or URL to the server's FFmpeg pipeline to transcode into
 * universal H.264 (8-bit YUV420P) + AAC stereo MP4 with faststart.
 */
export async function transcodeVideo(
  source: Blob | string,
  fileName?: string
): Promise<Blob> {
  let blobToSend: Blob;

  if (typeof source === 'string') {
    if (source.startsWith('blob:') || source.startsWith('data:') || source.startsWith('http')) {
      try {
        const res = await fetch(source);
        if (!res.ok) throw new Error(`Could not fetch video source: ${res.statusText}`);
        blobToSend = await res.blob();
      } catch (e: any) {
        // Fallback: send JSON with url/dataUrl if direct fetch fails (e.g. CORS)
        const jsonRes = await fetch('/api/transcode-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: source })
        });
        if (!jsonRes.ok) {
          const errData = await jsonRes.json().catch(() => ({}));
          throw new Error(errData.error || `Server transcode failed with status ${jsonRes.status}`);
        }
        return await jsonRes.blob();
      }
    } else {
      throw new Error(`Invalid video source format: ${source.substring(0, 30)}`);
    }
  } else {
    blobToSend = source;
  }

  const res = await fetch('/api/transcode-video', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Original-Name': encodeURIComponent(fileName || 'video.mp4')
    },
    body: blobToSend
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Transcoding failed with status ${res.status}`);
  }

  const transcodedBlob = await res.blob();
  if (transcodedBlob.size === 0) {
    throw new Error('Transcoded output is empty (0 bytes).');
  }

  return new Blob([transcodedBlob], { type: 'video/mp4' });
}

/**
 * Transcodes video to universal MP4 AND persists it into local IndexedDB and
 * Firestore cloud storage so neither the current user nor any team members
 * will ever encounter a black screen on this lesson again.
 */
export async function repairAndPersistVideo(
  source: Blob | string,
  storageKey?: string,
  title?: string
): Promise<TranscodeResult> {
  const cleanTitle = (title || 'lesson_video').replace(/[^a-zA-Z0-9._-]/g, '_');
  const targetFileName = cleanTitle.endsWith('.mp4') ? cleanTitle : `${cleanTitle}.mp4`;

  const transcodedBlob = await transcodeVideo(source, targetFileName);

  if (storageKey) {
    try {
      await replaceStoredVideo(storageKey, transcodedBlob, targetFileName);
    } catch (err) {
      console.warn('Could not update stored key in database, video is still playable in-memory:', err);
    }
  }

  const objectUrl = URL.createObjectURL(transcodedBlob);
  return {
    blob: transcodedBlob,
    url: objectUrl
  };
}
