// Queue Item Component - Single download item with player
import { invoke } from '@tauri-apps/api/core';
import type { DownloadJob } from '../../api/tauri';
import { useLanguage } from '../../i18n';

interface QueueItemProps {
  job: DownloadJob;
  serviceStyle: { icon: string; color: string; name: string };
  onRemove: (jobId: string) => void;
  onPlay: (filePath: string) => void;
  isPlaying: boolean;
}

export function QueueItem({ job, serviceStyle, onRemove, onPlay, isPlaying }: QueueItemProps) {
  const { t } = useLanguage();

  const handleOpenFile = async () => {
    if (job.status !== 'Complete' || !job.output_path) return;

    try {
      await invoke('open_file_location', { filePath: job.output_path });
    } catch (error) {
      console.error('Failed to open file location:', error);
    }
  };

  const handlePlay = () => {
    if (job.status === 'Complete' && job.output_path) {
      onPlay(job.output_path);
    }
  };

  return (
    <div className={`queue-item ${job.status.toLowerCase()}`}>
      <span className="job-icon" style={{ color: serviceStyle.color }}>
        {serviceStyle.icon}
      </span>

      <div className="job-info">
        <div
          className={`job-title ${job.status === 'Complete' ? 'clickable' : ''}`}
          onClick={job.status === 'Complete' ? handleOpenFile : undefined}
          title={job.status === 'Complete' ? t.download.clickToOpen : undefined}
        >
          {job.metadata?.title || t.common.loading}
        </div>

        <div className="job-artist">
          {job.metadata?.artist !== 'Unknown Artist' ? job.metadata?.artist : ''}
        </div>

        <div className="job-status-row">
          {(job.status === 'Downloading' || job.status === 'Converting') && (
            <div className="job-progress">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${job.progress}%`, backgroundColor: serviceStyle.color }}
                />
              </div>
              <span className="progress-percent">{Math.round(job.progress)}%</span>
            </div>
          )}

          {job.status === 'Queued' && (
            <span className="status-label queued">{t.download.statusQueued}</span>
          )}

          {job.status === 'Complete' && (
            <div className="complete-actions">
              <span className="status-label complete">{t.download.statusComplete}</span>
              <button
                className="player-mini-btn"
                onClick={handlePlay}
                title={isPlaying ? t.download.playing : t.download.play}
              >
                {isPlaying ? '⏸' : '▶️'}
              </button>
            </div>
          )}

          {job.status === 'Error' && (
            <span className="status-label error" title={job.error}>
              {t.download.statusError}
            </span>
          )}
        </div>
      </div>

      {(job.status === 'Queued' || job.status === 'Error') && (
        <button
          className="btn-remove"
          onClick={() => onRemove(job.id)}
          title={t.download.removeFromQueue}
        >
          ×
        </button>
      )}
    </div>
  );
}
