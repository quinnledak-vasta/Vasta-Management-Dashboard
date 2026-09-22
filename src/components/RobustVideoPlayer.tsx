import React, { useRef, useState, useEffect } from 'react';
import { 
  Play, 
  Volume2, 
  AlertTriangle, 
  Download, 
  ExternalLink, 
  RefreshCw, 
  Info, 
  Maximize2,
  CheckCircle2
} from 'lucide-react';
import { Button } from '../../components/ui/button';

interface RobustVideoPlayerProps {
  src: string;
  title?: string;
  mimeType?: string;
  className?: string;
  autoPlay?: boolean;
  downloadFileName?: string;
  badge?: string;
  onEnded?: () => void;
}

export const RobustVideoPlayer: React.FC<RobustVideoPlayerProps> = ({
  src,
  title,
  mimeType = 'video/mp4',
  className = '',
  autoPlay = false,
  downloadFileName,
  badge,
  onEnded
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isAudioOnly, setIsAudioOnly] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showTroubleshootModal, setShowTroubleshootModal] = useState(false);
  const [hasCheckedFrames, setHasCheckedFrames] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Normalize effective mime type for sources
  const isWebM = mimeType?.includes('webm') || src.endsWith('.webm');
  const primaryMime = isWebM ? 'video/webm' : 'video/mp4';

  useEffect(() => {
    setIsAudioOnly(false);
    setVideoDimensions(null);
    setHasCheckedFrames(false);
    setShowTroubleshootModal(false);
  }, [src, reloadKey]);

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    setDuration(v.duration || 0);

    if (v.videoWidth > 0 && v.videoHeight > 0) {
      setVideoDimensions({ width: v.videoWidth, height: v.videoHeight });
      setIsAudioOnly(false);
    } else {
      // If metadata loaded but dimensions are 0, this indicates an audio-only stream or undecodable video track
      setIsAudioOnly(true);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    setCurrentTime(v.currentTime);

    // If video has been playing for over 1.2 seconds, check frame decode health
    if (!hasCheckedFrames && v.currentTime > 1.2 && !v.paused) {
      setHasCheckedFrames(true);

      // Check if video dimensions are missing or 0
      if (v.videoWidth === 0 || v.videoHeight === 0) {
        setIsAudioOnly(true);
        return;
      }

      // Check Chromium totalVideoFrames / webkitDecodedFrameCount API
      const quality = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
      const decodedFrames = quality ? quality.totalVideoFrames : (v as any).webkitDecodedFrameCount;

      if (typeof decodedFrames === 'number' && decodedFrames === 0) {
        // Audio is actively playing, but browser has decoded 0 video frames (black screen)
        setIsAudioOnly(true);
      }
    }
  };

  const handleOpenInNewWindow = () => {
    try {
      const win = window.open();
      if (win) {
        win.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>${title || 'Video Player'}</title>
              <style>
                body { margin: 0; background: #0b0f19; display: flex; align-items: center; justify-content: center; height: 100vh; overflow: hidden; font-family: sans-serif; }
                video { max-width: 100%; max-height: 100%; outline: none; }
              </style>
            </head>
            <body>
              <video src="${src}" controls autoplay playsinline></video>
            </body>
          </html>
        `);
        win.document.close();
      } else {
        window.open(src, '_blank');
      }
    } catch {
      window.open(src, '_blank');
    }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = src;
    a.download = downloadFileName || (title ? `${title}.mp4` : 'lesson_video.mp4');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleForceReload = () => {
    setReloadKey(prev => prev + 1);
  };

  return (
    <div className={`relative w-full h-full bg-black overflow-hidden group select-none flex items-center justify-center ${className}`}>
      {/* HTML5 Native Video */}
      <video
        key={`${src}_${reloadKey}`}
        ref={videoRef}
        controls
        playsInline
        preload="auto"
        autoPlay={autoPlay}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={onEnded}
        className="w-full h-full object-contain max-h-full max-w-full block bg-black"
      >
        <source src={src} type={primaryMime} />
        {mimeType && mimeType !== primaryMime && (
          <source src={src} type={mimeType} />
        )}
        <source src={src} />
        Your browser does not support HTML5 video playback.
      </video>

      {/* Top Bar Header Badges & Quick Tools */}
      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none transition-opacity duration-200 group-hover:opacity-100 opacity-90">
        <div className="flex items-center gap-2 pointer-events-auto">
          {badge && (
            <span className="px-2 py-0.5 bg-slate-900/85 backdrop-blur-xs text-white text-[10px] font-bold rounded-md shadow-md border border-slate-700/50 flex items-center gap-1.5 font-mono uppercase">
              {badge}
            </span>
          )}
          {videoDimensions && !isAudioOnly && (
            <span className="px-2 py-0.5 bg-slate-900/80 backdrop-blur-xs text-slate-300 text-[10px] font-semibold rounded-md border border-slate-800 font-mono">
              {videoDimensions.width}x{videoDimensions.height}
              {videoDimensions.height >= 1080 ? ' (1080p)' : videoDimensions.height >= 720 ? ' (720p)' : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button
            type="button"
            onClick={handleOpenInNewWindow}
            className="px-2 py-1 bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-white rounded text-[10px] font-bold backdrop-blur-xs transition-colors border border-slate-700/50 flex items-center gap-1 shadow-sm"
            title="Open in standalone window (uses native system decoders)"
          >
            <ExternalLink className="w-3 h-3" />
            <span className="hidden sm:inline">Pop-out</span>
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="px-2 py-1 bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-white rounded text-[10px] font-bold backdrop-blur-xs transition-colors border border-slate-700/50 flex items-center gap-1 shadow-sm"
            title="Download video to play in system player (VLC, QuickTime, etc.)"
          >
            <Download className="w-3 h-3" />
            <span className="hidden sm:inline">Download</span>
          </button>
          <button
            type="button"
            onClick={() => setShowTroubleshootModal(prev => !prev)}
            className={`px-2 py-1 rounded text-[10px] font-bold backdrop-blur-xs transition-colors border flex items-center gap-1 shadow-sm ${
              isAudioOnly
                ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-400 animate-pulse'
                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700/50'
            }`}
            title="Video diagnostics and black screen assistance"
          >
            <AlertTriangle className="w-3 h-3" />
            <span className="hidden sm:inline">{isAudioOnly ? 'Black Screen Fix' : 'Help'}</span>
          </button>
        </div>
      </div>

      {/* Audio-Only / Undecodable Video Track Notification Overlay */}
      {isAudioOnly && (
        <div className="absolute bottom-14 left-4 right-4 bg-slate-900/95 border border-amber-500/50 text-slate-100 p-3.5 rounded-xl shadow-2xl backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg shrink-0 mt-0.5 sm:mt-0">
              <Volume2 className="w-5 h-5 animate-pulse" />
            </div>
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-400 font-mono uppercase tracking-wide">
                  Audio Playing • Video Stream Unavailable
                </span>
                <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-950 text-amber-300 border border-amber-800">
                  Codec Notice
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                The audio track is playing, but your browser cannot render the video stream (commonly caused by iPhone HEVC/H.265 or QuickTime format).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center w-full sm:w-auto justify-end">
            <Button
              type="button"
              size="xs"
              onClick={handleOpenInNewWindow}
              className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] px-3 h-7 shadow-xs"
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              Pop-out Player
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={handleDownload}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border-slate-700 font-semibold text-[11px] px-2.5 h-7"
            >
              <Download className="w-3 h-3 mr-1" />
              Download
            </Button>
          </div>
        </div>
      )}

      {/* Troubleshoot & Video Health Helper Modal */}
      {showTroubleshootModal && (
        <div className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-md p-6 flex flex-col justify-center items-center text-center animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-left">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-amber-500/20 text-amber-400 rounded-md">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-bold text-white">Video Playback Troubleshooter</h4>
              </div>
              <button
                type="button"
                onClick={() => setShowTroubleshootModal(false)}
                className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1 rounded bg-slate-800"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <p>
                <strong className="text-white">Why is there a black screen while audio works?</strong>
              </p>
              <p className="text-slate-400">
                Videos recorded on iPhones, iPads, or Macs often use <span className="text-amber-300 font-mono">HEVC (H.265)</span> or Apple QuickTime formats. In web browsers, the audio (AAC) decodes cleanly, but video frames may be blocked if the browser lacks an HEVC hardware decoder.
              </p>

              <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 space-y-1.5">
                <div className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Recommended Solutions:
                </div>
                <ul className="list-disc pl-5 space-y-1 text-slate-400 text-[11px]">
                  <li>Click <strong>Pop-out Player</strong> to open the video in a dedicated tab where system decoders engage.</li>
                  <li>Click <strong>Download Video</strong> to view offline in VLC, QuickTime, or Windows Media Player.</li>
                  <li>When creating future lessons, export in <strong>standard MP4 (H.264)</strong> for universal web playback.</li>
                </ul>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleForceReload}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 text-xs h-8"
              >
                <RefreshCw className="w-3 h-3 mr-1.5" />
                Force Reload
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleOpenInNewWindow}
                className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs h-8 shadow-xs"
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Open Pop-out
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
