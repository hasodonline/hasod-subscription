// Download Tab Component - Main download interface
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { QueueStatus } from '../../api/tauri';
import { useLanguage } from '../../i18n';
import { QueueList } from '../queue/QueueList';

interface DownloadTabProps {
  isLicenseValid: boolean;
  queueStatus: QueueStatus | null;
  onAddToQueue: (url: string) => Promise<void>;
  onRemoveJob: (jobId: string) => void;
  onClearCompleted: () => void;
  onClearAll: () => void;
}

// Service icons and colors
const serviceStyles: Record<string, { icon: string; color: string; name: string }> = {
  YouTube: { icon: '🎬', color: '#FF0000', name: 'YouTube' },
  Spotify: { icon: '🟢', color: '#1DB954', name: 'Spotify' },
  SoundCloud: { icon: '🟠', color: '#FF5500', name: 'SoundCloud' },
  Deezer: { icon: '🟣', color: '#A238FF', name: 'Deezer' },
  Tidal: { icon: '🔵', color: '#00FFFF', name: 'Tidal' },
  AppleMusic: { icon: '🍎', color: '#FA2D48', name: 'Apple Music' },
  Bandcamp: { icon: '🎵', color: '#629AA9', name: 'Bandcamp' },
  Unknown: { icon: '❓', color: '#667eea', name: 'Unknown' },
};

export function DownloadTab({
  isLicenseValid,
  queueStatus,
  onAddToQueue,
  onRemoveJob,
  onClearCompleted,
  onClearAll,
}: DownloadTabProps) {
  const { t } = useLanguage();
  const [downloadUrl, setDownloadUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [englishOnlyMode, setEnglishOnlyMode] = useState(false);

  // Load English Only mode on mount
  useEffect(() => {
    invoke<boolean>('get_english_only_mode')
      .then(setEnglishOnlyMode)
      .catch(console.error);
  }, []);

  const handleToggleEnglishOnly = async () => {
    const newValue = !englishOnlyMode;
    try {
      await invoke('set_english_only_mode', { enabled: newValue });
      setEnglishOnlyMode(newValue);
    } catch (error) {
      console.error('Failed to toggle English Only mode:', error);
    }
  };

  const handleAddToQueue = async () => {
    if (!downloadUrl.trim()) {
      alert(t.common.pleaseEnterUrl);
      return;
    }

    if (!isLicenseValid) {
      alert(t.common.licenseNotValid);
      return;
    }

    setAdding(true);
    try {
      await onAddToQueue(downloadUrl);
      setDownloadUrl('');
    } catch (error) {
      console.error('Failed to add to queue:', error);
      alert(t.common.failedToAddToQueue + ' ' + error);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="download-tab">
      {!isLicenseValid && (
        <div className="warning-box">
          {t.download.licenseWarning}
        </div>
      )}

      {/* Sticky header area - stays on top when scrolling */}
      <div className="download-sticky-header">
        {/* URL Input */}
        <div className="download-form">
          <input
            type="text"
            value={downloadUrl}
            onChange={(e) => setDownloadUrl(e.target.value)}
            placeholder={t.download.urlPlaceholder}
            className="url-input"
            disabled={!isLicenseValid || adding}
            onKeyDown={(e) => e.key === 'Enter' && handleAddToQueue()}
          />
          <button
            onClick={handleAddToQueue}
            disabled={!isLicenseValid || !downloadUrl.trim() || adding}
            className="btn-download"
          >
            {adding ? t.common.loading + '...' : t.download.addToQueue}
          </button>
        </div>

        {/* Supported Services - Compact */}
        <div className="services-compact">
          {Object.entries(serviceStyles).slice(0, 7).map(([key, style]) => (
            <span key={key} className="service-icon-small" title={style.name}>
              {style.icon}
            </span>
          ))}
        </div>
      </div>

      {/* Queue Status */}
      {queueStatus && queueStatus.jobs.length > 0 && (
        <QueueList
          queueStatus={queueStatus}
          serviceStyles={serviceStyles}
          onRemove={onRemoveJob}
          onClearCompleted={onClearCompleted}
          onClearAll={onClearAll}
        />
      )}

      {/* Save location info */}
      {queueStatus && queueStatus.completed_count > 0 && (
        <p className="note">{t.download.saveLocation}</p>
      )}
    </div>
  );
}
