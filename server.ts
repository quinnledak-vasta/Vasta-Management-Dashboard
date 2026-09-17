import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import sgMail from "@sendgrid/mail";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

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

  app.use(express.json({ limit: "10mb" }));

  // Health endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ 
      status: "ok", 
      time: new Date().toISOString()
    });
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
