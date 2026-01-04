/**
 * Download Form Component
 * URL input form for submitting download jobs
 */

import React, { useState } from 'react';
import { isValidDownloadUrl, detectPlatform } from '../api/download.api';

interface DownloadFormProps {
  onSubmit: (url: string, transliterate: boolean) => void;
  disabled?: boolean;
}

const DownloadForm: React.FC<DownloadFormProps> = ({ onSubmit, disabled = false }) => {
  const [url, setUrl] = useState('');
  const [transliterate, setTransliterate] = useState(false);
  const [error, setError] = useState('');

  const detectedPlatform = url ? detectPlatform(url) : null;
  const isValid = url ? isValidDownloadUrl(url) : false;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    if (!isValid) {
      setError('Invalid or unsupported URL. Please use YouTube, Spotify, SoundCloud, or Bandcamp links.');
      return;
    }

    setError('');
    onSubmit(url.trim(), transliterate);
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    setError('');
  };

  return (
    <div className="download-form">
      <form onSubmit={handleSubmit} className="form-container">
        <div className="form-group">
          <label htmlFor="url-input" className="form-label">
            Paste Music URL
          </label>
          <div className="input-with-platform">
            <input
              id="url-input"
              type="text"
              value={url}
              onChange={handleUrlChange}
              placeholder="https://open.spotify.com/track/... or https://youtube.com/watch?v=..."
              className="form-input"
              disabled={disabled}
            />
            {detectedPlatform && detectedPlatform !== 'Unknown' && (
              <span className={`platform-badge platform-${detectedPlatform.toLowerCase()}`}>
                {detectedPlatform}
              </span>
            )}
          </div>
          {error && <p className="error-message">{error}</p>}
          {url && !isValid && !error && (
            <p className="warning-message">
              This URL may not be supported. Supported platforms: YouTube, Spotify, SoundCloud, Bandcamp
            </p>
          )}
        </div>

        <div className="form-group checkbox-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={transliterate}
              onChange={(e) => setTransliterate(e.target.checked)}
              disabled={disabled}
            />
            <span>Transliterate Hebrew filenames to English</span>
          </label>
        </div>

        <button
          type="submit"
          className="submit-button"
          disabled={disabled || !url || !isValid}
        >
          {disabled ? 'Processing...' : 'Download'}
        </button>
      </form>

      <style jsx>{`
        .download-form {
          background: white;
          border-radius: 8px;
          padding: 24px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          margin-bottom: 24px;
        }

        .form-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-label {
          font-weight: 600;
          font-size: 14px;
          color: #333;
        }

        .input-with-platform {
          position: relative;
          display: flex;
          align-items: center;
        }

        .form-input {
          flex: 1;
          padding: 12px 16px;
          border: 2px solid #e0e0e0;
          border-radius: 6px;
          font-size: 14px;
          transition: border-color 0.2s;
        }

        .form-input:focus {
          outline: none;
          border-color: #4285f4;
        }

        .form-input:disabled {
          background-color: #f5f5f5;
          cursor: not-allowed;
        }

        .platform-badge {
          position: absolute;
          right: 12px;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          pointer-events: none;
        }

        .platform-youtube {
          background-color: #ff0000;
          color: white;
        }

        .platform-spotify {
          background-color: #1db954;
          color: white;
        }

        .platform-soundcloud {
          background-color: #ff7700;
          color: white;
        }

        .platform-bandcamp {
          background-color: #629aa9;
          color: white;
        }

        .checkbox-group {
          flex-direction: row;
          align-items: center;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-size: 14px;
          color: #666;
        }

        .checkbox-label input[type="checkbox"] {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .submit-button {
          padding: 12px 24px;
          background-color: #4285f4;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .submit-button:hover:not(:disabled) {
          background-color: #357ae8;
        }

        .submit-button:disabled {
          background-color: #ccc;
          cursor: not-allowed;
        }

        .error-message {
          color: #d32f2f;
          font-size: 13px;
          margin: 0;
        }

        .warning-message {
          color: #f57c00;
          font-size: 13px;
          margin: 0;
        }
      `}</style>
    </div>
  );
};

export default DownloadForm;
