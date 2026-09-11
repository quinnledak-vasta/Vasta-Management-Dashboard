import React, { useState, useEffect, useRef } from 'react';
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
  ChevronUp,
  Search,
  ArrowDown
} from 'lucide-react';
import { 
  fetchMailDeliveryLogs, 
  sendTestEmailAlert, 
  retryMailDelivery, 
  resendMailDocument,
  getActiveSenderConfig,
  setActiveSenderConfig,
  checkServerEmailConfig,
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
      explanation: 'Your credentials and sender address were accepted! Google returned code 421 at the DATA command because a burst of automated check-in emails were submitted simultaneously. Google Workspace temporarily defers burst connections to protect against bulk automated traffic.',
      steps: [
        '1. Wait 5 to 15 minutes for Google\'s temporary SMTP cooldown to clear.',
        '2. Click "Retry All Failed" below (it now delivers each message with a staggered 1.2s delay to prevent burst triggers).',
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
  const [pageSize, setPageSize] = useState<number>(50);
  const [testEmail, setTestEmail] = useState(currentUserEmail);
  const [sendingTest, setSendingTest] = useState(false);
  const [retryingAll, setRetryingAll] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<MailDeliveryDoc | null>(null);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [showSenderSettings, setShowSenderSettings] = useState(false);
  const [isErrorBannerExpanded, setIsErrorBannerExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'error' | 'success' | 'queued'>('all');
  const [senderConfig, setSenderConfig] = useState(getActiveSenderConfig());
  const [serverConfig, setServerConfig] = useState<{
    configured: boolean;
    provider: string;
    defaultFrom: string;
    maskedKey: string | null;
  } | null>(null);

  const mainScrollRef = useRef<HTMLDivElement>(null);
  const logsSectionRef = useRef<HTMLDivElement>(null);

  const checkConfig = async () => {
    try {
      const cfg = await checkServerEmailConfig();
      setServerConfig(cfg);
    } catch (e) {
      console.warn('Failed to check server email config:', e);
    }
  };

  const loadLogs = async (size = pageSize) => {
    setLoading(true);
    try {
      const data = await fetchMailDeliveryLogs(size);
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
      loadLogs(pageSize);
      setTestEmail(currentUserEmail);
      setSenderConfig(getActiveSenderConfig());
      checkConfig();
    }
  }, [isOpen, currentUserEmail]);

  if (!isOpen) return null;

  const failedLogs = logs.filter(l => l.delivery?.state === 'ERROR');
  const successLogs = logs.filter(l => l.delivery?.state === 'SUCCESS');
  const queuedLogs = logs.filter(l => !l.delivery || (l.delivery.state !== 'SUCCESS' && l.delivery.state !== 'ERROR'));
  const latestErrorLog = failedLogs[0];
  const activeAnalysis = latestErrorLog ? analyzeSmtpError(latestErrorLog.delivery?.error) : null;

  // Filter logs based on search and status
  const filteredLogs = logs.filter((log) => {
    if (statusFilter === 'error' && log.delivery?.state !== 'ERROR') return false;
    if (statusFilter === 'success' && log.delivery?.state !== 'SUCCESS') return false;
    if (statusFilter === 'queued' && (log.delivery?.state === 'SUCCESS' || log.delivery?.state === 'ERROR')) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const toMatch = Array.isArray(log.to) ? log.to.join(' ').toLowerCase() : (log.to || '').toLowerCase();
      const subMatch = (log.subject || '').toLowerCase();
      const fromMatch = (log.from || '').toLowerCase();
      const errMatch = (log.delivery?.error || '').toLowerCase();
      const catMatch = (log.category || '').toLowerCase();
      return toMatch.includes(q) || subMatch.includes(q) || fromMatch.includes(q) || errMatch.includes(q) || catMatch.includes(q);
    }
    return true;
  });

  const handleSenderModeChange = (mode: SenderMode, customVal?: string) => {
    setActiveSenderConfig(mode, customVal);
    const updated = getActiveSenderConfig();
    setSenderConfig(updated);
    toast.success(`Active sender updated to: ${updated.effectiveFrom || 'Firebase Extension Default'}`);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    loadLogs(newSize);
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
    const toastId = toast.loading(`Dispatching email to ${docItem.to} via SendGrid...`);
    try {
      const ok = await resendMailDocument(docItem);
      if (ok) {
        toast.success('Email successfully dispatched via SendGrid! Refreshing logs...', { id: toastId });
        await loadLogs();
      } else {
        toast.error('Failed to send email. Check SendGrid API key.', { id: toastId });
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
    const toastId = toast.loading(`Re-sending ${failedLogs.length} failed emails via SendGrid...`);
    let reCount = 0;
    try {
      for (let i = 0; i < failedLogs.length; i++) {
        const docItem = failedLogs[i];
        const ok = await resendMailDocument(docItem);
        if (ok) reCount++;
        // Gentle 250ms delay between calls
        if (i < failedLogs.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
      toast.success(`Successfully dispatched ${reCount} message(s) via SendGrid!`, { id: toastId, duration: 6000 });
      await loadLogs();
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

  const scrollToLogs = () => {
    logsSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
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
      const isSendGrid = delivery.info?.provider === 'sendgrid_direct';
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          {isSendGrid ? 'SendGrid Delivered' : 'Delivered'}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl h-[92vh] max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Fixed Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
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
              onClick={() => loadLogs(pageSize)}
              disabled={loading}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
              title="Refresh logs"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Unified Scrollable Modal Body */}
        <div 
          ref={mainScrollRef} 
          className="flex-1 overflow-y-auto min-h-0 divide-y divide-slate-200/70 overscroll-contain"
        >
          {/* Diagnostic Status Bar */}
          <div className="px-6 py-2.5 bg-slate-100/70 flex flex-wrap items-center justify-between gap-3 text-xs sticky top-0 z-20 backdrop-blur-xs border-b border-slate-200/80 shadow-2xs">
            <div className="flex items-center flex-wrap gap-3 text-slate-600">
              {serverConfig && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold border ${
                  serverConfig.configured 
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
                    : 'bg-amber-50 text-amber-800 border-amber-300'
                }`}>
                  {serverConfig.configured ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>SendGrid Direct: Active</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      <span>SendGrid Key Missing</span>
                    </>
                  )}
                </span>
              )}
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
                Sender: <span className="text-slate-800 font-medium">{senderConfig.effectiveFrom || (serverConfig?.defaultFrom || 'quinnledak@vastasports.com')}</span>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={scrollToLogs}
                className="flex items-center gap-1 text-slate-600 hover:text-slate-900 font-medium transition-colors cursor-pointer bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs"
                title="Scroll down to log entries"
              >
                <ArrowDown className="w-3 h-3 text-slate-500" />
                <span>Jump to Logs ({logs.length})</span>
              </button>
              <button
                onClick={() => setShowSenderSettings(!showSenderSettings)}
                className="flex items-center gap-1 text-slate-700 hover:text-slate-900 font-medium transition-colors cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-slate-500" />
                {showSenderSettings ? 'Hide Sender' : 'Configure Sender'}
              </button>
              <button
                onClick={() => setShowTroubleshooting(!showTroubleshooting)}
                className="flex items-center gap-1 text-red-600 hover:text-red-700 font-medium transition-colors cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                {showTroubleshooting ? 'Hide Guide' : 'Setup Checklist'}
              </button>
            </div>
          </div>

          {/* SendGrid Direct Pipeline Status Banner */}
          {serverConfig?.configured ? (
            <div className="px-6 py-3 bg-emerald-50/90 border-b border-emerald-200 flex flex-wrap items-center justify-between gap-3 text-xs text-emerald-950">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="font-bold text-emerald-950">SendGrid Direct Pipeline Connected</p>
                  <p className="text-emerald-800 text-[11px]">
                    Notifications are sent immediately via SendGrid API. Google Cloud billing locks and Google Workspace SMTP limits are bypassed.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-emerald-900 bg-white/90 px-2.5 py-1 rounded-md border border-emerald-200 shadow-2xs">
                  Sender: <strong>{serverConfig.defaultFrom}</strong>
                </span>
                {failedLogs.length > 0 && (
                  <button
                    onClick={handleRetryAllFailed}
                    disabled={retryingAll}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-semibold text-xs transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                  >
                    <RotateCcw className={`w-3 h-3 ${retryingAll ? 'animate-spin' : ''}`} />
                    <span>Re-Send {failedLogs.length} Failed via SendGrid</span>
                  </button>
                )}
              </div>
            </div>
          ) : serverConfig && !serverConfig.configured ? (
            <div className="px-6 py-3 bg-amber-50/90 border-b border-amber-200 flex items-center justify-between text-xs text-amber-950">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <p className="font-bold text-amber-950">SendGrid API Key Not Detected</p>
                  <p className="text-amber-800 text-[11px]">
                    Ensure <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-900">SENDGRID_API_KEY</code> is saved in AI Studio <strong>Settings &gt; Secrets</strong>.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {/* Sender (FROM) Configuration Panel */}
          {showSenderSettings && (
            <div className="px-6 py-3.5 bg-slate-50 text-xs animate-in fade-in duration-150">
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
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
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
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
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
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
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

          {/* ACTIVE SMTP ERROR DIAGNOSIS BOX (with collapsible toggle) */}
          {latestErrorLog && activeAnalysis && (
            <div className="px-6 py-4 bg-rose-50/90 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 text-rose-900 font-bold text-sm">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                  <span>SMTP Status: {activeAnalysis.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsErrorBannerExpanded(!isErrorBannerExpanded)}
                    className="px-2.5 py-1.5 bg-white border border-rose-300 hover:bg-rose-100 text-rose-800 rounded-lg font-medium flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    {isErrorBannerExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    <span>{isErrorBannerExpanded ? 'Collapse Guide' : 'Expand Guide'}</span>
                  </button>
                  <button
                    onClick={handleRetryAllFailed}
                    disabled={retryingAll}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                    title="Re-queue all failed messages"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${retryingAll ? 'animate-spin' : ''}`} />
                    {retryingAll ? 'Retrying...' : `Retry All Failed (${failedLogs.length})`}
                  </button>
                  <button
                    onClick={handleCopyDiagnosticReport}
                    className="px-2.5 py-1.5 bg-white border border-rose-300 hover:bg-rose-100 text-rose-800 rounded-lg font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Copy technical diagnosis for support"
                  >
                    {copiedReport ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedReport ? 'Copied!' : 'Copy Report'}
                  </button>
                </div>
              </div>

              {isErrorBannerExpanded && (
                <div className="mt-2 space-y-3 animate-in fade-in duration-150">
                  <p className="text-rose-950 leading-relaxed">
                    {activeAnalysis.explanation}
                  </p>

                  {/* Step-by-step resolution box */}
                  <div className="bg-white/85 p-3.5 rounded-lg border border-rose-200 text-slate-800 space-y-2 shadow-2xs">
                    <div className="font-bold text-slate-900 flex items-center gap-1">
                      <Key className="w-3.5 h-3.5 text-red-600" />
                      Recommended Steps:
                    </div>
                    <ul className="space-y-1.5 pl-1 text-[11.5px] leading-normal">
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
                  <div className="text-[11px] text-rose-800 font-mono bg-rose-100/50 p-2 rounded border border-rose-200/80 truncate select-all" title={latestErrorLog.delivery?.error}>
                    <strong>Raw Error:</strong> {latestErrorLog.delivery?.error}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Troubleshooting Accordion */}
          {showTroubleshooting && (
            <div className="px-6 py-4 bg-amber-50/70 text-xs text-amber-950 space-y-2 max-h-64 overflow-y-auto">
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
          <div className="p-4 bg-slate-50/80 flex flex-wrap items-center gap-3">
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
                  className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                >
                  <Send className={`w-3.5 h-3.5 ${sendingTest ? 'animate-pulse' : ''}`} />
                  {sendingTest ? 'Sending...' : 'Send Live Test'}
                </button>
              </div>
            </div>
            <div className="text-xs text-slate-500 max-w-xs self-end pb-1.5">
              Dispatches an immediate message through the mail queue to test server response in real time.
            </div>
          </div>

          {/* Logs Section with Search, Filter, Limit, and Scrollable Table */}
          <div ref={logsSectionRef} className="p-6 space-y-3">
            
            {/* Table Header Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>Mail Delivery Log History</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
                    {filteredLogs.length} of {logs.length} loaded
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  Scroll down through full delivery history, inspection details, and live delivery status
                </p>
              </div>

              {/* Rows limit selector */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Show:</span>
                {[25, 50, 100, 200].map((size) => (
                  <button
                    key={size}
                    onClick={() => handlePageSizeChange(size)}
                    className={`px-2 py-1 rounded border text-xs font-medium cursor-pointer transition-colors ${
                      pageSize === size
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1.5 text-xs">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                    statusFilter === 'all'
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All ({logs.length})
                </button>
                <button
                  onClick={() => setStatusFilter('error')}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                    statusFilter === 'error'
                      ? 'bg-rose-600 text-white'
                      : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                  }`}
                >
                  Errors ({failedLogs.length})
                </button>
                <button
                  onClick={() => setStatusFilter('success')}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                    statusFilter === 'success'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  Delivered ({successLogs.length})
                </button>
                <button
                  onClick={() => setStatusFilter('queued')}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                    statusFilter === 'queued'
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  }`}
                >
                  Queued ({queuedLogs.length})
                </button>
              </div>

              {/* Search Box */}
              <div className="relative min-w-[220px]">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search recipient, subject..."
                  className="w-full text-xs pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Table Viewport */}
            {loading && logs.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin text-slate-300" />
                <p className="text-xs">Loading mail delivery logs...</p>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <Mail className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700">No matching mail documents found</p>
                <p className="text-xs text-slate-500 mt-1">
                  {searchQuery || statusFilter !== 'all' ? 'Try changing your search or status filter.' : 'Send a test email above or submit a vacation request to test.'}
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs bg-white">
                <div className="max-h-[500px] overflow-y-auto overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-100 z-10 border-b border-slate-200 text-slate-600 font-semibold shadow-2xs">
                      <tr>
                        <th className="py-2.5 px-3 whitespace-nowrap bg-slate-100">Status</th>
                        <th className="py-2.5 px-3 whitespace-nowrap bg-slate-100">Recipient(s)</th>
                        <th className="py-2.5 px-3 whitespace-nowrap bg-slate-100">Subject</th>
                        <th className="py-2.5 px-3 whitespace-nowrap bg-slate-100">Sender (From)</th>
                        <th className="py-2.5 px-3 whitespace-nowrap bg-slate-100">Timestamp</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap bg-slate-100">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredLogs.map((docItem) => {
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
                            <td className="py-2.5 px-3 text-slate-700 max-w-[240px]" title={docItem.subject}>
                              <div className="flex items-center gap-1.5 truncate">
                                {docItem.category === 'restock_request' && (
                                  <span className="shrink-0 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold text-[10px]">
                                    Restock
                                  </span>
                                )}
                                {docItem.category && docItem.category !== 'restock_request' && (
                                  <span className="shrink-0 px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[10px]">
                                    {docItem.category.replace(/_/g, ' ')}
                                  </span>
                                )}
                                <span className="truncate">{docItem.subject}</span>
                              </div>
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
                                  className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors cursor-pointer"
                                >
                                  Details
                                </button>
                                {isError && (
                                  <button
                                    onClick={() => handleRetrySingle(docItem)}
                                    className="px-2 py-1 text-[11px] font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded transition-colors flex items-center gap-1 cursor-pointer"
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
              </div>
            )}
          </div>
        </div>

        {/* Detail Modal Overlay */}
        {selectedDoc && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-2xs">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
              <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <h4 className="font-bold text-slate-900 text-sm">Mail Document Inspection</h4>
                <button 
                  onClick={() => setSelectedDoc(null)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
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
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Re-send with Active Sender
                  </button>
                )}
                <button
                  onClick={() => setSelectedDoc(null)}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-medium cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Fixed Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>
            Connected to Firebase project: <strong className="text-slate-700">vasta-management-dashboard</strong>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
