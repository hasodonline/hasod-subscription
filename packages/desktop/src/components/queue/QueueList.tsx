// Queue List Component - Shows queue with stats and controls
import { useState } from 'react';
import type { QueueStatus } from '../../api/tauri';
import { useLanguage } from '../../i18n';
import { QueueItem } from './QueueItem';
import { AudioPlayer } from '../AudioPlayer';

interface QueueListProps {
  queueStatus: QueueStatus;
  serviceStyles: Record<string, { icon: string; color: string; name: string }>;
  onRemove: (jobId: string) => void;
  onClearCompleted: () => void;
  onClearAll: () => void;
}

export function QueueList({
  queueStatus,
  serviceStyles,
  onRemove,
  onClearCompleted,
  onClearAll,
}: QueueListProps) {
  const { t } = useLanguage();
  const [currentAudioPath, setCurrentAudioPath] = useState<string | null>(null);

  const handlePlay = (filePath: string) => {
    if (currentAudioPath === filePath) {
      setCurrentAudioPath(null); // Stop if already playing
    } else {
      setCurrentAudioPath(filePath); // Play new file
    }
  };

  const handleClearAll = () => {
    if (window.confirm(t.download.confirmClearAll || 'Clear all items from queue?')) {
      onClearAll();
      setCurrentAudioPath(null);
    }
  };

  return (
    <div className="queue-section">
      <div className="queue-header">
        <h3>{t.download.queueTitle}</h3>

        <div className="queue-stats">
          {queueStatus.active_count > 0 && (
            <span className="stat downloading">
              {queueStatus.active_count} {t.download.downloading}
            </span>
          )}
          {queueStatus.queued_count > 0 && (
            <span className="stat queued">
              {queueStatus.queued_count} {t.download.waiting}
            </span>
          )}
          {queueStatus.completed_count > 0 && (
            <span className="stat completed">
              {queueStatus.completed_count} {t.download.done}
            </span>
          )}
          {queueStatus.error_count > 0 && (
            <span className="stat error">
              {queueStatus.error_count} {t.download.failed}
            </span>
          )}
        </div>

        <div className="queue-actions">
          {queueStatus.completed_count > 0 && (
            <button className="btn-clear" onClick={onClearCompleted}>
              {t.download.clearCompleted}
            </button>
          )}
          {queueStatus.jobs.length > 0 && (
            <button className="btn-clear-all" onClick={handleClearAll}>
              {t.download.clearAll || 'Clear All'}
            </button>
          )}
        </div>
      </div>

      <div className="queue-list">
        {queueStatus.jobs.map(job => {
          const style = serviceStyles[job.service] || serviceStyles.Unknown;
          return (
            <QueueItem
              key={job.id}
              job={job}
              serviceStyle={style}
              onRemove={onRemove}
              onPlay={handlePlay}
              isPlaying={currentAudioPath === job.output_path}
            />
          );
        })}
      </div>

      {currentAudioPath && (
        <AudioPlayer
          filePath={currentAudioPath}
          onClose={() => setCurrentAudioPath(null)}
        />
      )}
    </div>
  );
}
