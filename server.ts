import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import sgMail from "@sendgrid/mail";
import dotenv from "dotenv";

dotenv.config();

// Helper to resolve SendGrid API key flexibly regardless of casing
function getSendGridApiKey(): string {
  const found = Object.entries(process.env).find(([k]) => {
    const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    return norm === 'sendgridapikey' || norm === 'sendgridkey';
  });
  return (found ? found[1] : process.env.SENDGRID_API_KEY || '')?.trim() || '';
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

  // Email status endpoint - checks if SendGrid is configured
  app.get("/api/email-config", (_req, res) => {
    const apiKey = getSendGridApiKey();
    const hasApiKey = Boolean(apiKey && apiKey.length > 10);
    const defaultFrom = process.env.SENDGRID_FROM_EMAIL || "quinnledak@vastasports.com";

    res.json({
      configured: hasApiKey,
      provider: "sendgrid",
      defaultFrom,
      maskedKey: hasApiKey ? `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}` : null
    });
  });

  // Send email directly through SendGrid
  app.post("/api/send-email", async (req, res) => {
    const apiKey = getSendGridApiKey();

    if (!apiKey || !apiKey.trim()) {
      return res.status(503).json({
        success: false,
        error: "SENDGRID_API_KEY environment variable is not configured. Please add SENDGRID_API_KEY to your project Settings > Secrets."
      });
    }

    const { to, from, subject, html, text, replyTo } = req.body;

    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: to, subject, and at least one of html or text."
      });
    }

    try {
      sgMail.setApiKey(apiKey.trim());

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
