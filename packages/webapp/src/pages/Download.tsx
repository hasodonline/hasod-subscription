/**
 * Download Page
 * Desktop app download page for Hasod Downloads
 */

import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const Download: React.FC = () => {
  const { currentUser, userDoc } = useAuth();
  const navigate = useNavigate();

  const hasSubscription =
    userDoc?.services?.['hasod-downloader']?.status === 'active';

  const handleDownload = () => {
    window.open('/downloads/HasodDownloads.dmg', '_blank');
  };

  if (!currentUser) {
    return null;
  }

  return (
    <div className="download-page">
      <div className="hero-section">
        <div className="hero-glow"></div>
        <div className="hero-content">
          <div className="app-icon">
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="iconGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#667eea" />
                  <stop offset="100%" stopColor="#764ba2" />
                </linearGradient>
              </defs>
              <rect x="10" y="10" width="80" height="80" rx="18" fill="url(#iconGradient)" />
              <path d="M50 25L50 55M50 55L38 43M50 55L62 43" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M30 65H70" stroke="white" strokeWidth="5" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="title">Hasod Downloads</h1>
          <p className="subtitle">
            Download high-quality music from YouTube, Spotify, SoundCloud & more
          </p>
          <div className="version-badge">Version 0.1.0</div>
        </div>
      </div>

      <div className="download-section">
        {hasSubscription ? (
          <div className="download-card">
            <div className="platform-info">
              <svg className="platform-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              <div className="platform-text">
                <span className="platform-name">macOS</span>
                <span className="platform-arch">Apple Silicon (M1/M2/M3)</span>
              </div>
            </div>
            <button className="download-button" onClick={handleDownload}>
              <svg className="download-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7,10 12,15 17,10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download for Mac
            </button>
            <span className="file-info">DMG installer • ~93 MB</span>
          </div>
        ) : (
          <div className="subscription-card">
            <div className="lock-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h3>Subscription Required</h3>
            <p>Get access to Hasod Downloads with an active subscription</p>
            <button className="subscribe-button" onClick={() => navigate('/subscriptions')}>
              View Plans
            </button>
          </div>
        )}
      </div>

      <div className="features-section">
        <h2>Why Hasod Downloads?</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polygon points="10,8 16,12 10,16" fill="currentColor" />
              </svg>
            </div>
            <h3>Multiple Platforms</h3>
            <p>YouTube, Spotify, SoundCloud, Bandcamp and more</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <h3>High Quality Audio</h3>
            <p>Up to 320kbps MP3 or lossless FLAC</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
            </div>
            <h3>Playlist Support</h3>
            <p>Download entire playlists and albums at once</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <h3>Lightning Fast</h3>
            <p>Native desktop app for maximum performance</p>
          </div>
        </div>
      </div>

      <div className="requirements-section">
        <h2>System Requirements</h2>
        <div className="requirements-card">
          <div className="requirement">
            <span className="req-label">Operating System</span>
            <span className="req-value">macOS 11.0 (Big Sur) or later</span>
          </div>
          <div className="requirement">
            <span className="req-label">Architecture</span>
            <span className="req-value">Apple Silicon (M1, M2, M3)</span>
          </div>
          <div className="requirement">
            <span className="req-label">Disk Space</span>
            <span className="req-value">~200 MB (including dependencies)</span>
          </div>
        </div>
        <p className="coming-soon">Intel Mac & Windows versions coming soon</p>
      </div>

      <style>{`
        .download-page {
          min-height: calc(100vh - 120px);
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
          padding: 0;
          margin: -32px -16px;
        }

        .hero-section {
          position: relative;
          padding: 80px 32px 60px;
          text-align: center;
          overflow: hidden;
        }

        .hero-glow {
          position: absolute;
          top: -50%;
          left: 50%;
          transform: translateX(-50%);
          width: 800px;
          height: 800px;
          background: radial-gradient(circle, rgba(102, 126, 234, 0.3) 0%, transparent 70%);
          pointer-events: none;
        }

        .hero-content {
          position: relative;
          z-index: 1;
        }

        .app-icon {
          width: 120px;
          height: 120px;
          margin: 0 auto 32px;
          filter: drop-shadow(0 20px 40px rgba(102, 126, 234, 0.4));
        }

        .title {
          font-size: 48px;
          font-weight: 700;
          color: #fff;
          margin: 0 0 16px;
          letter-spacing: -1px;
        }

        .subtitle {
          font-size: 20px;
          color: rgba(255, 255, 255, 0.7);
          margin: 0 0 24px;
          max-width: 500px;
          margin-left: auto;
          margin-right: auto;
        }

        .version-badge {
          display: inline-block;
          padding: 6px 16px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          color: rgba(255, 255, 255, 0.8);
          font-size: 14px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .download-section {
          padding: 0 32px 60px;
          display: flex;
          justify-content: center;
        }

        .download-card {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 40px;
          text-align: center;
          backdrop-filter: blur(10px);
          max-width: 400px;
          width: 100%;
        }

        .platform-info {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          margin-bottom: 32px;
        }

        .platform-icon {
          width: 48px;
          height: 48px;
          color: #fff;
        }

        .platform-text {
          text-align: left;
        }

        .platform-name {
          display: block;
          font-size: 24px;
          font-weight: 600;
          color: #fff;
        }

        .platform-arch {
          display: block;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.6);
        }

        .download-button {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          padding: 16px 40px;
          font-size: 18px;
          font-weight: 600;
          color: #fff;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: none;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
        }

        .download-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 15px 40px rgba(102, 126, 234, 0.5);
        }

        .download-button:active {
          transform: translateY(0);
        }

        .download-icon {
          width: 24px;
          height: 24px;
        }

        .file-info {
          display: block;
          margin-top: 16px;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.5);
        }

        .subscription-card {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 48px;
          text-align: center;
          backdrop-filter: blur(10px);
          max-width: 400px;
          width: 100%;
        }

        .lock-icon {
          width: 64px;
          height: 64px;
          margin: 0 auto 24px;
          padding: 16px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 50%;
          color: rgba(255, 255, 255, 0.6);
        }

        .lock-icon svg {
          width: 100%;
          height: 100%;
        }

        .subscription-card h3 {
          font-size: 24px;
          color: #fff;
          margin: 0 0 12px;
        }

        .subscription-card p {
          color: rgba(255, 255, 255, 0.6);
          margin: 0 0 32px;
        }

        .subscribe-button {
          padding: 14px 36px;
          font-size: 16px;
          font-weight: 600;
          color: #667eea;
          background: #fff;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .subscribe-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 30px rgba(255, 255, 255, 0.2);
        }

        .features-section {
          padding: 60px 32px;
          background: rgba(0, 0, 0, 0.2);
        }

        .features-section h2 {
          text-align: center;
          font-size: 32px;
          color: #fff;
          margin: 0 0 48px;
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 24px;
          max-width: 1000px;
          margin: 0 auto;
        }

        .feature-card {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 32px;
          text-align: center;
          transition: all 0.3s ease;
        }

        .feature-card:hover {
          background: rgba(255, 255, 255, 0.08);
          transform: translateY(-4px);
        }

        .feature-icon {
          width: 56px;
          height: 56px;
          margin: 0 auto 20px;
          color: #667eea;
        }

        .feature-icon svg {
          width: 100%;
          height: 100%;
        }

        .feature-card h3 {
          font-size: 18px;
          color: #fff;
          margin: 0 0 8px;
        }

        .feature-card p {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.6);
          margin: 0;
          line-height: 1.5;
        }

        .requirements-section {
          padding: 60px 32px;
          text-align: center;
        }

        .requirements-section h2 {
          font-size: 28px;
          color: #fff;
          margin: 0 0 32px;
        }

        .requirements-card {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 32px;
          max-width: 500px;
          margin: 0 auto 24px;
        }

        .requirement {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .requirement:last-child {
          border-bottom: none;
        }

        .req-label {
          color: rgba(255, 255, 255, 0.6);
          font-size: 14px;
        }

        .req-value {
          color: #fff;
          font-size: 14px;
          font-weight: 500;
        }

        .coming-soon {
          color: rgba(255, 255, 255, 0.4);
          font-size: 14px;
          font-style: italic;
        }

        @media (max-width: 768px) {
          .hero-section {
            padding: 60px 24px 40px;
          }

          .title {
            font-size: 36px;
          }

          .subtitle {
            font-size: 16px;
          }

          .download-section {
            padding: 0 24px 40px;
          }

          .download-card,
          .subscription-card {
            padding: 32px 24px;
          }

          .features-section,
          .requirements-section {
            padding: 40px 24px;
          }

          .requirement {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
          }
        }
      `}</style>
    </div>
  );
};

export default Download;
