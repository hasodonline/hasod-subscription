/**
 * Download Progress Component
 * Displays real-time download progress
 */

import React from 'react';
import type { DownloadJob } from '../types/download';
import { detectPlatform } from '../api/download.api';

interface DownloadProgressProps {
  job: DownloadJob;
  onCancel?: () => void;
}

const DownloadProgress: React.FC<DownloadProgressProps> = ({ job, onCancel }) => {
  const platform = detectPlatform(job.url);
  const isActive = job.status === 'downloading' || job.status === 'processing';

  return (
    <div className="download-progress">
      <div className="progress-header">
        <div className="progress-title">
          <span className={`platform-badge platform-${platform.toLowerCase()}`}>
            {platform}
          </span>
          <span className="job-message">{job.message}</span>
        </div>
        {onCancel && isActive && (
          <button onClick={onCancel} className="cancel-button">
            Cancel
          </button>
        )}
      </div>

      {job.metadata.title && (
        <div className="track-info">
          <p className="track-title">{job.metadata.title}</p>
          {job.metadata.artist && (
            <p className="track-artist">{job.metadata.artist}</p>
          )}
          {job.metadata.album && job.type === 'album' && (
            <p className="track-album">
              Album: {job.metadata.album}
              {job.metadata.trackCount && ` (${job.metadata.trackCount} tracks)`}
            </p>
          )}
        </div>
      )}

      <div className="progress-bar-container">
        <div
          className="progress-bar"
          style={{ width: `${job.progress}%` }}
        />
      </div>

      <div className="progress-footer">
        <span className="progress-percentage">{job.progress.toFixed(0)}%</span>
        <span className={`status-badge status-${job.status}`}>
          {job.status}
        </span>
      </div>

      <style jsx>{`
        .download-progress {
          background: white;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          margin-bottom: 16px;
        }

        .progress-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .progress-title {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
        }

        .platform-badge {
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          color: white;
        }

        .platform-youtube {
          background-color: #ff0000;
        }

        .platform-spotify {
          background-color: #1db954;
        }

        .platform-soundcloud {
          background-color: #ff7700;
        }

        .platform-bandcamp {
          background-color: #629aa9;
        }

        .platform-unknown {
          background-color: #666;
        }

        .job-message {
          font-size: 14px;
          color: #666;
        }

        .cancel-button {
          padding: 6px 16px;
          background-color: #f44336;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .cancel-button:hover {
          background-color: #d32f2f;
        }

        .track-info {
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid #e0e0e0;
        }

        .track-title {
          font-size: 16px;
          font-weight: 600;
          color: #333;
          margin: 0 0 4px 0;
        }

        .track-artist {
          font-size: 14px;
          color: #666;
          margin: 0 0 4px 0;
        }

        .track-album {
          font-size: 13px;
          color: #999;
          margin: 0;
        }

        .progress-bar-container {
          width: 100%;
          height: 8px;
          background-color: #e0e0e0;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 12px;
        }

        .progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #4285f4 0%, #357ae8 100%);
          transition: width 0.3s ease;
          border-radius: 4px;
        }

        .progress-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .progress-percentage {
          font-size: 14px;
          font-weight: 600;
          color: #666;
        }

        .status-badge {
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          text-transform: capitalize;
        }

        .status-queued {
          background-color: #f5f5f5;
          color: #666;
        }

        .status-downloading {
          background-color: #e3f2fd;
          color: #1976d2;
        }

        .status-processing {
          background-color: #fff3e0;
          color: #f57c00;
        }

        .status-complete {
          background-color: #e8f5e9;
          color: #388e3c;
        }

        .status-error {
          background-color: #ffebee;
          color: #d32f2f;
        }
      `}</style>
    </div>
  );
};

export default DownloadProgress;
