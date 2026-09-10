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
  HelpCircle
} from 'lucide-react';
import { 
  fetchMailDeliveryLogs, 
  sendTestEmailAlert, 
  retryMailDelivery, 
  MailDeliveryDoc 
} from '../lib/emailService';
import { firestoreDatabaseId, isCustomDatabase } from '../lib/firebase';
import { toast } from 'sonner';

interface EmailDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserEmail?: string;
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
  const [selectedDoc, setSelectedDoc] = useState<MailDeliveryDoc | null>(null);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await fetchMailDeliveryLogs(25);
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
    }
  }, [isOpen, currentUserEmail]);

  if (!isOpen) return null;

  const handleSendTest = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      toast.error('Please enter a valid email address.');
      return;
    }

    setSendingTest(true);
    const toastId = toast.loading(`Sending test email to ${testEmail}...`);
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

  const handleRetry = async (docItem: MailDeliveryDoc) => {
    const toastId = toast.loading(`Re-queueing email to ${docItem.to}...`);
    try {
      const ok = await retryMailDelivery(docItem.id, docItem.database);
      if (ok) {
        toast.success('Email re-queued for delivery! Refreshing...', { id: toastId });
        await loadLogs();
      } else {
        toast.error('Could not re-queue email.', { id: toastId });
      }
    } catch (err: any) {
      toast.error(`Retry error: ${err?.message || 'Unknown error'}`, { id: toastId });
    }
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
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Email Delivery Diagnostics & Logs</h2>
              <p className="text-xs text-slate-500">
                Inspect Firestore email queues, SMTP delivery states, and verify alert routing
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

        {/* Diagnostic Bar */}
        <div className="px-6 py-3 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4 text-slate-600">
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
          </div>

          <button
            onClick={() => setShowTroubleshooting(!showTroubleshooting)}
            className="flex items-center gap-1 text-red-600 hover:text-red-700 font-medium"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            {showTroubleshooting ? 'Hide Setup & Troubleshooting Guide' : 'Why aren’t emails arriving? (Troubleshooting)'}
          </button>
        </div>

        {/* Troubleshooting Accordion */}
        {showTroubleshooting && (
          <div className="px-6 py-4 bg-amber-50/60 border-b border-amber-200 text-xs text-amber-950 space-y-2 overflow-y-auto max-h-56">
            <div className="font-bold text-amber-900 text-sm flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              How Firebase Email Delivery Works & 4 Key Checks:
            </div>
            <p>
              In Firebase, the web app writes email notifications to the <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono">mail</code> collection. The <strong>Trigger Email</strong> Firebase extension (powered by Nodemailer) listens for documents, connects to your SMTP server (e.g. SendGrid, Postmark, Google Workspace, or AWS SES), and updates the document with a <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono">delivery</code> field.
            </p>
            <ol className="list-decimal pl-5 space-y-1.5 text-slate-800">
              <li>
                <strong>Trigger Email Extension Installation:</strong> Ensure the <em>Trigger Email from Firebase (firestore-send-email)</em> extension is installed in your Firebase Console at <a href="https://console.firebase.google.com/project/vasta-management-dashboard/extensions" target="_blank" rel="noreferrer" className="text-blue-600 underline">Firebase Extensions</a>.
              </li>
              <li>
                <strong>Database Instance Matching:</strong> In your Firebase Extension settings, check which Firestore instance ID it is attached to. We now dual-write to <em>both</em> <code className="font-mono">{firestoreDatabaseId}</code> and <code className="font-mono">(default)</code> so the extension captures all requests regardless of setting.
              </li>
              <li>
                <strong>SMTP Credentials & From Address:</strong> Check if your SMTP connection URI in the extension is active and valid. If using Gmail/Google Workspace, verify that the <em>App Password</em> has not expired. Also ensure the <code className="font-mono">from</code> address is authorized on your domain.
              </li>
              <li>
                <strong>Spam & Quarantine Check:</strong> Automated alerts from new SMTP relays often land in the recipient’s <strong>Spam / Junk</strong> folder or Google Workspace quarantine. Ask recipients (e.g. Quinn Ledak, location managers) to search their Spam folder for <em>"Vasta"</em>.
              </li>
            </ol>
          </div>
        )}

        {/* Test Email Section */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Send Live Test Email
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
                {sendingTest ? 'Dispatching...' : 'Send Test'}
              </button>
            </div>
          </div>
          <div className="text-xs text-slate-500 max-w-xs self-end pb-2">
            Dispatches a test message through the Firestore mail queue to test extension response in real time.
          </div>
        </div>

        {/* Logs Table */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Recent Mail Documents ({logs.length})
            </h3>
            <span className="text-xs text-slate-400">
              Showing latest 25 queued/sent messages
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
                    <th className="py-2.5 px-3">DB Source</th>
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

                    return (
                      <tr 
                        key={`${docItem.database}-${docItem.id}`}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {getStatusBadge(docItem)}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-800 max-w-[180px] truncate" title={toFormatted}>
                          {toFormatted}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 max-w-[240px] truncate" title={docItem.subject}>
                          {docItem.subject}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            docItem.database === 'primary'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}>
                            {docItem.database === 'primary' ? 'Primary DB' : 'Default DB'}
                          </span>
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
                            {docItem.delivery?.state === 'ERROR' && (
                              <button
                                onClick={() => handleRetry(docItem)}
                                className="px-2 py-1 text-[11px] font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded transition-colors flex items-center gap-1"
                                title="Re-queue email in Firestore"
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
                  <span className="font-semibold text-slate-500">Subject:</span>
                  <p className="font-medium text-slate-800 mt-0.5">{selectedDoc.subject}</p>
                </div>

                <div>
                  <span className="font-semibold text-slate-500">Delivery Status:</span>
                  <div className="mt-1">{getStatusBadge(selectedDoc)}</div>
                </div>

                {selectedDoc.delivery?.error && (
                  <div className="bg-rose-50 border border-rose-200 p-3 rounded-lg">
                    <span className="font-bold text-rose-800 block mb-1">SMTP Delivery Error Details:</span>
                    <pre className="font-mono text-[11px] text-rose-700 whitespace-pre-wrap">
                      {selectedDoc.delivery.error}
                    </pre>
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
                      This document has not been updated by the Trigger Email extension. If this status does not change after 15–30 seconds, please verify that the Trigger Email extension is configured and active in your Firebase Console.
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
                      handleRetry(selectedDoc);
                      setSelectedDoc(null);
                    }}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold"
                  >
                    Retry Sending
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
