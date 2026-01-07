import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useLanguage } from './i18n';
import './FloatingButton.css';

// Types matching Rust backend
interface TrackMetadata {
  title: string;
  artist: string;
  album: string;
  duration?: number;
  thumbnail?: string;
}

interface DownloadJob {
  id: string;
  url: string;
  service: string;
  status: string;
  progress: number;
  message: string;
  metadata: TrackMetadata;
  output_path?: string;
  created_at: number;
  started_at?: number;
  completed_at?: number;
  error?: string;
}

interface QueueStatus {
  jobs: DownloadJob[];
  active_count: number;
  queued_count: number;
  completed_count: number;
  error_count: number;
  is_processing: boolean;
}

// Service icons and colors
const serviceStyles: Record<string, { icon: string; gradient: string }> = {
  YouTube: { icon: '🎬', gradient: 'linear-gradient(135deg, #FF0000 0%, #CC0000 100%)' },
  Spotify: { icon: '🟢', gradient: 'linear-gradient(135deg, #1DB954 0%, #1AA34A 100%)' },
  SoundCloud: { icon: '🟠', gradient: 'linear-gradient(135deg, #FF5500 0%, #FF3300 100%)' },
  Deezer: { icon: '🟣', gradient: 'linear-gradient(135deg, #A238FF 0%, #8B00FF 100%)' },
  Tidal: { icon: '🔵', gradient: 'linear-gradient(135deg, #00FFFF 0%, #0080FF 100%)' },
  AppleMusic: { icon: '🍎', gradient: 'linear-gradient(135deg, #FA2D48 0%, #A71D31 100%)' },
  Bandcamp: { icon: '🎵', gradient: 'linear-gradient(135deg, #629AA9 0%, #1DA0C3 100%)' },
  Unknown: { icon: '❓', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
};

// Helper to extract first URI from text/uri-list format
function firstUriFromUriList(uriList: string): string {
  const lines = uriList.split(/\r?\n/).map(l => l.trim());
  return lines.find(l => l && !l.startsWith("#")) ?? "";
}

// Check if a string looks like a URL or Spotify URI
function isValidUrl(str: string): boolean {
  return (
    str.startsWith('http://') ||
    str.startsWith('https://') ||
    str.startsWith('spotify:')
  );
}

// Detect service from URL (used for display purposes)
function _detectService(url: string): string {
  const urlLower = url.toLowerCase();
  if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be') || urlLower.includes('music.youtube.com')) return 'YouTube';
  if (urlLower.includes('spotify.com') || urlLower.startsWith('spotify:')) return 'Spotify';
  if (urlLower.includes('soundcloud.com')) return 'SoundCloud';
  if (urlLower.includes('deezer.com')) return 'Deezer';
  if (urlLower.includes('tidal.com')) return 'Tidal';
  if (urlLower.includes('music.apple.com')) return 'AppleMusic';
  if (urlLower.includes('bandcamp.com')) return 'Bandcamp';
  return 'Unknown';
}
void _detectService; // Suppress unused warning

function FloatingButton() {
  const { t } = useLanguage();
  const [isDragOver, setIsDragOver] = useState(false);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [recentlyAdded, setRecentlyAdded] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Get current downloading job
  const currentJob = queueStatus?.jobs.find(j => j.status === 'Downloading' || j.status === 'Converting');
  const queuedCount = queueStatus?.queued_count ?? 0;
  const _isProcessing = queueStatus?.is_processing ?? false;
  void _isProcessing; // Available for future use

  // Determine button state
  const getButtonState = () => {
    if (isDragOver) return 'drag-over';
    if (currentJob) return 'downloading';
    if (queuedCount > 0) return 'queued';
    return 'idle';
  };

  useEffect(() => {
    // Load initial queue status
    invoke<QueueStatus>('get_queue_status').then(setQueueStatus).catch(console.error);

    // Listen to queue updates
    const unlistenQueue = listen<QueueStatus>('queue-update', (event) => {
      if (event.payload) {
        setQueueStatus(event.payload);
      }
    });

    // HTML5 Drag & Drop handlers
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
      if (!isDragOver) {
        setIsDragOver(true);
      }
    };

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.relatedTarget === null ||
          (e.target === document.documentElement && !document.documentElement.contains(e.relatedTarget as Node))) {
        setIsDragOver(false);
      }
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const dt = e.dataTransfer;
      if (!dt) return;

      // Try to get URL from different formats
      const uriList = dt.getData('text/uri-list');
      const textPlain = dt.getData('text/plain');
      const urlData = dt.getData('URL');

      let url = '';
      if (uriList) {
        url = firstUriFromUriList(uriList);
      } else if (textPlain) {
        url = textPlain.trim();
      } else if (urlData) {
        url = urlData.trim();
      }

      url = url.split('\n')[0].trim();

      if (url && isValidUrl(url)) {
        try {
          const normalizedUrl = await invoke<string>('handle_dropped_link', { url });
          await addToQueue(normalizedUrl);
        } catch (error) {
          await addToQueue(url);
        }
      }
    };

    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);

    return () => {
      unlistenQueue.then(fn => fn());
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('drop', handleDrop);
    };
  }, [isDragOver]);

  const addToQueue = async (url: string) => {
    try {
      const job = await invoke<DownloadJob>('add_to_queue', { url });
      setRecentlyAdded(job.service);
      setTimeout(() => setRecentlyAdded(null), 1500);

      // Start processing if not already
      invoke('start_queue_processing').catch(console.error);

      // Refresh status
      const status = await invoke<QueueStatus>('get_queue_status');
      setQueueStatus(status);
    } catch (error) {
      console.error('Failed to add to queue:', error);
    }
  };

  const handleClose = async () => {
    const appWindow = getCurrentWindow();
    await appWindow.close();
  };

  const handleClick = async () => {
    if (showPanel) {
      setShowPanel(false);
      return;
    }

    try {
      const url = await invoke<string>('get_clipboard_url');
      await addToQueue(url);
    } catch (error) {
      // No URL in clipboard, show panel instead
      setShowPanel(true);
    }
  };

  const handleMouseDown = async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.close-btn') || target.closest('.floating-button') || target.closest('.queue-panel')) {
      return;
    }
    setIsDragging(true);
    try {
      await getCurrentWindow().startDragging();
    } catch (error) {
      console.error('Failed to start dragging:', error);
    }
    setIsDragging(false);
  };

  const buttonState = getButtonState();
  const serviceStyle = currentJob ? serviceStyles[currentJob.service] || serviceStyles.Unknown : serviceStyles.Unknown;

  return (
    <div
      ref={dropZoneRef}
      className={`floating-container ${buttonState} ${isDragging ? 'dragging' : ''} ${showPanel ? 'expanded' : ''}`}
      onMouseDown={handleMouseDown}
    >
      <button className="close-btn" onClick={handleClose}>×</button>

      {/* Main circular button */}
      <div
        className={`floating-button ${recentlyAdded ? 'success-flash' : ''}`}
        onClick={handleClick}
        style={currentJob ? { '--service-gradient': serviceStyle.gradient } as React.CSSProperties : undefined}
      >
        <div className="button-inner">
          {currentJob ? (
            <>
              {/* Progress ring */}
              <svg className="progress-ring" viewBox="0 0 100 100">
                <circle className="progress-ring-bg" cx="50" cy="50" r="42" />
                <circle
                  className="progress-ring-fill"
                  cx="50" cy="50" r="42"
                  style={{ strokeDashoffset: 264 - (264 * currentJob.progress / 100) }}
                />
              </svg>
              <div className="service-icon">{serviceStyle.icon}</div>
              <div className="progress-text">{Math.round(currentJob.progress)}%</div>
            </>
          ) : queuedCount > 0 ? (
            <>
              <div className="queue-count">{queuedCount}</div>
              <div className="queue-label">{t.floating.inQueue}</div>
            </>
          ) : recentlyAdded ? (
            <div className="success-icon">✓</div>
          ) : (
            <svg viewBox="0 0 24 24" className="download-icon">
              <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14l-4-4h3V8h2v4h3l-4 4z"/>
            </svg>
          )}
        </div>

        {/* Animated rings */}
        <div className="pulse-ring"></div>
        <div className="pulse-ring delay"></div>
        {currentJob && <div className="pulse-ring fast"></div>}
      </div>

      {/* Status tooltip */}
      {(isDragOver || currentJob || queuedCount > 0) && (
        <div className="tooltip">
          {isDragOver ? (
            t.floating.dropUrlHere
          ) : currentJob ? (
            <span className="tooltip-content">
              <span className="tooltip-icon">{serviceStyle.icon}</span>
              <span className="tooltip-text">{currentJob.metadata?.title || t.download.statusDownloading}</span>
            </span>
          ) : queuedCount > 0 ? (
            `${queuedCount} ${t.floating.waiting}`
          ) : null}
        </div>
      )}

      {/* Expanded queue panel */}
      {showPanel && queueStatus && (
        <div className="queue-panel">
          <div className="panel-header">
            <span>{t.floating.downloadQueue}</span>
            <button className="panel-close" onClick={() => setShowPanel(false)}>×</button>
          </div>
          <div className="panel-content">
            {queueStatus.jobs.length === 0 ? (
              <div className="empty-queue">
                <div className="empty-icon">📥</div>
                <div className="empty-text">{t.floating.dropOrClick}</div>
              </div>
            ) : (
              <div className="queue-list">
                {queueStatus.jobs.slice(0, 5).map(job => (
                  <div key={job.id} className={`queue-item ${job.status.toLowerCase()}`}>
                    <span className="item-icon">{serviceStyles[job.service]?.icon || '❓'}</span>
                    <div className="item-info">
                      <div className="item-title">{job.metadata?.title || t.common.loading}</div>
                      <div className="item-status">
                        {job.status === 'Downloading' && (
                          <div className="mini-progress">
                            <div className="mini-progress-fill" style={{ width: `${job.progress}%` }} />
                          </div>
                        )}
                        {job.status === 'Converting' && <span className="status-converting">{t.floating.converting}</span>}
                        {job.status === 'Complete' && <span className="status-complete">✓ {t.floating.done}</span>}
                        {job.status === 'Queued' && <span className="status-queued">{t.floating.waiting}</span>}
                        {job.status === 'Error' && <span className="status-error">✗ {t.floating.error}</span>}
                      </div>
                    </div>
                  </div>
                ))}
                {queueStatus.jobs.length > 5 && (
                  <div className="queue-more">+{queueStatus.jobs.length - 5} {t.floating.more}</div>
                )}
              </div>
            )}
          </div>
          {queueStatus.completed_count > 0 && (
            <button
              className="clear-btn"
              onClick={() => invoke('clear_completed_jobs').then(() => invoke<QueueStatus>('get_queue_status').then(setQueueStatus))}
            >
              {t.floating.clearCompleted} ({queueStatus.completed_count})
            </button>
          )}
        </div>
      )}

      <div className="supported-services">
        <span title="YouTube">🎬</span>
        <span title="Spotify">🟢</span>
        <span title="SoundCloud">🟠</span>
        <span title="Bandcamp">🎵</span>
      </div>
    </div>
  );
}

export default FloatingButton;
