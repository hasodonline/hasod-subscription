/**
 * Download Result Component
 * Displays completed download with download button
 */

import React, { useState, useEffect } from 'react';
import type { DownloadJob } from '../types/download';
import { detectPlatform, formatFileSize, getTimeRemaining } from '../api/download.api';

interface DownloadResultProps {
  job: DownloadJob;
  onDelete?: () => void;
}

const DownloadResult: React.FC<DownloadResultProps> = ({ job, onDelete }) => {
  const platform = detectPlatform(job.url);
  const [timeRemaining, setTimeRemaining] = useState('');

  // Update time remaining every minute
  useEffect(() => {
    const updateTime = () => {
      if (job.expiresAt) {
        setTimeRemaining(getTimeRemaining(job.expiresAt));
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [job.expiresAt]);

  const isExpired = timeRemaining === 'Expired' || !job.downloadUrl;
  const totalSize = job.files.reduce((sum, file) => sum + file.size, 0);

  return (
    <div className={`download-result ${isExpired ? 'expired' : ''}`}>
      <div className="result-header">
        <div className="result-title">
          <span className={`platform-badge platform-${platform.toLowerCase()}`}>
            {platform}
          </span>
          <div className="title-content">
            <h3>{job.metadata.title || 'Download Complete'}</h3>
            {job.metadata.artist && (
              <p className="artist">{job.metadata.artist}</p>
            )}
          </div>
        </div>
        {onDelete && (
          <button onClick={onDelete} className="delete-button" title="Delete">
            🗑️
          </button>
        )}
      </div>

      {job.error ? (
        <div className="error-box">
          <strong>Error:</strong> {job.error}
        </div>
      ) : (
        <>
          <div className="result-info">
            <div className="info-item">
              <span className="info-label">Files:</span>
              <span className="info-value">
                {job.files.length} file{job.files.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">Size:</span>
              <span className="info-value">{formatFileSize(totalSize)}</span>
            </div>
            {job.type === 'album' && job.metadata.trackCount && (
              <div className="info-item">
                <span className="info-label">Tracks:</span>
                <span className="info-value">{job.metadata.trackCount}</span>
              </div>
            )}
            {timeRemaining && (
              <div className="info-item">
                <span className="info-label">Expires:</span>
                <span className={`info-value ${isExpired ? 'expired-text' : ''}`}>
                  {timeRemaining}
                </span>
              </div>
            )}
          </div>

          {job.downloadUrl && !isExpired ? (
            <a
              href={job.downloadUrl}
              download
              className="download-button"
              target="_blank"
              rel="noopener noreferrer"
            >
              📥 Download Now
            </a>
          ) : (
            <div className="expired-message">
              This download has expired and is no longer available.
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .download-result {
          background: white;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          margin-bottom: 16px;
          transition: opacity 0.3s;
        }

        .download-result.expired {
          opacity: 0.6;
        }

        .result-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 16px;
        }

        .result-title {
          display: flex;
          gap: 12px;
          flex: 1;
        }

        .platform-badge {
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          color: white;
          flex-shrink: 0;
          height: fit-content;
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

        .title-content {
          flex: 1;
        }

        .title-content h3 {
          margin: 0 0 4px 0;
          font-size: 16px;
          color: #333;
        }

        .artist {
          margin: 0;
          font-size: 14px;
          color: #666;
        }

        .delete-button {
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
          padding: 4px 8px;
          opacity: 0.6;
          transition: opacity 0.2s;
        }

        .delete-button:hover {
          opacity: 1;
        }

        .error-box {
          padding: 12px;
          background-color: #ffebee;
          border-left: 4px solid #f44336;
          border-radius: 4px;
          color: #d32f2f;
          font-size: 14px;
        }

        .result-info {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 12px;
          margin-bottom: 16px;
          padding: 12px;
          background-color: #f5f5f5;
          border-radius: 6px;
        }

        .info-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .info-label {
          font-size: 12px;
          color: #999;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .info-value {
          font-size: 14px;
          font-weight: 600;
          color: #333;
        }

        .expired-text {
          color: #d32f2f;
        }

        .download-button {
          display: block;
          width: 100%;
          padding: 12px 24px;
          background-color: #4caf50;
          color: white;
          text-align: center;
          text-decoration: none;
          border-radius: 6px;
          font-size: 16px;
          font-weight: 600;
          transition: background-color 0.2s;
        }

        .download-button:hover {
          background-color: #388e3c;
        }

        .expired-message {
          padding: 12px;
          background-color: #fff3e0;
          border-left: 4px solid #ff9800;
          border-radius: 4px;
          color: #f57c00;
          font-size: 14px;
          text-align: center;
        }
      `}</style>
    </div>
  );
};

export default DownloadResult;
