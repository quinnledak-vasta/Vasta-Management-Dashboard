import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import { exec } from "child_process";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import sgMail from "@sendgrid/mail";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";

dotenv.config();

let firestoreDb: any = null;
try {
  const cfgPath = path.resolve(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    const fbApp = initializeApp(cfg);
    firestoreDb = getFirestore(fbApp, cfg.firestoreDatabaseId || "(default)");
  }
} catch (err) {
  console.error("Failed to initialize Firebase in server:", err);
}

interface SendGridKeyResolution {
  key: string;
  source: string;
  masked: string | null;
  detectedKeys: string[];
  quotesStripped: boolean;
  formatValid: boolean;
}

interface GoogleSmtpResolution {
  configured: boolean;
  user: string;
  pass: string;
  source: string;
  masked: string | null;
}

function sanitizeApiKey(raw: string | undefined | null): { key: string; quotesStripped: boolean } {
  if (!raw) return { key: '', quotesStripped: false };
  let val = raw.trim();
  let quotesStripped = false;
  // Strip surrounding quotes ("..." or '...')
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1).trim();
    quotesStripped = true;
  }
  // Strip accidental 'Bearer ' prefix
  if (val.toLowerCase().startsWith('bearer ')) {
    val = val.slice(7).trim();
  }
  return { key: val, quotesStripped };
}

// Helper to resolve Google Workspace / Gmail SMTP credentials
function resolveGoogleSmtpConfig(): GoogleSmtpResolution {
  const user = process.env.SMTP_USER || process.env.GMAIL_USER || process.env.GOOGLE_EMAIL || 'quinnledak@vastasports.com';
  
  const possiblePassVars = [
    'GMAIL_APP_PASSWORD',
    'GOOGLE_APP_PASSWORD',
    'GMAIL_PASSWORD',
    'SMTP_PASS',
    'SMTP_PASSWORD',
    'EMAIL_PASSWORD'
  ];

  for (const varName of possiblePassVars) {
    const raw = process.env[varName];
    if (raw && typeof raw === 'string') {
      const clean = raw.replace(/\s+/g, '').replace(/["']/g, '');
      if (clean.length >= 12) {
        return {
          configured: true,
          user,
          pass: clean,
          source: varName,
          masked: `${clean.slice(0, 3)}...${clean.slice(-3)}`
        };
      }
    }
  }

  return {
    configured: false,
    user,
    pass: '',
    source: 'none',
    masked: null
  };
}

// Helper to resolve SendGrid API key flexibly regardless of casing, quoting, or exact variable naming
function resolveSendGridApiKey(): SendGridKeyResolution {
  const envEntries = Object.entries(process.env);
  const detectedKeys: string[] = [];

  // 1. Identify all potential environment keys
  for (const [k, v] of envEntries) {
    if (typeof v === 'string' && v.trim().length > 0) {
      const lower = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (lower.includes('sendgrid') || lower.includes('sgapi') || lower === 'sgkey') {
        detectedKeys.push(k);
      }
    }
  }

  // 2. Check prioritized common variable names
  const priorityNames = [
    'SENDGRID_API_KEY',
    'SendGrid_API_KEY',
    'sendgrid_api_key',
    'SENDGRID_KEY',
    'SendGrid_KEY',
    'SENDGRID_API_TOKEN',
    'SENDGRID_TOKEN',
    'SENDGRID_SECRET',
    'SENDGRID',
    'SG_API_KEY',
    'SEND_GRID_API_KEY',
    'VITE_SENDGRID_API_KEY'
  ];

  for (const name of priorityNames) {
    const raw = process.env[name];
    const { key, quotesStripped } = sanitizeApiKey(raw);
    if (key && key.length > 10) {
      return {
        key,
        source: name,
        masked: `${key.slice(0, 7)}...${key.slice(-4)}`,
        detectedKeys,
        quotesStripped,
        formatValid: key.startsWith('SG.')
      };
    }
  }

  // 3. Check fuzzy matched keys from detectedKeys
  for (const name of detectedKeys) {
    const raw = process.env[name];
    const { key, quotesStripped } = sanitizeApiKey(raw);
    if (key && key.length > 10) {
      return {
        key,
        source: name,
        masked: `${key.slice(0, 7)}...${key.slice(-4)}`,
        detectedKeys,
        quotesStripped,
        formatValid: key.startsWith('SG.')
      };
    }
  }

  // 4. Scan all env values for canonical SendGrid API key pattern ('SG....' length > 20)
  for (const [k, v] of envEntries) {
    if (typeof v === 'string') {
      const { key, quotesStripped } = sanitizeApiKey(v);
      if (key.startsWith('SG.') && key.length > 20) {
        if (!detectedKeys.includes(k)) detectedKeys.push(k);
        return {
          key,
          source: k,
          masked: `${key.slice(0, 7)}...${key.slice(-4)}`,
          detectedKeys,
          quotesStripped,
          formatValid: true
        };
      }
    }
  }

  return {
    key: '',
    source: 'none',
    masked: null,
    detectedKeys,
    quotesStripped: false,
    formatValid: false
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "100mb" }));

  // Health endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ 
      status: "ok", 
      time: new Date().toISOString()
    });
  });

  // Transcoding status endpoint
  app.get("/api/transcode-status", (_req, res) => {
    exec("ffmpeg -version", (err, stdout) => {
      res.json({
        available: !err,
        version: stdout ? stdout.split("\n")[0] : null,
        timestamp: new Date().toISOString()
      });
    });
  });

  // Video transcoding endpoint: Converts ANY video (HEVC, Apple ProRes, 10-bit HDR, QuickTime, WebM, AVI, etc.)
  // to universal web-compatible H.264 (YUV420P 8-bit) + AAC stereo MP4
  app.post("/api/transcode-video", async (req, res) => {
    const runId = crypto.randomBytes(8).toString("hex");
    const tempDir = os.tmpdir();
    const inputPath = path.join(tempDir, `transcode_in_${runId}.tmp`);
    const outputPath = path.join(tempDir, `transcode_out_${runId}.mp4`);

    const cleanup = () => {
      try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch {}
      try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
    };

    try {
      const contentType = req.headers["content-type"] || "";
      
      // 1. If payload was parsed as JSON (e.g. { dataUrl, url, base64 })
      if (contentType.includes("application/json")) {
        const { dataUrl, base64, url } = req.body || {};
        if (dataUrl && typeof dataUrl === "string") {
          const base64Data = dataUrl.replace(/^data:[^;]+;base64,/, "");
          await fs.promises.writeFile(inputPath, Buffer.from(base64Data, "base64"));
        } else if (base64 && typeof base64 === "string") {
          await fs.promises.writeFile(inputPath, Buffer.from(base64, "base64"));
        } else if (url && typeof url === "string") {
          if (url.startsWith("data:")) {
            const base64Data = url.replace(/^data:[^;]+;base64,/, "");
            await fs.promises.writeFile(inputPath, Buffer.from(base64Data, "base64"));
          } else {
            const fetchRes = await fetch(url);
            if (!fetchRes.ok) throw new Error(`Failed to fetch video source url: ${fetchRes.statusText}`);
            const arrayBuffer = await fetchRes.arrayBuffer();
            await fs.promises.writeFile(inputPath, Buffer.from(arrayBuffer));
          }
        } else {
          return res.status(400).json({ error: "Missing video source (dataUrl, base64, or url)" });
        }
      } else {
        // 2. Stream binary payload directly into inputPath
        const writeStream = fs.createWriteStream(inputPath);
        await new Promise<void>((resolve, reject) => {
          req.pipe(writeStream);
          req.on("error", reject);
          writeStream.on("finish", resolve);
          writeStream.on("error", reject);
        });
      }

      // Verify input file was created and has non-zero size
      const inputStat = await fs.promises.stat(inputPath);
      if (inputStat.size === 0) {
        cleanup();
        return res.status(400).json({ error: "Received empty video file (0 bytes)" });
      }

      // 3. Execute FFmpeg
      const ffmpegCmd = `ffmpeg -y -i "${inputPath}" -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k -ar 44100 "${outputPath}"`;

      await new Promise<void>((resolve, reject) => {
        exec(ffmpegCmd, (err, _stdout, stderr) => {
          if (err) {
            console.error("FFmpeg transcode error:", stderr);
            reject(new Error(`FFmpeg failed: ${stderr || err.message}`));
          } else {
            resolve();
          }
        });
      });

      const outputStat = await fs.promises.stat(outputPath);
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Length", outputStat.size);
      res.setHeader("Content-Disposition", 'inline; filename="video.mp4"');
      res.setHeader("X-Transcoded-Codec", "h264");
      res.setHeader("X-Transcoded-Audio", "aac");
      res.setHeader("X-Transcoded-PixFmt", "yuv420p");

      const readStream = fs.createReadStream(outputPath);
      readStream.pipe(res);

      res.on("finish", cleanup);
      res.on("close", cleanup);
    } catch (err: any) {
      cleanup();
      console.error("Transcode handler failed:", err);
      res.status(500).json({ error: err.message || "Video transcoding failed" });
    }
  });

  // Persistent Media Upload & Serving system for Course Videos, Attachments, and PDFs
  const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
  if (!fs.existsSync(UPLOAD_DIR)) {
    try {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    } catch (e) {
      console.error("Failed to create upload directory:", e);
    }
  }

  // Helper to ensure media file is restored from Firestore cloud storage if not present on disk
  async function ensureMediaFileOnDisk(requestedId: string): Promise<string | null> {
    const cleanId = decodeURIComponent(requestedId)
      .replace(/^(firestorefile_|localfile_)/, "")
      .replace(/^\/?api\/media\//, "")
      .replace(/^\/?api\/media-download\//, "");

    let targetPath = path.join(UPLOAD_DIR, cleanId);
    if (fs.existsSync(targetPath)) return targetPath;

    // Check directory for matching substring
    try {
      const files = await fs.promises.readdir(UPLOAD_DIR);
      const match = files.find(f => !f.endsWith(".meta.json") && (f === cleanId || f.includes(cleanId) || cleanId.includes(f)));
      if (match) return path.join(UPLOAD_DIR, match);
    } catch {}

    // If not on local disk, pull and reassemble from Firestore
    if (!firestoreDb) return null;

    try {
      const candidates = Array.from(new Set([
        cleanId,
        cleanId.startsWith("file_") ? cleanId : `file_${cleanId}`,
        cleanId.replace(/^file_/, ""),
        `firestorefile_${cleanId}`,
        `localfile_${cleanId}`
      ]));

      let targetDocSnap: any = null;
      for (const cand of candidates) {
        const snap = await getDoc(doc(firestoreDb, "lesson_files", cand));
        if (snap.exists()) {
          targetDocSnap = snap;
          break;
        }
      }

      if (!targetDocSnap) {
        // Query all lesson_files collection
        const allFilesSnap = await getDocs(collection(firestoreDb, "lesson_files"));
        const candLower = cleanId.toLowerCase();
        targetDocSnap = allFilesSnap.docs.find(d => {
          const idLower = d.id.toLowerCase();
          const fnLower = (d.data()?.fileName || "").toLowerCase();
          return idLower === candLower || idLower.includes(candLower) || candLower.includes(idLower) || fnLower === candLower || candLower.includes(fnLower);
        }) || null;
      }

      if (!targetDocSnap) return null;

      const docData = targetDocSnap.data();
      const resolvedFileId = targetDocSnap.id;
      const finalPath = path.join(UPLOAD_DIR, resolvedFileId);

      // Fetch chunks from subcollection
      const chunksSnap = await getDocs(collection(targetDocSnap.ref, "chunks"));
      let fullBuffer: Buffer | null = null;

      if (!chunksSnap.empty) {
        const chunkDocs = chunksSnap.docs.map(d => d.data() as { chunkIndex: number; data: string });
        chunkDocs.sort((a, b) => Number(a.chunkIndex) - Number(b.chunkIndex));
        const chunkBuffers = chunkDocs.map(c => {
          const dataStr = c.data || "";
          const cleanB64 = dataStr.replace(/^data:[^;]+;base64,/, "").replace(/[\r\n\s]/g, "");
          return Buffer.from(cleanB64, "base64");
        });
        fullBuffer = Buffer.concat(chunkBuffers);
      } else if (docData.dataUrl) {
        const cleanB64 = docData.dataUrl.replace(/^data:[^;]+;base64,/, "").replace(/[\r\n\s]/g, "");
        fullBuffer = Buffer.from(cleanB64, "base64");
      }

      if (fullBuffer && fullBuffer.length > 0) {
        await fs.promises.writeFile(finalPath, fullBuffer);
        const meta = {
          id: resolvedFileId,
          fileName: docData.fileName || resolvedFileId,
          cleanFileName: docData.cleanFileName || resolvedFileId,
          fileType: docData.fileType || "video/mp4",
          size: fullBuffer.length,
          createdAt: docData.createdAt || new Date().toISOString()
        };
        await fs.promises.writeFile(`${finalPath}.meta.json`, JSON.stringify(meta, null, 2));
        console.log(`Successfully reassembled and restored media ${resolvedFileId} from Firestore (${fullBuffer.length} bytes)`);
        return finalPath;
      }
    } catch (err) {
      console.error(`Error restoring media ${cleanId} from Firestore:`, err);
    }

    return null;
  }

  // Upload Media Endpoint
  app.post("/api/upload-media", async (req, res) => {
    try {
      const contentType = req.headers["content-type"] || "";
      let rawFileName = (req.headers["x-file-name"] as string) || "file";
      let rawFileType = (req.headers["x-file-type"] as string) || "";
      let buffer: Buffer | null = null;

      if (contentType.includes("application/json")) {
        const { fileName, fileType, dataUrl, base64 } = req.body || {};
        if (fileName) rawFileName = fileName;
        if (fileType) rawFileType = fileType;

        if (dataUrl && typeof dataUrl === "string") {
          const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            if (!rawFileType) rawFileType = match[1];
            buffer = Buffer.from(match[2], "base64");
          } else {
            const b64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
            buffer = Buffer.from(b64, "base64");
          }
        } else if (base64 && typeof base64 === "string") {
          buffer = Buffer.from(base64, "base64");
        }
      } else {
        // Binary stream directly piped
        const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          req.on("data", (c) => chunks.push(c));
          req.on("end", resolve);
          req.on("error", reject);
        });
        if (chunks.length > 0) {
          buffer = Buffer.concat(chunks);
        }
      }

      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ error: "No media data provided or file was empty" });
      }

      const cleanFileName = rawFileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const timestamp = Date.now();
      const rand = crypto.randomBytes(4).toString("hex");
      const fileId = `file_${timestamp}_${rand}_${cleanFileName}`;
      const filePath = path.join(UPLOAD_DIR, fileId);

      // Infer MIME type if missing
      const ext = path.extname(cleanFileName).toLowerCase();
      let mimeType = rawFileType;
      if (!mimeType || mimeType === "application/octet-stream") {
        if (ext === ".mp4") mimeType = "video/mp4";
        else if (ext === ".pdf") mimeType = "application/pdf";
        else if (ext === ".png") mimeType = "image/png";
        else if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
        else if (ext === ".mov") mimeType = "video/quicktime";
        else if (ext === ".webm") mimeType = "video/webm";
        else mimeType = "video/mp4";
      }

      await fs.promises.writeFile(filePath, buffer);

      const meta = {
        id: fileId,
        fileName: rawFileName,
        cleanFileName,
        fileType: mimeType,
        size: buffer.length,
        createdAt: new Date().toISOString()
      };

      await fs.promises.writeFile(`${filePath}.meta.json`, JSON.stringify(meta, null, 2));

      // Synchronously sync chunks to Firestore so ALL instances and ALL users have this file
      if (firestoreDb && buffer && buffer.length > 0) {
        try {
          const CHUNK_SIZE = 600 * 1024; // 600 KB
          const chunks: Buffer[] = [];
          for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
            chunks.push(buffer.subarray(i, Math.min(i + CHUNK_SIZE, buffer.length)));
          }

          await setDoc(doc(firestoreDb, "lesson_files", fileId), {
            id: fileId,
            fileName: rawFileName,
            cleanFileName,
            fileType: mimeType,
            size: buffer.length,
            totalChunks: chunks.length,
            createdAt: new Date().toISOString()
          });

          const BATCH_SIZE = 8;
          for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = chunks.slice(i, i + BATCH_SIZE);
            await Promise.all(
              batch.map((chunkBuf, idx) => {
                const chunkIndex = i + idx;
                return setDoc(doc(firestoreDb, "lesson_files", fileId, "chunks", `${chunkIndex}`), {
                  chunkIndex,
                  data: chunkBuf.toString("base64"),
                  size: chunkBuf.length
                });
              })
            );
          }
          console.log(`Synced media ${fileId} to Firestore (${chunks.length} chunks) for universal team access`);
        } catch (fErr) {
          console.error("Failed to sync media to Firestore:", fErr);
        }
      }

      return res.json({
        success: true,
        fileId,
        url: `/api/media/${fileId}`,
        downloadUrl: `/api/media-download/${fileId}`,
        firestoreKey: `firestorefile_${fileId}`,
        fileName: rawFileName,
        fileType: mimeType,
        size: buffer.length
      });
    } catch (err: any) {
      console.error("Upload media failed:", err);
      return res.status(500).json({ error: err.message || "Failed to save media file" });
    }
  });

  // Media Serving Endpoint with full Byte-Range HTTP streaming support
  app.get("/api/media/:fileId", async (req, res) => {
    try {
      const requestedId = req.params.fileId;
      if (!requestedId) return res.status(400).send("Missing file ID");

      const targetPath = await ensureMediaFileOnDisk(requestedId);
      if (!targetPath || !fs.existsSync(targetPath)) {
        return res.status(404).send("Media file not found");
      }

      const stat = await fs.promises.stat(targetPath);
      const ext = path.extname(targetPath).toLowerCase();

      // Read meta if available
      let mimeType = "video/mp4";
      let displayName = path.basename(targetPath);
      const metaPath = `${targetPath}.meta.json`;
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(await fs.promises.readFile(metaPath, "utf8"));
          if (meta.fileType) mimeType = meta.fileType;
          if (meta.fileName) displayName = meta.fileName;
        } catch {}
      } else {
        if (ext === ".pdf") mimeType = "application/pdf";
        else if (ext === ".png") mimeType = "image/png";
        else if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
        else if (ext === ".webm") mimeType = "video/webm";
        else if (ext === ".mov") mimeType = "video/quicktime";
        else if (ext === ".mp4") mimeType = "video/mp4";
      }

      const isDownload = req.query.download === "1" || req.query.download === "true";
      const disposition = isDownload ? "attachment" : "inline";

      // Support HTTP Range requests for video seeking and smooth playback
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

        if (start >= stat.size) {
          res.status(416).setHeader("Content-Range", `bytes */${stat.size}`);
          return res.end();
        }

        const chunksize = end - start + 1;
        const fileStream = fs.createReadStream(targetPath, { start, end });

        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize,
          "Content-Type": mimeType,
          "Content-Disposition": `${disposition}; filename="${encodeURIComponent(displayName)}"`
        });
        fileStream.pipe(res);
      } else {
        res.writeHead(200, {
          "Content-Length": stat.size,
          "Content-Type": mimeType,
          "Accept-Ranges": "bytes",
          "Content-Disposition": `${disposition}; filename="${encodeURIComponent(displayName)}"`
        });
        fs.createReadStream(targetPath).pipe(res);
      }
    } catch (err: any) {
      console.error("Error serving media:", err);
      res.status(500).send("Error reading media file");
    }
  });

  // Dedicated media download endpoint that forces attachment download
  app.get("/api/media-download/:fileId", async (req, res) => {
    try {
      const requestedId = req.params.fileId;
      if (!requestedId) return res.status(400).send("Missing file ID");

      const targetPath = await ensureMediaFileOnDisk(requestedId);
      if (!targetPath || !fs.existsSync(targetPath)) {
        return res.status(404).send("Media file not found");
      }

      const stat = await fs.promises.stat(targetPath);
      let displayName = path.basename(targetPath);
      let mimeType = "application/octet-stream";
      const metaPath = `${targetPath}.meta.json`;
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(await fs.promises.readFile(metaPath, "utf8"));
          if (meta.fileName) displayName = meta.fileName;
          if (meta.fileType) mimeType = meta.fileType;
        } catch {}
      }

      res.writeHead(200, {
        "Content-Length": stat.size,
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(displayName)}"`
      });
      fs.createReadStream(targetPath).pipe(res);
    } catch (err: any) {
      console.error("Error downloading media:", err);
      res.status(500).send("Error downloading media file");
    }
  });

  // Media listing endpoint
  app.get("/api/media-list", async (_req, res) => {
    try {
      const files = await fs.promises.readdir(UPLOAD_DIR);
      const mediaFiles = files.filter(f => !f.endsWith(".meta.json"));
      const result = await Promise.all(
        mediaFiles.map(async (fileId) => {
          const filePath = path.join(UPLOAD_DIR, fileId);
          const stat = await fs.promises.stat(filePath);
          let meta: any = {};
          if (fs.existsSync(`${filePath}.meta.json`)) {
            try {
              meta = JSON.parse(await fs.promises.readFile(`${filePath}.meta.json`, "utf8"));
            } catch {}
          }
          return {
            fileId,
            url: `/api/media/${fileId}`,
            fileName: meta.fileName || fileId,
            fileType: meta.fileType || "video/mp4",
            size: stat.size,
            createdAt: meta.createdAt || stat.birthtime.toISOString()
          };
        })
      );
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Email status endpoint - checks if Google Workspace or SendGrid is configured
  app.get("/api/email-config", (_req, res) => {
    const sgResolution = resolveSendGridApiKey();
    const googleResolution = resolveGoogleSmtpConfig();
    const hasSg = Boolean(sgResolution.key && sgResolution.key.length > 10);
    const hasGoogle = googleResolution.configured;
    const defaultFrom = process.env.SENDGRID_FROM_EMAIL || "quinnledak@vastasports.com";

    const activeProvider = hasGoogle ? "google_workspace" : (hasSg ? "sendgrid" : "firestore_extension");

    res.json({
      configured: hasSg || hasGoogle,
      provider: activeProvider,
      hasGoogleWorkspace: hasGoogle,
      hasSendGrid: hasSg,
      googleConfig: {
        configured: hasGoogle,
        user: googleResolution.user,
        masked: googleResolution.masked,
        source: googleResolution.source
      },
      defaultFrom,
      maskedKey: hasGoogle ? googleResolution.masked : sgResolution.masked,
      source: hasGoogle ? googleResolution.source : sgResolution.source,
      detectedKeys: sgResolution.detectedKeys,
      formatValid: hasGoogle ? true : sgResolution.formatValid,
      quotesStripped: sgResolution.quotesStripped,
      env: process.env.NODE_ENV || 'development',
      serverTime: new Date().toISOString()
    });
  });

  // Send email directly through Google Workspace SMTP or SendGrid
  app.post("/api/send-email", async (req, res) => {
    const sgResolution = resolveSendGridApiKey();
    const googleResolution = resolveGoogleSmtpConfig();

    if (!googleResolution.configured && !sgResolution.key) {
      return res.status(503).json({
        success: false,
        error: "Direct backend mail transport not configured in server environment. Queuing in Firestore for Google Workspace / Firebase Extension processing.",
        provider: 'firestore_extension',
        detectedKeys: sgResolution.detectedKeys
      });
    }

    const { to, from, subject, html, text, replyTo } = req.body;

    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: to, subject, and at least one of html or text."
      });
    }

    // 1. Google Workspace SMTP (via Nodemailer)
    if (googleResolution.configured) {
      try {
        const transporter = nodemailer.createTransport({
          host: "smtp.gmail.com",
          port: 465,
          secure: true,
          auth: {
            user: googleResolution.user,
            pass: googleResolution.pass
          }
        });

        const defaultFrom = `Vasta Performance Training <${googleResolution.user}>`;
        const effectiveFrom = from || defaultFrom;

        const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
        if (recipients.length === 0) {
          return res.status(400).json({ success: false, error: "No valid recipient email provided." });
        }

        const info = await transporter.sendMail({
          from: effectiveFrom,
          to: recipients.length === 1 ? recipients[0] : recipients,
          replyTo: replyTo || googleResolution.user,
          subject,
          text: text || (html ? html.replace(/<[^>]*>?/gm, '') : ''),
          html: html || `<p>${text}</p>`
        });

        return res.json({
          success: true,
          provider: 'google_workspace',
          messageId: info.messageId,
          timestamp: new Date().toISOString()
        });
      } catch (gmailErr: any) {
        console.error("Google Workspace SMTP Error:", gmailErr);
        // If SendGrid is also available as fallback, proceed to SendGrid; otherwise fail
        if (!sgResolution.key) {
          return res.status(502).json({
            success: false,
            provider: 'google_workspace',
            error: gmailErr?.message || "Google Workspace SMTP rejected delivery"
          });
        }
      }
    }

    // 2. SendGrid Fallback
    try {
      sgMail.setApiKey(sgResolution.key);

      // Parse sender into clean { email, name } object accepted by SendGrid
      const defaultFrom = process.env.SENDGRID_FROM_EMAIL || "quinnledak@vastasports.com";
      const rawFrom = from || defaultFrom;
      let senderObj: { email: string; name?: string } = { email: defaultFrom, name: "Vasta Performance Training" };

      const match = rawFrom.match(/^(.*?)\s*<(.+?)>$/);
      if (match) {
        senderObj = {
          name: match[1].trim() || "Vasta Performance Training",
          email: match[2].trim()
        };
      } else if (rawFrom.includes("@")) {
        senderObj = {
          email: rawFrom.trim(),
          name: "Vasta Performance Training"
        };
      }

      // If 'to' is an array with empty entries, sanitize
      const recipients = Array.isArray(to) 
        ? to.filter(Boolean) 
        : [to].filter(Boolean);

      if (recipients.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No valid recipient email address provided."
        });
      }

      const msg: any = {
        to: recipients.length === 1 ? recipients[0] : recipients,
        from: senderObj,
        subject: subject,
        html: html || `<p>${text}</p>`,
        text: text || (html ? html.replace(/<[^>]*>?/gm, '') : ''),
        ...(replyTo ? { replyTo } : {})
      };

      let sendgridResponse: any;
      try {
        const [res] = await sgMail.send(msg);
        sendgridResponse = res;
      } catch (sendErr: any) {
        // If SendGrid rejects due to an unverified sender address, fallback to verified defaultFrom
        const errBody = sendErr?.response?.body;
        const errList = errBody?.errors?.map((e: any) => e.message).join(' ') || sendErr?.message || '';
        const isSenderAuthError = /sender identity|verified|from address/i.test(errList);

        if (isSenderAuthError && senderObj.email !== defaultFrom) {
          console.warn(`Sender '${senderObj.email}' not verified on SendGrid. Retrying with verified default sender '${defaultFrom}'...`);
          msg.from = {
            name: senderObj.name || "Vasta Performance Training",
            email: defaultFrom
          };
          if (!msg.replyTo) {
            msg.replyTo = senderObj.email;
          }
          const [retryRes] = await sgMail.send(msg);
          sendgridResponse = retryRes;
        } else {
          throw sendErr;
        }
      }

      return res.json({
        success: true,
        provider: 'sendgrid',
        statusCode: sendgridResponse?.statusCode || 202,
        messageId: sendgridResponse?.headers?.['x-message-id'] || `sg-${Date.now()}`
      });
    } catch (error: any) {
      console.error("SendGrid API Error:", error);

      let detailedError = error.message || "Failed to dispatch email via SendGrid";
      if (error.response && error.response.body && error.response.body.errors) {
        const errorList = error.response.body.errors.map((e: any) => e.message).join("; ");
        detailedError = `SendGrid API rejection: ${errorList}`;
      }

      return res.status(500).json({
        success: false,
        error: detailedError,
        details: error.response?.body || null
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
