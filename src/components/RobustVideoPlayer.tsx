import React, { useRef, useState, useEffect, useCallback } from 'react';
import { 
  Play, 
  Volume2, 
  AlertTriangle, 
  Download, 
  ExternalLink, 
  RefreshCw, 
  Info, 
  Maximize2,
  CheckCircle2,
  Sparkles,
  Loader2
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { repairAndPersistVideo } from '../lib/videoTranscoder';

interface RobustVideoPlayerProps {
  src: string;
  storageKey?: string;
  title?: string;
  mimeType?: string;
  className?: string;
  autoPlay?: boolean;
  downloadFileName?: string;
  badge?: string;
  onEnded?: () => void;
  onVideoRepaired?: (newUrl: string) => void;
}

export const RobustVideoPlayer: React.FC<RobustVideoPlayerProps> = ({
  src,
  storageKey,
  title,
  mimeType = 'video/mp4',
  className = '',
  autoPlay = false,
  downloadFileName,
  badge,
  onEnded,
  onVideoRepaired
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentSrc, setCurrentSrc] = useState<string>(src);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isAudioOnly, setIsAudioOnly] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showTroubleshootModal, setShowTroubleshootModal] = useState(false);
  const [hasCheckedFrames, setHasCheckedFrames] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Transcoding / Repair State
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [transcodeProgress, setTranscodeProgress] = useState<string>('');
  const [transcodeError, setTranscodeError] = useState<string | null>(null);
  const [hasRepaired, setHasRepaired] = useState(false);

  // Update currentSrc whenever parent src changes
  useEffect(() => {
    setCurrentSrc(src);
    setIsAudioOnly(false);
    setVideoDimensions(null);
    setHasCheckedFrames(false);
    setShowTroubleshootModal(false);
    setIsTranscoding(false);
    setTranscodeError(null);
    setHasRepaired(false);
  }, [src]);

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    setDuration(v.duration || 0);

    if (v.videoWidth > 0 && v.videoHeight > 0) {
      setVideoDimensions({ width: v.videoWidth, height: v.videoHeight });
      // If we already know the video track rendered dimensions and haven't hit codec block
      if (!isAudioOnly && !hasRepaired) {
        setIsAudioOnly(false);
      }
    } else {
      // 0 dimensions on metadata loaded usually means an audio-only stream or undecodable video track
      setIsAudioOnly(true);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    setCurrentTime(v.currentTime);

    // If already repaired with universal MP4, no need to check
    if (hasRepaired) return;

    // Check decoded video frames once video has played for > 1.0 second
    if (!hasCheckedFrames && v.currentTime > 1.0 && !v.paused) {
      setHasCheckedFrames(true);

      // Check Chromium totalVideoFrames / webkitDecodedFrameCount API
      const quality = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
      const decodedFrames = quality ? quality.totalVideoFrames : (v as any).webkitDecodedFrameCount;

      if (typeof decodedFrames === 'number' && decodedFrames === 0) {
        // Audio is actively playing, but browser has decoded 0 video frames (black screen)
        setIsAudioOnly(true);
      } else if (v.videoWidth === 0 || v.videoHeight === 0) {
        setIsAudioOnly(true);
      }
    }
  };

  // Perform server-side transcode to universal H.264 MP4
  const handleRepairVideo = useCallback(async () => {
    if (isTranscoding) return;
    setIsTranscoding(true);
    setTranscodeError(null);
    setTranscodeProgress('Connecting to server FFmpeg transcoder...');

    try {
      setTranscodeProgress('Transcoding video stream with FFmpeg (converting to universal H.264 MP4)...');
      
      const result = await repairAndPersistVideo(currentSrc, storageKey, title);
      
      setCurrentSrc(result.url);
      setHasRepaired(true);
      setIsAudioOnly(false);
      setTranscodeProgress('Video successfully repaired!');
      setShowTroubleshootModal(false);
      
      if (onVideoRepaired) {
        onVideoRepaired(result.url);
      }

      // Re-attach video element to new universal stream
      if (videoRef.current) {
        videoRef.current.src = result.url;
        videoRef.current.load();
        videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.error('Video repair error:', err);
      setTranscodeError(err.message || 'Server failed to transcode video');
    } finally {
      setIsTranscoding(false);
    }
  }, [currentSrc, storageKey, title, isTranscoding, onVideoRepaired]);

  const handleForceReload = () => {
    setReloadKey(prev => prev + 1);
    if (videoRef.current) {
      videoRef.current.load();
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
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <title>${title || 'Video Player'} - Pop-out Player</title>
              <style>
                * { box-sizing: border-box; }
                body {
                  margin: 0;
                  padding: 0;
                  background: #090d16;
                  color: #e2e8f0;
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                  display: flex;
                  flex-direction: column;
                  height: 100vh;
                  overflow: hidden;
                }
                .toolbar {
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  padding: 12px 20px;
                  background: #0f172a;
                  border-bottom: 1px solid #1e293b;
                  flex-shrink: 0;
                }
                .title-area {
                  display: flex;
                  align-items: center;
                  gap: 12px;
                  min-width: 0;
                }
                .title {
                  font-size: 14px;
                  font-weight: 700;
                  color: #f8fafc;
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
                }
                .badge {
                  font-size: 10px;
                  font-weight: 800;
                  text-transform: uppercase;
                  padding: 3px 8px;
                  border-radius: 6px;
                  background: #1e293b;
                  color: #94a3b8;
                  border: 1px solid #334155;
                }
                .actions {
                  display: flex;
                  align-items: center;
                  gap: 10px;
                  flex-shrink: 0;
                }
                button, .btn {
                  font-size: 12px;
                  font-weight: 600;
                  padding: 6px 14px;
                  border-radius: 8px;
                  cursor: pointer;
                  display: inline-flex;
                  align-items: center;
                  gap: 6px;
                  border: 1px solid transparent;
                  text-decoration: none;
                  transition: all 0.15s ease;
                }
                .btn-repair {
                  background: #dc2626;
                  color: #ffffff;
                }
                .btn-repair:hover { background: #b91c1c; }
                .btn-secondary {
                  background: #1e293b;
                  color: #cbd5e1;
                  border-color: #334155;
                }
                .btn-secondary:hover { background: #334155; color: #ffffff; }
                .player-container {
                  flex: 1;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  padding: 24px;
                  position: relative;
                }
                video {
                  max-width: 100%;
                  max-height: 100%;
                  border-radius: 12px;
                  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
                  outline: none;
                  background: #000;
                }
                #status-banner {
                  position: absolute;
                  bottom: 40px;
                  left: 50%;
                  transform: translateX(-50%);
                  background: rgba(15, 23, 42, 0.95);
                  border: 1px solid #eab308;
                  color: #fef08a;
                  padding: 12px 20px;
                  border-radius: 12px;
                  font-size: 12px;
                  display: none;
                  align-items: center;
                  gap: 12px;
                  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
                  backdrop-filter: blur(8px);
                  z-index: 100;
                }
              </style>
            </head>
            <body>
              <div class="toolbar">
                <div class="title-area">
                  <span class="badge">Standalone Pop-out</span>
                  <span class="title">${title || 'Lesson Video'}</span>
                </div>
                <div class="actions">
                  <button id="repair-btn" class="btn btn-repair" onclick="repairVideo()">
                    ⚡ Fix Black Screen (Transcode)
                  </button>
                  <a href="${currentSrc}" download="${downloadFileName || 'video.mp4'}" class="btn btn-secondary">
                    ⬇ Download
                  </a>
                </div>
              </div>
              <div class="player-container">
                <video id="player" src="${currentSrc}" controls autoplay playsinline></video>
                <div id="status-banner">
                  <span id="status-text">Audio playing, but video screen is black? Click Fix Black Screen to convert to universal H.264 MP4.</span>
                  <button class="btn btn-repair" onclick="repairVideo()">⚡ Convert Now</button>
                </div>
              </div>
              <script>
                const video = document.getElementById('player');
                const banner = document.getElementById('status-banner');
                const repairBtn = document.getElementById('repair-btn');
                const statusText = document.getElementById('status-text');

                // Check for audio playing with 0 decoded video frames
                video.addEventListener('timeupdate', () => {
                  if (video.currentTime > 1.2 && !video.paused) {
                    const quality = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : null;
                    const decoded = quality ? quality.totalVideoFrames : video.webkitDecodedFrameCount;
                    if ((typeof decoded === 'number' && decoded === 0) || video.videoWidth === 0) {
                      banner.style.display = 'flex';
                    }
                  }
                });

                async function repairVideo() {
                  repairBtn.disabled = true;
                  repairBtn.innerText = '⏳ Transcoding with FFmpeg...';
                  banner.style.display = 'flex';
                  statusText.innerText = 'Converting video stream into universal H.264 MP4 on server...';

                  try {
                    let blobToSend;
                    const currentUrl = video.src;
                    if (currentUrl.startsWith('blob:') || currentUrl.startsWith('data:') || currentUrl.startsWith('http')) {
                      const res = await fetch(currentUrl);
                      blobToSend = await res.blob();
                    }

                    const transcodeRes = await fetch('/api/transcode-video', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/octet-stream' },
                      body: blobToSend
                    });

                    if (!transcodeRes.ok) {
                      throw new Error('Transcode error: ' + transcodeRes.statusText);
                    }

                    const transcodedBlob = await transcodeRes.blob();
                    const newUrl = URL.createObjectURL(transcodedBlob);
                    const savedTime = video.currentTime;
                    video.src = newUrl;
                    video.currentTime = savedTime;
                    video.play();

                    repairBtn.innerText = '✓ Video Repaired!';
                    repairBtn.style.background = '#059669';
                    banner.style.display = 'none';
                  } catch (err) {
                    console.error(err);
                    repairBtn.disabled = false;
                    repairBtn.innerText = '⚠️ Repair Failed (Retry)';
                    statusText.innerText = 'Failed to transcode: ' + (err.message || 'unknown error');
                  }
                }
              </script>
            </body>
          </html>
        `);
        win.document.close();
      } else {
        window.open(currentSrc, '_blank');
      }
    } catch {
      window.open(currentSrc, '_blank');
    }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = currentSrc;
    a.download = downloadFileName || (title ? `${title}.mp4` : 'lesson_video.mp4');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className={`relative w-full h-full bg-black overflow-hidden group select-none flex items-center justify-center ${className}`}>
      {/* HTML5 Native Video: Directly binds src on video element to guarantee browser decoder initializes */}
      <video
        key={`${currentSrc}_${reloadKey}`}
        ref={videoRef}
        src={currentSrc}
        controls
        playsInline
        preload="auto"
        autoPlay={autoPlay}
        crossOrigin="anonymous"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={onEnded}
        className="w-full h-full object-contain max-h-full max-w-full block bg-black"
      >
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
          {hasRepaired ? (
            <span className="px-2 py-0.5 bg-emerald-950/90 text-emerald-300 text-[10px] font-bold rounded-md border border-emerald-800 flex items-center gap-1 font-mono shadow-xs">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Universal H.264 MP4
            </span>
          ) : videoDimensions && !isAudioOnly ? (
            <span className="px-2 py-0.5 bg-slate-900/80 backdrop-blur-xs text-slate-300 text-[10px] font-semibold rounded-md border border-slate-800 font-mono">
              {videoDimensions.width}x{videoDimensions.height}
              {videoDimensions.height >= 1080 ? ' (1080p)' : videoDimensions.height >= 720 ? ' (720p)' : ''}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* Quick Auto-Repair button directly on top bar if audio only or requested */}
          {(!hasRepaired && (isAudioOnly || showTroubleshootModal)) && (
            <button
              type="button"
              onClick={handleRepairVideo}
              disabled={isTranscoding}
              className="px-2.5 py-1 bg-red-600 hover:bg-red-500 disabled:bg-red-800 text-white rounded text-[10px] font-bold backdrop-blur-xs transition-colors border border-red-400 flex items-center gap-1 shadow-md animate-pulse"
              title="Transcode video with FFmpeg to fix black screen"
            >
              {isTranscoding ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Transcoding...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3" />
                  <span>⚡ Auto-Repair Video</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handleOpenInNewWindow}
            className="px-2 py-1 bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-white rounded text-[10px] font-bold backdrop-blur-xs transition-colors border border-slate-700/50 flex items-center gap-1 shadow-xs"
            title="Open in standalone window with built-in repair tools"
          >
            <ExternalLink className="w-3 h-3" />
            <span className="hidden sm:inline">Pop-out</span>
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="px-2 py-1 bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-white rounded text-[10px] font-bold backdrop-blur-xs transition-colors border border-slate-700/50 flex items-center gap-1 shadow-xs"
            title="Download video file to device"
          >
            <Download className="w-3 h-3" />
            <span className="hidden sm:inline">Download</span>
          </button>
          <button
            type="button"
            onClick={() => setShowTroubleshootModal(prev => !prev)}
            className={`px-2 py-1 rounded text-[10px] font-bold backdrop-blur-xs transition-colors border flex items-center gap-1 shadow-xs ${
              isAudioOnly
                ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-400'
                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700/50'
            }`}
            title="Video diagnostics and black screen assistance"
          >
            <AlertTriangle className="w-3 h-3" />
            <span className="hidden sm:inline">{isAudioOnly ? 'Black Screen' : 'Help'}</span>
          </button>
        </div>
      </div>

      {/* Audio-Only / Undecodable Video Track Notification Overlay */}
      {isAudioOnly && !hasRepaired && (
        <div className="absolute bottom-14 left-4 right-4 bg-slate-900/95 border-2 border-amber-500/70 text-slate-100 p-4 rounded-xl shadow-2xl backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto z-20">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-lg shrink-0 mt-0.5 sm:mt-0">
              <Volume2 className="w-5 h-5 animate-pulse" />
            </div>
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-400 font-mono uppercase tracking-wide">
                  Audio Playing • Black Screen Detected
                </span>
                <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-950 text-amber-300 border border-amber-800">
                  Codec Incompatibility
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                The sound is playing, but your browser cannot decode the video track (common with iPhone HEVC/ProRes or 10-bit HDR video). Click below to transcode to universal H.264 MP4.
              </p>
              {transcodeProgress && (
                <p className="text-[10px] text-emerald-400 font-mono flex items-center gap-1.5 pt-0.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> {transcodeProgress}
                </p>
              )}
              {transcodeError && (
                <p className="text-[10px] text-red-400 font-sans pt-0.5">
                  ⚠️ Error: {transcodeError}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center w-full sm:w-auto justify-end">
            <Button
              type="button"
              size="sm"
              onClick={handleRepairVideo}
              disabled={isTranscoding}
              className="bg-red-600 hover:bg-red-500 disabled:bg-red-800 text-white font-bold text-xs px-3.5 h-8 shadow-md flex items-center gap-1.5"
            >
              {isTranscoding ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Converting...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>⚡ Auto-Repair Video</span>
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOpenInNewWindow}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border-slate-700 font-semibold text-xs px-2.5 h-8"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1" />
              Pop-out
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
                Videos recorded on iPhones, iPads, or modern cameras often default to <span className="text-amber-300 font-mono">Apple HEVC (H.265)</span> or 10-bit HDR formats. Standard web browsers decode the AAC audio smoothly, but cannot render HEVC video frames on non-supported hardware, resulting in a black screen.
              </p>

              <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
                <div className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-red-400" /> One-Click Automatic Fix:
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Our server FFmpeg transcoder will convert this video into universal <strong>H.264 (8-bit YUV420P) + AAC MP4</strong> and save it permanently so everyone on your team can view it immediately.
                </p>
                {transcodeProgress && (
                  <p className="text-[10px] text-emerald-400 font-mono flex items-center gap-1.5 pt-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> {transcodeProgress}
                  </p>
                )}
                {transcodeError && (
                  <p className="text-[10px] text-red-400 font-sans pt-1">
                    ⚠️ Error: {transcodeError}
                  </p>
                )}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-800">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleForceReload}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 text-xs h-8"
              >
                <RefreshCw className="w-3 h-3 mr-1.5" />
                Reload
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleRepairVideo}
                  disabled={isTranscoding}
                  className="bg-red-600 hover:bg-red-500 disabled:bg-red-800 text-white font-bold text-xs h-8 shadow-xs flex items-center gap-1.5"
                >
                  {isTranscoding ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Transcoding...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>⚡ Auto-Repair Video</span>
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleOpenInNewWindow}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 text-xs h-8"
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-1" />
                  Pop-out
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
