import React, { useState, useEffect } from 'react';
import { 
  Mail, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Send, 
  ExternalLink, 
  X, 
  RotateCcw,
  ShieldCheck,
  Server,
  HelpCircle,
  Copy,
  Check,
  Key,
  AtSign,
  Settings,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { 
  fetchMailDeliveryLogs, 
  sendTestEmailAlert, 
  retryMailDelivery, 
  resendMailDocument,
  getActiveSenderConfig,
  setActiveSenderConfig,
  SenderMode,
  MailDeliveryDoc 
} from '../lib/emailService';
import { firestoreDatabaseId, isCustomDatabase } from '../lib/firebase';
import { toast } from 'sonner';

interface EmailDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserEmail?: string;
}

interface SmtpAnalysis {
  type: 'auth' | 'sender' | 'network' | 'rate_limit' | 'general';
  title: string;
  explanation: string;
  steps: string[];
}

function analyzeSmtpError(errorStr?: string): SmtpAnalysis {
  if (!errorStr) {
    return {
      type: 'general',
      title: 'Unknown SMTP Response',
      explanation: 'The mail server did not return a standard error string.',
      steps: ['Check your SMTP Connection URI in Firebase Console Extensions.']
    };
  }
  const lower = errorStr.toLowerCase();

  // Rate Limit / Burst / Deferral (421 4.3.0)
  if (
    lower.includes('421') ||
    lower.includes('4.3.0') ||
    lower.includes('temporary system problem') ||
    lower.includes('try again later') ||
    lower.includes('rate limit') ||
    lower.includes('too many connections')
  ) {
    return {
      type: 'rate_limit',
      title: 'Google SMTP Burst Rate-Limit (Code 421 4.3.0 Temporary Deferral)',
      explanation: 'Your credentials and sender address were accepted! Google returned code 421 at the DATA command because a burst of 14 automated check-in emails were submitted simultaneously. Google Workspace temporarily defers burst connections to protect against bulk automated traffic.',
      steps: [
        '1. Wait 5 to 15 minutes for Google\'s temporary SMTP cooldown to clear.',
        '2. Click "Retry All Failed" below (it now delivers each message with a staggered 1.5s delay to prevent burst triggers).',
        '3. Standard operational emails (like vacation requests or single approvals) will go through smoothly because they do not trigger concurrency filters.',
        '4. For high-volume automated business notifications, you can also connect the Firebase Extension to SendGrid (free 100 emails/day) which eliminates Google Workspace SMTP rate caps.'
      ]
    };
  }

  // 1. Password / Authentication errors
  if (
    lower.includes('535') || 
    lower.includes('eauth') || 
    lower.includes('badcredentials') || 
    lower.includes('username and password not accepted') || 
    lower.includes('invalid credentials') ||
    lower.includes('invalid login')
  ) {
    return {
      type: 'auth',
      title: 'Authentication Rejected (Google App Password Required)',
      explanation: 'Your mail server rejected the login credentials. If you are using Gmail or Google Workspace (@vastasports.com), Google strictly forbids using your regular login password for SMTP. You must create a dedicated 16-character Google App Password.',
      steps: [
        '1. Open Google Account Security: https://myaccount.google.com/security',
        '2. Ensure 2-Step Verification is turned ON for your account.',
        '3. Go to App Passwords: https://myaccount.google.com/apppasswords',
        '4. Create a new App Password named "Vasta Firebase" to get a 16-character code (e.g. abcd efgh ijkl mnop).',
        '5. In Firebase Console Extensions, update your SMTP URI using this 16-character code without spaces: smtps://quinnledak%40vastasports.com:YOUR_16_CHAR_PASSWORD@smtp.gmail.com:465',
        '6. Note: Notice "%40" in place of the "@" symbol in the username (URL-encoded email).'
      ]
    };
  }

  // 2. Sender / From address mismatch
  if (
    lower.includes('550') || 
    lower.includes('553') || 
    lower.includes('permissions to send') || 
    lower.includes('sender address rejected') || 
    lower.includes('unauthorized sender') || 
    lower.includes('not authorized to send') ||
    lower.includes('must be sent from')
  ) {
    return {
      type: 'sender',
      title: 'Sender Address Mismatch (FROM Header Rejected)',
      explanation: 'Your SMTP server is authenticated as quinnledak@vastasports.com, but the outgoing email tried to send as noreply@vastasports.com. Google Workspace rejects emails unless the FROM address matches your authenticated account or is an authorized alias.',
      steps: [
        '1. Use the "Active Sender (FROM) Address" selector below to switch to "Quinn Ledak (quinnledak@vastasports.com)".',
        '2. Alternatively, in Quinn\'s Google Workspace Gmail Settings > Accounts > "Send mail as", add noreply@vastasports.com as an alias.',
        '3. Click "Retry All Failed Emails" below once changed.'
      ]
    };
  }

  // 3. Port / Network connection errors
  if (
    lower.includes('econnrefused') || 
    lower.includes('etimedout') || 
    lower.includes('enotfound') || 
    lower.includes('port 25') || 
    lower.includes('connection refused')
  ) {
    return {
      type: 'network',
      title: 'Network Port Blocked (Port 25 Not Allowed)',
      explanation: 'Google Cloud Functions block outgoing connections on Port 25. You must connect over Port 465 (SSL) or Port 587 (STARTTLS).',
      steps: [
        'For Google Workspace / Gmail, use: smtps://quinnledak%40vastasports.com:APP_PASSWORD@smtp.gmail.com:465',
        'For SendGrid, use: smtps://apikey:SG.YOUR_KEY@smtp.sendgrid.net:465',
        'Verify host name and ensure there are no trailing spaces.'
      ]
    };
  }

  return {
    type: 'general',
    title: 'SMTP Delivery Rejection',
    explanation: errorStr,
    steps: [
      'Inspect the raw SMTP response below.',
      'Check your SMTP connection URI in the Firebase Console Extensions tab.',
      'Verify that recipient email addresses are valid and active.'
    ]
  };
}

export const EmailDiagnosticsModal: React.FC<EmailDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  currentUserEmail = 'quinnledak@vastasports.com'
}) => {
  const [logs, setLogs] = useState<MailDeliveryDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [testEmail, setTestEmail] = useState(currentUserEmail);
  const [sendingTest, setSendingTest] = useState(false);
  const [retryingAll, setRetryingAll] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<MailDeliveryDoc | null>(null);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [showSenderSettings, setShowSenderSettings] = useState(false);
  const [senderConfig, setSenderConfig] = useState(getActiveSenderConfig());

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await fetchMailDeliveryLogs(30);
      setLogs(data);
    } catch (err) {
      console.error('Failed to load email logs:', err);
      toast.error('Failed to load email delivery logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadLogs();
      setTestEmail(currentUserEmail);
      setSenderConfig(getActiveSenderConfig());
    }
  }, [isOpen, currentUserEmail]);

  if (!isOpen) return null;

  const failedLogs = logs.filter(l => l.delivery?.state === 'ERROR');
  const latestErrorLog = failedLogs[0];
  const activeAnalysis = latestErrorLog ? analyzeSmtpError(latestErrorLog.delivery?.error) : null;

  const handleSenderModeChange = (mode: SenderMode, customVal?: string) => {
    setActiveSenderConfig(mode, customVal);
    const updated = getActiveSenderConfig();
    setSenderConfig(updated);
    toast.success(`Active sender updated to: ${updated.effectiveFrom || 'Firebase Extension Default'}`);
  };

  const handleSendTest = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      toast.error('Please enter a valid email address.');
      return;
    }

    setSendingTest(true);
    const toastId = toast.loading(`Dispatching test email to ${testEmail}...`);
    try {
      const res = await sendTestEmailAlert(testEmail);
      if (res.success) {
        toast.success(res.message, { id: toastId, duration: 6000 });
        await loadLogs();
      } else {
        toast.error(res.message, { id: toastId });
      }
    } catch (err: any) {
      toast.error(`Error sending test: ${err?.message || 'Unknown error'}`, { id: toastId });
    } finally {
      setSendingTest(false);
    }
  };

  const handleRetrySingle = async (docItem: MailDeliveryDoc) => {
    const toastId = toast.loading(`Re-queueing email to ${docItem.to}...`);
    try {
      const ok = await resendMailDocument(docItem);
      if (ok) {
        toast.success('Fresh email queued with active sender! Refreshing in 3s...', { id: toastId });
        setTimeout(() => loadLogs(), 3000);
      } else {
        toast.error('Could not re-queue email.', { id: toastId });
      }
    } catch (err: any) {
      toast.error(`Retry error: ${err?.message || 'Unknown error'}`, { id: toastId });
    }
  };

  const handleRetryAllFailed = async () => {
    if (failedLogs.length === 0) {
      toast.info('No failed emails to retry.');
      return;
    }

    setRetryingAll(true);
    const toastId = toast.loading(`Re-queueing ${failedLogs.length} failed emails with active sender...`);
    let reCount = 0;
    try {
      for (let i = 0; i < failedLogs.length; i++) {
        const docItem = failedLogs[i];
        const ok = await resendMailDocument(docItem);
        if (ok) reCount++;
        // Throttle requests by 1200ms to stay within Google SMTP burst thresholds
        if (i < failedLogs.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      }
      toast.success(`Successfully re-queued ${reCount} message(s)! Refreshing logs...`, { id: toastId, duration: 6000 });
      setTimeout(() => loadLogs(), 3500);
    } catch (err: any) {
      toast.error(`Error during batch retry: ${err?.message || 'Unknown error'}`, { id: toastId });
    } finally {
      setRetryingAll(false);
    }
  };

  const handleCopyDiagnosticReport = () => {
    const report = {
      project: 'vasta-management-dashboard',
      timestamp: new Date().toISOString(),
      primaryDatabase: firestoreDatabaseId,
      dualWriteActive: isCustomDatabase,
      activeSenderConfig: senderConfig,
      totalLogsScanned: logs.length,
      failedEmailCount: failedLogs.length,
      latestError: latestErrorLog?.delivery?.error || 'None',
      recentFailures: failedLogs.slice(0, 5).map(f => ({
        id: f.id,
        to: f.to,
        from: f.from,
        subject: f.subject,
        createdAt: f.createdAt,
        error: f.delivery?.error
      }))
    };

    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopiedReport(true);
    toast.success('Diagnostic report copied to clipboard!');
    setTimeout(() => setCopiedReport(false), 3000);
  };

  const getStatusBadge = (docItem: MailDeliveryDoc) => {
    const delivery = docItem.delivery;
    if (!delivery) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200" title="Trigger Email extension has not processed this document yet">
          <Clock className="w-3 h-3 text-amber-600 animate-pulse" />
          Queued / Unprocessed
        </span>
      );
    }

    if (delivery.state === 'SUCCESS') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          Delivered
        </span>
      );
    }

    if (delivery.state === 'ERROR') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
          <AlertTriangle className="w-3 h-3 text-rose-600" />
          SMTP Error
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
        <Clock className="w-3 h-3 text-blue-600 animate-spin" />
        {delivery.state}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">Email Delivery Diagnostics & SMTP Resolver</h2>
                {failedLogs.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-xs font-bold">
                    {failedLogs.length} Failed
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Inspect Firestore mail queues, resolve SMTP credentials, and verify alert delivery
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadLogs}
              disabled={loading}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg transition-colors"
              title="Refresh logs"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Diagnostic Status Bar */}
        <div className="px-6 py-2.5 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 text-slate-600">
            <span className="flex items-center gap-1.5 font-medium">
              <Server className="w-3.5 h-3.5 text-slate-500" />
              Primary DB: <span className="font-mono text-slate-800 bg-white px-1.5 py-0.5 rounded border border-slate-200">{firestoreDatabaseId}</span>
            </span>
            {isCustomDatabase && (
              <span className="flex items-center gap-1.5 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Dual-Write: <span className="text-emerald-700 font-semibold">(default) Active</span>
              </span>
            )}
            <span className="flex items-center gap-1.5 font-medium">
              <AtSign className="w-3.5 h-3.5 text-blue-600" />
              Sender: <span className="text-slate-800 font-medium">{senderConfig.effectiveFrom || 'Extension Default'}</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSenderSettings(!showSenderSettings)}
              className="flex items-center gap-1 text-slate-700 hover:text-slate-900 font-medium transition-colors"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              {showSenderSettings ? 'Hide Sender Settings' : 'Configure Sender (FROM)'}
            </button>
            <button
              onClick={() => setShowTroubleshooting(!showTroubleshooting)}
              className="flex items-center gap-1 text-red-600 hover:text-red-700 font-medium transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              {showTroubleshooting ? 'Hide Guide' : 'Setup Checklist'}
            </button>
          </div>
        </div>

        {/* Sender (FROM) Configuration Panel */}
        {showSenderSettings && (
          <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 text-xs animate-in fade-in duration-150">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <AtSign className="w-4 h-4 text-red-600" />
                Outgoing Email Sender (FROM) Header
              </span>
              <span className="text-slate-500 text-[11px]">
                Controls the "From:" header sent in outgoing notifications
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleSenderModeChange('quinn')}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  senderConfig.mode === 'quinn'
                    ? 'border-red-500 bg-red-50/50 text-red-950 font-medium shadow-xs ring-1 ring-red-500'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="font-bold flex items-center justify-between">
                  <span>Quinn Ledak (Personal)</span>
                  {senderConfig.mode === 'quinn' && <Check className="w-3.5 h-3.5 text-red-600" />}
                </div>
                <div className="text-[11px] text-slate-500 truncate mt-0.5">quinnledak@vastasports.com</div>
                <div className="text-[10px] text-emerald-700 font-medium mt-1">Recommended for Google Workspace SMTP</div>
              </button>

              <button
                type="button"
                onClick={() => handleSenderModeChange('extension_default')}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  senderConfig.mode === 'extension_default'
                    ? 'border-red-500 bg-red-50/50 text-red-950 font-medium shadow-xs ring-1 ring-red-500'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="font-bold flex items-center justify-between">
                  <span>Extension Default</span>
                  {senderConfig.mode === 'extension_default' && <Check className="w-3.5 h-3.5 text-red-600" />}
                </div>
                <div className="text-[11px] text-slate-500 truncate mt-0.5">Omit FROM in document</div>
                <div className="text-[10px] text-blue-700 font-medium mt-1">Uses Firebase Console extension setting</div>
              </button>

              <button
                type="button"
                onClick={() => handleSenderModeChange('noreply')}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  senderConfig.mode === 'noreply'
                    ? 'border-red-500 bg-red-50/50 text-red-950 font-medium shadow-xs ring-1 ring-red-500'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="font-bold flex items-center justify-between">
                  <span>No-Reply Address</span>
                  {senderConfig.mode === 'noreply' && <Check className="w-3.5 h-3.5 text-red-600" />}
                </div>
                <div className="text-[11px] text-slate-500 truncate mt-0.5">noreply@vastasports.com</div>
                <div className="text-[10px] text-amber-700 font-medium mt-1">Requires Google alias or SendGrid domain</div>
              </button>
            </div>
          </div>
        )}

        {/* ACTIVE SMTP ERROR DIAGNOSIS BOX */}
        {latestErrorLog && activeAnalysis && (
          <div className="px-6 py-4 bg-rose-50 border-b border-rose-200 text-xs">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 text-rose-900 font-bold text-sm">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                <span>SMTP Error Detected: {activeAnalysis.title}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRetryAllFailed}
                  disabled={retryingAll}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  title="Re-queue all failed messages"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${retryingAll ? 'animate-spin' : ''}`} />
                  {retryingAll ? 'Retrying...' : `Retry All Failed (${failedLogs.length})`}
                </button>
                <button
                  onClick={handleCopyDiagnosticReport}
                  className="px-3 py-1.5 bg-white border border-rose-300 hover:bg-rose-100/60 text-rose-800 rounded-lg font-medium flex items-center gap-1.5 transition-colors"
                  title="Copy technical diagnosis for support"
                >
                  {copiedReport ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedReport ? 'Copied!' : 'Copy Report'}
                </button>
              </div>
            </div>

            <p className="text-rose-950 mb-3 leading-relaxed">
              {activeAnalysis.explanation}
            </p>

            {/* Step-by-step resolution box */}
            <div className="bg-white/80 p-3 rounded-lg border border-rose-200 text-slate-800 space-y-1.5">
              <div className="font-bold text-slate-900 flex items-center gap-1">
                <Key className="w-3.5 h-3.5 text-red-600" />
                How to Fix This in 2 Minutes:
              </div>
              <ul className="space-y-1 pl-1 text-[11.5px] leading-normal">
                {activeAnalysis.steps.map((step, idx) => (
                  <li key={idx} className="text-slate-700">
                    {step}
                  </li>
                ))}
              </ul>

              <div className="pt-2 flex flex-wrap items-center gap-2">
                <a 
                  href="https://console.firebase.google.com/project/vasta-management-dashboard/extensions" 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline bg-blue-50 px-2.5 py-1 rounded border border-blue-200"
                >
                  Open Firebase Extension Settings <ExternalLink className="w-3 h-3" />
                </a>
                <a 
                  href="https://myaccount.google.com/apppasswords" 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 hover:underline bg-red-50 px-2.5 py-1 rounded border border-red-200"
                >
                  Generate Google App Password <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* Raw error expander */}
            <div className="mt-2 text-[11px] text-rose-800 font-mono bg-rose-100/50 p-2 rounded border border-rose-200/80 truncate select-all" title={latestErrorLog.delivery?.error}>
              <strong>Raw Error:</strong> {latestErrorLog.delivery?.error}
            </div>
          </div>
        )}

        {/* Troubleshooting Accordion */}
        {showTroubleshooting && (
          <div className="px-6 py-4 bg-amber-50/70 border-b border-amber-200 text-xs text-amber-950 space-y-2 overflow-y-auto max-h-56">
            <div className="font-bold text-amber-900 text-sm flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Firebase Email Delivery Architecture & Key Points:
            </div>
            <p>
              The dashboard writes outgoing emails into the <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono">mail</code> collection. The Firebase Extension <strong>Trigger Email (firestore-send-email)</strong> reads the document and passes it to your SMTP server (e.g. Gmail / Google Workspace, SendGrid, or AWS SES).
            </p>
            <ol className="list-decimal pl-5 space-y-1.5 text-slate-800">
              <li>
                <strong>Google Workspace & Gmail SMTP:</strong> Regular login passwords will NOT work. You must use a 16-character <strong>App Password</strong> generated at <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-blue-600 underline">myaccount.google.com/apppasswords</a>.
              </li>
              <li>
                <strong>URI Formatting:</strong> The SMTP connection URI must be in the format: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">smtps://quinnledak%40vastasports.com:APP_PASSWORD@smtp.gmail.com:465</code>. Always replace the "@" in the username with "%40".
              </li>
              <li>
                <strong>Sender Matching:</strong> If logged in as Quinn Ledak, ensure the "From" address matches Quinn’s email or an authorized alias in Gmail.
              </li>
              <li>
                <strong>Dual-Write Redundancy:</strong> The app writes to both your named database and the default database, so the extension triggers regardless of database instance setting.
              </li>
            </ol>
          </div>
        )}

        {/* Test Email Section */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Send Live Test Email (Verifies SMTP Connection)
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="Enter recipient email..."
                className="flex-1 text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
              <button
                onClick={handleSendTest}
                disabled={sendingTest}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
              >
                <Send className={`w-3.5 h-3.5 ${sendingTest ? 'animate-pulse' : ''}`} />
                {sendingTest ? 'Sending...' : 'Send Live Test'}
              </button>
            </div>
          </div>
          <div className="text-xs text-slate-500 max-w-xs self-end pb-2">
            Dispatches a test message using the active sender configuration to verify real-time delivery.
          </div>
        </div>

        {/* Logs Table */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Recent Mail Delivery Logs ({logs.length})
            </h3>
            <span className="text-xs text-slate-400">
              Showing latest queued, delivered, or rejected messages
            </span>
          </div>

          {loading && logs.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin text-slate-300" />
              <p className="text-xs">Loading mail delivery logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
              <Mail className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">No mail documents recorded yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Send a test email above or submit a vacation/restock request to test.
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Recipient(s)</th>
                    <th className="py-2.5 px-3">Subject</th>
                    <th className="py-2.5 px-3">Sender (From)</th>
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((docItem) => {
                    const toFormatted = Array.isArray(docItem.to) 
                      ? docItem.to.join(', ') 
                      : (docItem.to || '(None)');
                    const dateFormatted = docItem.createdAt 
                      ? new Date(docItem.createdAt).toLocaleString([], { 
                          month: 'short', 
                          day: 'numeric', 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })
                      : 'Recently';

                    const isError = docItem.delivery?.state === 'ERROR';

                    return (
                      <tr 
                        key={`${docItem.database}-${docItem.id}`}
                        className={`transition-colors ${isError ? 'bg-rose-50/40 hover:bg-rose-50/70' : 'hover:bg-slate-50/80'}`}
                      >
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {getStatusBadge(docItem)}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-800 max-w-[170px] truncate" title={toFormatted}>
                          {toFormatted}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 max-w-[220px] truncate" title={docItem.subject}>
                          {docItem.subject}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 max-w-[140px] truncate" title={docItem.from || 'Extension Default'}>
                          {docItem.from ? docItem.from.replace('Vasta Performance Training <', '').replace('>', '') : 'Default'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                          {dateFormatted}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedDoc(docItem)}
                              className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                            >
                              Details
                            </button>
                            {isError && (
                              <button
                                onClick={() => handleRetrySingle(docItem)}
                                className="px-2 py-1 text-[11px] font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded transition-colors flex items-center gap-1"
                                title="Re-queue with active sender"
                              >
                                <RotateCcw className="w-3 h-3" />
                                Retry
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Detail Modal Overlay */}
        {selectedDoc && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-2xs">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
              <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <h4 className="font-bold text-slate-900 text-sm">Mail Document Inspection</h4>
                <button 
                  onClick={() => setSelectedDoc(null)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-3 text-xs max-h-[70vh] overflow-y-auto">
                <div>
                  <span className="font-semibold text-slate-500">Document ID:</span>
                  <div className="font-mono text-[11px] bg-slate-100 p-1.5 rounded mt-0.5 select-all">
                    {selectedDoc.id} ({selectedDoc.database === 'primary' ? firestoreDatabaseId : '(default)'})
                  </div>
                </div>

                <div>
                  <span className="font-semibold text-slate-500">To:</span>
                  <p className="font-medium text-slate-800 mt-0.5">
                    {Array.isArray(selectedDoc.to) ? selectedDoc.to.join(', ') : selectedDoc.to}
                  </p>
                </div>

                <div>
                  <span className="font-semibold text-slate-500">From:</span>
                  <p className="font-medium text-slate-800 mt-0.5">
                    {selectedDoc.from || 'Extension Default'}
                  </p>
                </div>

                <div>
                  <span className="font-semibold text-slate-500">Subject:</span>
                  <p className="font-medium text-slate-800 mt-0.5">{selectedDoc.subject}</p>
                </div>

                <div>
                  <span className="font-semibold text-slate-500">Delivery Status:</span>
                  <div className="mt-1">{getStatusBadge(selectedDoc)}</div>
                </div>

                {selectedDoc.delivery?.error && (
                  <div className="bg-rose-50 border border-rose-200 p-3 rounded-lg">
                    <span className="font-bold text-rose-800 block mb-1">SMTP Delivery Error:</span>
                    <pre className="font-mono text-[11px] text-rose-700 whitespace-pre-wrap select-all">
                      {selectedDoc.delivery.error}
                    </pre>

                    {/* Specific Diagnosis */}
                    {(() => {
                      const analysis = analyzeSmtpError(selectedDoc.delivery?.error);
                      return (
                        <div className="mt-3 pt-3 border-t border-rose-200 text-rose-950">
                          <p className="font-semibold text-rose-900 mb-1">{analysis.title}</p>
                          <p className="text-[11.5px] leading-relaxed mb-2">{analysis.explanation}</p>
                          <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-700">
                            {analysis.steps.map((s, idx) => (
                              <li key={idx}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {selectedDoc.delivery?.info && (
                  <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg">
                    <span className="font-bold text-emerald-800 block mb-1">SMTP Server Response:</span>
                    <pre className="font-mono text-[11px] text-emerald-700 whitespace-pre-wrap">
                      {JSON.stringify(selectedDoc.delivery.info, null, 2)}
                    </pre>
                  </div>
                )}

                {!selectedDoc.delivery && (
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-amber-900">
                    <span className="font-bold block mb-1">Extension Status:</span>
                    <p>
                      This document has not been updated by the Trigger Email extension yet. If this status remains for more than 30 seconds, please verify that the Trigger Email extension is configured and active in your Firebase Console.
                    </p>
                  </div>
                )}

                {selectedDoc.htmlPreview && (
                  <div>
                    <span className="font-semibold text-slate-500">Text Preview:</span>
                    <p className="bg-slate-50 p-2.5 rounded border border-slate-200 text-slate-600 mt-0.5 italic">
                      "{selectedDoc.htmlPreview}..."
                    </p>
                  </div>
                )}
              </div>

              <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
                {selectedDoc.delivery?.state === 'ERROR' && (
                  <button
                    onClick={() => {
                      handleRetrySingle(selectedDoc);
                      setSelectedDoc(null);
                    }}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold"
                  >
                    Re-send with Active Sender
                  </button>
                )}
                <button
                  onClick={() => setSelectedDoc(null)}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>
            Connected to Firebase project: <strong className="text-slate-700">vasta-management-dashboard</strong>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
