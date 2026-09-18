import React, { useState } from 'react';
import { 
  Paperclip, 
  Upload, 
  FileText, 
  FileSpreadsheet, 
  FileCode, 
  FileArchive, 
  FileAudio, 
  FileVideo, 
  ExternalLink, 
  Download, 
  Trash2, 
  Eye, 
  Plus, 
  Check, 
  X,
  Link as LinkIcon,
  Image as ImageIcon
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { LessonAttachment } from '../types';
import { saveLocalVideo, getLocalVideoBlob } from '../lib/videoCache';
import { toast } from 'sonner';

export function getAttachmentIcon(attachment: LessonAttachment | { name: string; url?: string; fileType?: string }) {
  const name = (attachment.name || '').toLowerCase();
  const fileType = (attachment.fileType || '').toLowerCase();
  const url = (attachment.url || '').toLowerCase();

  if (fileType.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name) || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(url)) {
    return <ImageIcon className="w-4 h-4 text-sky-500 shrink-0" />;
  }
  if (fileType.includes('pdf') || name.endsWith('.pdf') || url.endsWith('.pdf')) {
    return <FileText className="w-4 h-4 text-red-500 shrink-0" />;
  }
  if (/\.(xls|xlsx|csv|tsv)$/i.test(name) || fileType.includes('sheet') || fileType.includes('csv')) {
    return <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />;
  }
  if (/\.(doc|docx|odt|rtf|txt|md)$/i.test(name) || fileType.includes('word') || fileType.includes('document')) {
    return <FileText className="w-4 h-4 text-blue-500 shrink-0" />;
  }
  if (/\.(mp4|mov|webm|mkv|avi)$/i.test(name) || fileType.startsWith('video/')) {
    return <FileVideo className="w-4 h-4 text-purple-500 shrink-0" />;
  }
  if (/\.(mp3|wav|ogg|m4a)$/i.test(name) || fileType.startsWith('audio/')) {
    return <FileAudio className="w-4 h-4 text-amber-500 shrink-0" />;
  }
  if (/\.(zip|tar|gz|rar|7z)$/i.test(name) || fileType.includes('zip') || fileType.includes('archive')) {
    return <FileArchive className="w-4 h-4 text-orange-500 shrink-0" />;
  }
  if (/\.(json|js|ts|html|css|xml|yaml|yml)$/i.test(name)) {
    return <FileCode className="w-4 h-4 text-indigo-500 shrink-0" />;
  }
  return <Paperclip className="w-4 h-4 text-slate-500 shrink-0" />;
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface LessonAttachmentManagerProps {
  attachments: LessonAttachment[];
  onChange: (attachments: LessonAttachment[]) => void;
}

export function LessonAttachmentManager({ attachments, onChange }: LessonAttachmentManagerProps) {
  const [activeTab, setActiveTab] = useState<'upload' | 'link'>('upload');
  const [isUploading, setIsUploading] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [isDragActive, setIsDragActive] = useState(false);

  const handleFilesAdded = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    const toastId = toast.loading(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`);

    try {
      const newAttachments: LessonAttachment[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Save to IndexedDB with automatic background Firestore synchronization
        const storageKey = await saveLocalVideo(file);
        const attachment: LessonAttachment = {
          id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: file.name,
          url: storageKey,
          type: 'file',
          fileType: file.type || 'application/octet-stream',
          size: file.size,
          createdAt: new Date().toISOString()
        };
        newAttachments.push(attachment);
      }

      onChange([...attachments, ...newAttachments]);
      toast.success(`Successfully added ${newAttachments.length} file${newAttachments.length > 1 ? 's' : ''}!`, { id: toastId });
    } catch (err) {
      console.error('Failed to attach files:', err);
      toast.error('Failed to save one or more files.', { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddLink = () => {
    const trimmed = linkUrl.trim();
    if (!trimmed) {
      toast.error('Please enter a valid URL');
      return;
    }
    const finalUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const name = linkTitle.trim() || trimmed.replace(/^https?:\/\//i, '').split('/')[0] || 'Web Resource';

    const newAttachment: LessonAttachment = {
      id: `att_link_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name,
      url: finalUrl,
      type: 'link',
      createdAt: new Date().toISOString()
    };

    onChange([...attachments, newAttachment]);
    setLinkUrl('');
    setLinkTitle('');
    toast.success('Link added as lesson reference!');
  };

  const handleRemove = (id: string) => {
    onChange(attachments.filter(a => a.id !== id));
  };

  return (
    <div className="grid gap-3 border border-slate-100 rounded-xl p-4 bg-slate-50/50">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-slate-800 font-bold text-xs flex items-center gap-1.5">
            <Paperclip className="w-3.5 h-3.5 text-red-600" />
            Lesson Files & Resources ({attachments.length})
          </Label>
          <p className="text-[10px] text-slate-500 leading-normal">
            Attach multiple files of any type (PDFs, templates, spreadsheets, slides, images, videos, or cloud links) for trainees to reference.
          </p>
        </div>
        <div className="flex bg-slate-100 rounded-lg p-0.5 border border-slate-200">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className={`h-6 text-[10px] px-2.5 rounded-md font-semibold transition-all ${
              activeTab === 'upload' 
                ? 'bg-white shadow-xs text-slate-800' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
            onClick={() => setActiveTab('upload')}
          >
            Upload Files
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className={`h-6 text-[10px] px-2.5 rounded-md font-semibold transition-all ${
              activeTab === 'link' 
                ? 'bg-white shadow-xs text-slate-800' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
            onClick={() => setActiveTab('link')}
          >
            Add Link
          </Button>
        </div>
      </div>

      {/* Input controls based on activeTab */}
      {activeTab === 'upload' ? (
        <div
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragActive(true); }}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragActive(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragActive(false); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragActive(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              handleFilesAdded(e.dataTransfer.files);
            }
          }}
          className={`border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center text-center transition-all ${
            isDragActive 
              ? 'border-red-500 bg-red-50/20' 
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <input
            type="file"
            id="multi-lesson-files"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFilesAdded(e.target.files);
                e.target.value = '';
              }
            }}
          />
          <label htmlFor="multi-lesson-files" className="cursor-pointer flex flex-col items-center justify-center space-y-1.5 w-full">
            {isUploading ? (
              <div className="flex flex-col items-center py-2 space-y-1.5">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-600"></div>
                <span className="text-xs font-semibold text-slate-600">Saving files to storage...</span>
              </div>
            ) : (
              <>
                <div className="p-2 bg-slate-50 rounded-full border border-slate-100 text-slate-500">
                  <Upload className="w-4 h-4 text-slate-600" />
                </div>
                <p className="text-xs font-bold text-slate-700">Click to browse or drop multiple files</p>
                <p className="text-[10px] text-slate-400">Any file type: PDF, DOCX, XLSX, CSV, Images, Audio, ZIP, etc. (Multi-file enabled)</p>
              </>
            )}
          </label>
        </div>
      ) : (
        <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="att-link-url" className="text-[10px] text-slate-500 font-semibold">Web URL / Cloud Link</Label>
              <Input
                id="att-link-url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://docs.google.com/... or cloud link"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="att-link-title" className="text-[10px] text-slate-500 font-semibold">Link Title / Label</Label>
              <Input
                id="att-link-title"
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
                placeholder="e.g. Master Spreadsheet"
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <Button
              type="button"
              size="xs"
              onClick={handleAddLink}
              disabled={!linkUrl.trim()}
              className="bg-slate-900 hover:bg-slate-800 text-white text-[11px] h-7 px-3"
            >
              <Plus className="w-3 h-3 mr-1" /> Add Reference Link
            </Button>
          </div>
        </div>
      )}

      {/* List of currently attached files */}
      {attachments.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between items-center px-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
              Attached Items ({attachments.length})
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => onChange([])}
              className="h-5 text-[10px] text-slate-400 hover:text-red-600 p-0"
            >
              Clear all
            </Button>
          </div>

          <div className="max-h-[180px] overflow-y-auto space-y-1.5 pr-0.5">
            {attachments.map((att, idx) => (
              <div
                key={att.id || idx}
                className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-lg shadow-2xs hover:border-slate-300 transition-all text-xs"
              >
                <div className="flex items-center gap-2 overflow-hidden min-w-0 pr-2">
                  <div className="p-1.5 bg-slate-50 border border-slate-100 rounded-md shrink-0">
                    {att.type === 'link' ? <LinkIcon className="w-3.5 h-3.5 text-blue-500" /> : getAttachmentIcon(att)}
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="font-semibold text-slate-800 truncate text-[11px]">{att.name}</p>
                    <div className="flex items-center gap-1.5 text-[9px] text-slate-400">
                      <span>{att.type === 'link' ? 'Web Link' : (att.fileType || 'File')}</span>
                      {att.size && <span>• {formatFileSize(att.size)}</span>}
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => handleRemove(att.id)}
                  className="h-6 w-6 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                  title="Remove file"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface LessonAttachmentViewerProps {
  attachments?: LessonAttachment[];
  lessonTitle: string;
}

export function LessonAttachmentViewer({ attachments, lessonTitle }: LessonAttachmentViewerProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<{ name: string; url: string; type: string } | null>(null);

  if (!attachments || attachments.length === 0) {
    return null;
  }

  const handleOpenOrDownload = async (att: LessonAttachment) => {
    if (att.type === 'link') {
      window.open(att.url, '_blank', 'noopener,noreferrer');
      return;
    }

    // Direct HTTP url (external download or cloud storage)
    if (att.url.startsWith('http://') || att.url.startsWith('https://')) {
      window.open(att.url, '_blank', 'noopener,noreferrer');
      return;
    }

    // Base64 data URL
    if (att.url.startsWith('data:')) {
      const link = document.createElement('a');
      link.href = att.url;
      link.download = att.name || 'lesson_file';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // Local / Firestore synced file key
    setDownloadingId(att.id);
    const toastId = toast.loading(`Loading ${att.name}...`);
    try {
      const blob = await getLocalVideoBlob(att.url);
      if (blob) {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = att.name || 'lesson_file';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
        toast.success(`Downloaded ${att.name}`, { id: toastId });
      } else {
        toast.error(`File could not be loaded from storage.`, { id: toastId });
      }
    } catch (err) {
      console.error(err);
      toast.error(`Failed to download ${att.name}`, { id: toastId });
    } finally {
      setDownloadingId(null);
    }
  };

  const handlePreview = async (att: LessonAttachment) => {
    if (att.type === 'link') {
      window.open(att.url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (att.url.startsWith('data:') || att.url.startsWith('http')) {
      setPreviewAttachment({ name: att.name, url: att.url, type: att.fileType || '' });
      return;
    }

    setDownloadingId(att.id);
    const toastId = toast.loading(`Opening preview for ${att.name}...`);
    try {
      const blob = await getLocalVideoBlob(att.url);
      if (blob) {
        const objectUrl = URL.createObjectURL(blob);
        setPreviewAttachment({ name: att.name, url: objectUrl, type: blob.type || att.fileType || '' });
        toast.dismiss(toastId);
      } else {
        toast.error('File unavailable for preview', { id: toastId });
      }
    } catch (err) {
      console.error(err);
      toast.error('Error previewing file', { id: toastId });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="p-6 border-t border-slate-100 bg-slate-50/40 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-red-50 text-red-600 rounded-md">
            <Paperclip className="w-4 h-4" />
          </div>
          <div>
            <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
              Attached Lesson Resources ({attachments.length})
            </h5>
            <p className="text-[10px] text-slate-500">Supporting documents, sheets, templates, and references for this lesson.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
        {attachments.map((att) => {
          const isLink = att.type === 'link';
          const canPreviewInline = !isLink && (
            (att.fileType || '').includes('image') || 
            (att.fileType || '').includes('pdf') || 
            /\.(png|jpe?g|gif|webp|svg|pdf)$/i.test(att.name)
          );

          return (
            <div
              key={att.id}
              className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl shadow-2xs hover:border-slate-300 transition-all gap-3"
            >
              <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
                <div className="p-2 bg-slate-50 border border-slate-100 rounded-lg shrink-0">
                  {isLink ? <ExternalLink className="w-4 h-4 text-blue-500" /> : getAttachmentIcon(att)}
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-xs font-bold text-slate-800 truncate" title={att.name}>
                    {att.name}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {isLink ? 'External Link' : (att.size ? formatFileSize(att.size) : (att.fileType || 'Document'))}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {canPreviewInline && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => handlePreview(att)}
                    disabled={downloadingId === att.id}
                    className="h-7 px-2 text-[10px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                    title="Preview"
                  >
                    <Eye className="w-3 h-3 mr-1" /> View
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => handleOpenOrDownload(att)}
                  disabled={downloadingId === att.id}
                  className="h-7 px-2.5 text-[10px] font-bold text-slate-700 hover:text-slate-900 bg-white border-slate-200 hover:bg-slate-50 rounded-md"
                >
                  {isLink ? (
                    <>
                      <ExternalLink className="w-3 h-3 mr-1 text-blue-500" /> Open
                    </>
                  ) : (
                    <>
                      <Download className="w-3 h-3 mr-1 text-red-600" /> Download
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Preview Dialog */}
      {previewAttachment && (
        <Dialog open={!!previewAttachment} onOpenChange={(open) => !open && setPreviewAttachment(null)}>
          <DialogContent className="sm:max-w-[800px] max-h-[85vh] overflow-hidden flex flex-col p-4">
            <DialogHeader className="pb-2 border-b border-slate-100 flex flex-row items-center justify-between">
              <DialogTitle className="text-sm font-bold text-slate-900 truncate">
                {previewAttachment.name}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-auto min-h-[400px] flex items-center justify-center bg-slate-900/5 rounded-lg p-2">
              {previewAttachment.type.includes('pdf') || previewAttachment.name.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={previewAttachment.url}
                  className="w-full h-[550px] border-none rounded"
                  title={previewAttachment.name}
                />
              ) : (
                <img
                  src={previewAttachment.url}
                  alt={previewAttachment.name}
                  className="max-h-[550px] max-w-full object-contain rounded shadow-xs"
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
