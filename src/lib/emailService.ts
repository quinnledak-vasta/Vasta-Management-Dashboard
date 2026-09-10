import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  updateDoc, 
  doc, 
  deleteDoc 
} from 'firebase/firestore';
import { db, defaultDb, isCustomDatabase, firestoreDatabaseId } from './firebase';

export interface EmailPayload {
  to: string | string[];
  from?: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  category?: 'vacation_request' | 'vacation_decision' | 'restock_request' | 'task_assigned' | 'checkin_due' | 'annual_review' | 'certification' | 'test' | 'invite';
  metadata?: Record<string, any>;
}

export interface MailDeliveryDoc {
  id: string;
  database: 'primary' | 'default';
  to: string | string[];
  from?: string;
  replyTo?: string;
  subject: string;
  htmlPreview?: string;
  category?: string;
  createdAt?: string;
  delivery?: {
    state: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'ERROR';
    error?: string;
    attempts?: number;
    startTime?: any;
    endTime?: any;
    info?: {
      messageId?: string;
      accepted?: string[];
      rejected?: string[];
      response?: string;
    };
  };
}

// Convert HTML to simple readable plaintext for fallback
export function stripHtmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Dispatches an email notification via Firestore Trigger Email extension.
 * Dual-writes to both the primary database and (default) database to ensure
 * extension triggers regardless of whether the extension was provisioned on
 * the named database or (default) database in Firebase Console.
 */
export async function dispatchEmailNotification(payload: EmailPayload): Promise<{
  success: boolean;
  primaryDocId?: string;
  defaultDocId?: string;
  dualWritten: boolean;
  error?: string;
}> {
  const DEFAULT_FROM = 'Vasta Performance Training <noreply@vastasports.com>';
  const DEFAULT_REPLY_TO = 'quinnledak@vastasports.com';

  const cleanText = payload.text || stripHtmlToText(payload.html);
  
  // Standardize mail document data compliant with firestore-send-email extension
  const mailDocData: Record<string, any> = {
    to: payload.to,
    from: payload.from || DEFAULT_FROM,
    replyTo: payload.replyTo || DEFAULT_REPLY_TO,
    message: {
      subject: payload.subject,
      html: payload.html,
      text: cleanText
    },
    createdAt: new Date().toISOString(),
    source: 'vasta-dashboard'
  };

  if (payload.category) {
    mailDocData.category = payload.category;
  }
  if (payload.metadata) {
    mailDocData.metadata = payload.metadata;
  }

  let primaryDocId: string | undefined;
  let defaultDocId: string | undefined;
  let primaryError: string | undefined;

  // 1. Write to primary configured database
  try {
    const primaryRef = await addDoc(collection(db, 'mail'), mailDocData);
    primaryDocId = primaryRef.id;
  } catch (err: any) {
    console.error('Error writing mail document to primary database:', err);
    primaryError = err?.message || 'Primary database mail write failed';
  }

  // 2. Dual-write to default database if using a custom database ID
  let dualWritten = false;
  if (isCustomDatabase) {
    try {
      const defaultRef = await addDoc(collection(defaultDb, 'mail'), mailDocData);
      defaultDocId = defaultRef.id;
      dualWritten = true;
    } catch (defaultErr: any) {
      console.warn('Dual-write to (default) mail collection skipped or failed:', defaultErr);
    }
  }

  const overallSuccess = Boolean(primaryDocId || defaultDocId);

  return {
    success: overallSuccess,
    primaryDocId,
    defaultDocId,
    dualWritten,
    error: overallSuccess ? undefined : primaryError
  };
}

/**
 * Fetches recent mail logs from Firestore to inspect delivery status and SMTP error diagnostics
 */
export async function fetchMailDeliveryLogs(maxRecords = 25): Promise<MailDeliveryDoc[]> {
  const records: MailDeliveryDoc[] = [];

  // Helper to parse snapshot
  const parseDocs = (snap: any, dbType: 'primary' | 'default') => {
    snap.docs.forEach((d: any) => {
      const data = d.data();
      const subject = data.message?.subject || data.subject || '(No subject)';
      const rawHtml = data.message?.html || '';
      records.push({
        id: d.id,
        database: dbType,
        to: data.to,
        from: data.from,
        replyTo: data.replyTo,
        subject,
        htmlPreview: stripHtmlToText(rawHtml).slice(0, 140),
        category: data.category,
        createdAt: data.createdAt || (d.createTime ? d.createTime.toDate().toISOString() : undefined),
        delivery: data.delivery
      });
    });
  };

  try {
    const q1 = query(collection(db, 'mail'), limit(maxRecords));
    const snap1 = await getDocs(q1);
    parseDocs(snap1, 'primary');
  } catch (err) {
    console.warn('Could not read mail from primary database:', err);
  }

  if (isCustomDatabase) {
    try {
      const q2 = query(collection(defaultDb, 'mail'), limit(maxRecords));
      const snap2 = await getDocs(q2);
      parseDocs(snap2, 'default');
    } catch (err) {
      console.warn('Could not read mail from default database:', err);
    }
  }

  // Sort newest first
  return records.sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeB - timeA;
  });
}

/**
 * Re-queues a failed or pending mail document by resetting its delivery state
 */
export async function retryMailDelivery(mailId: string, databaseType: 'primary' | 'default'): Promise<boolean> {
  try {
    const targetDb = databaseType === 'primary' ? db : defaultDb;
    const mailRef = doc(targetDb, 'mail', mailId);
    await updateDoc(mailRef, {
      'delivery.state': 'PENDING',
      'delivery.attempts': 0,
      retriedAt: new Date().toISOString()
    });
    return true;
  } catch (err) {
    console.error('Error retrying mail delivery:', err);
    return false;
  }
}

/**
 * Clears/deletes a test or corrupt mail document
 */
export async function deleteMailDocument(mailId: string, databaseType: 'primary' | 'default'): Promise<boolean> {
  try {
    const targetDb = databaseType === 'primary' ? db : defaultDb;
    await deleteDoc(doc(targetDb, 'mail', mailId));
    return true;
  } catch (err) {
    console.error('Error deleting mail document:', err);
    return false;
  }
}

/**
 * Sends a test email to verify SMTP configuration and Trigger Email extension status
 */
export async function sendTestEmailAlert(toEmail: string): Promise<{
  success: boolean;
  message: string;
  primaryDocId?: string;
  defaultDocId?: string;
}> {
  const cleanEmail = toEmail.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, message: 'Invalid test recipient email.' };
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

  const html = `
    <div style="font-family: Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 25px; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <div style="border-bottom: 2px solid #dc2626; padding-bottom: 14px; margin-bottom: 20px;">
        <span style="font-weight: 800; font-size: 20px; color: #dc2626;">VASTA</span>
        <span style="font-size: 14px; color: #64748b; margin-left: 8px; font-weight: 500;">Performance Training</span>
      </div>
      <h2 style="color: #0f172a; font-size: 18px; margin: 0 0 12px 0;">
        System Test: Email Notification Pipeline
      </h2>
      <p style="font-size: 14px; line-height: 1.5; color: #334155; margin: 0 0 16px 0;">
        This is a diagnostic test email generated from the Vasta Management Dashboard to verify that your Firebase Trigger Email extension and SMTP relay are working properly.
      </p>
      <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px; font-size: 13px; color: #475569;">
        <p style="margin: 0 0 6px 0;"><strong>Recipient:</strong> ${cleanEmail}</p>
        <p style="margin: 0 0 6px 0;"><strong>Timestamp:</strong> ${dateStr} at ${timeStr}</p>
        <p style="margin: 0 0 6px 0;"><strong>Primary DB:</strong> ${firestoreDatabaseId}</p>
        <p style="margin: 0;"><strong>Dual-Write (default):</strong> ${isCustomDatabase ? 'Active' : 'N/A'}</p>
      </div>
      <p style="font-size: 13px; color: #16a34a; font-weight: 600; margin: 0 0 20px 0;">
        If you received this message in your inbox, email delivery is functioning!
      </p>
      <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0 14px 0;" />
      <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
        Automated Diagnostic • Vasta Sports Systems
      </p>
    </div>
  `;

  const result = await dispatchEmailNotification({
    to: cleanEmail,
    subject: `[Vasta Alert] Diagnostic Test Email (${timeStr})`,
    html,
    category: 'test',
    metadata: {
      testTimestamp: now.toISOString(),
      initiatedBy: 'Admin Diagnostics'
    }
  });

  if (!result.success) {
    return {
      success: false,
      message: `Failed to write test email to Firestore: ${result.error || 'Unknown error'}`
    };
  }

  return {
    success: true,
    message: `Test email dispatched to ${cleanEmail}! Tracking doc: ${result.primaryDocId || result.defaultDocId}`,
    primaryDocId: result.primaryDocId,
    defaultDocId: result.defaultDocId
  };
}
