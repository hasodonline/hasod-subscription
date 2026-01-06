/**
 * Download Page
 * Desktop app download page for Hasod Downloads
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface PlatformDownload {
  name: string;
  description: string;
  url: string;
  filename: string;
  size: string;
}

interface DesktopRelease {
  version: string;
  releaseDate: string;
  releaseUrl: string;
  downloads: {
    'macOS-arm64': PlatformDownload;
    'macOS-x64': PlatformDownload;
    'Windows-x64': PlatformDownload;
    'Linux-x64': PlatformDownload;
  };
}

type PlatformKey = keyof DesktopRelease['downloads'];

const platformIcons: Record<PlatformKey, JSX.Element> = {
  'macOS-arm64': (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  ),
  'macOS-x64': (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  ),
  'Windows-x64': (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 5.5L10.5 4.5V11.5H3V5.5ZM3 18.5V12.5H10.5V19.5L3 18.5ZM11.5 4.3L21 3V11.5H11.5V4.3ZM21 12.5V21L11.5 19.7V12.5H21Z"/>
    </svg>
  ),
  'Linux-x64': (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.504 0c-.155 0-.311.002-.465.006-.763.019-1.541.103-2.298.283-.757.18-1.496.46-2.184.844-.687.385-1.328.868-1.889 1.44-.561.573-1.045 1.233-1.426 1.962-.381.729-.661 1.524-.823 2.368-.163.844-.208 1.729-.136 2.617.072.889.264 1.782.567 2.641.303.859.717 1.687 1.228 2.446.512.76 1.12 1.456 1.812 2.051.692.595 1.466 1.088 2.303 1.456.836.368 1.736.611 2.666.71.931.099 1.887.055 2.823-.131.935-.186 1.85-.521 2.702-.993.851-.473 1.639-1.082 2.324-1.803.685-.722 1.27-1.555 1.723-2.466.454-.911.779-1.899.95-2.927.172-1.029.192-2.098.058-3.148-.133-1.049-.42-2.082-.849-3.047-.429-.965-.999-1.862-1.69-2.649-.691-.787-1.502-1.463-2.396-1.994-.894-.531-1.871-.919-2.89-1.133-.51-.107-1.03-.178-1.554-.209-.262-.016-.525-.022-.787-.018zm.26 1.693c.68.005 1.361.073 2.027.206.665.133 1.316.33 1.934.59.618.26 1.204.582 1.741.96.537.379 1.027.813 1.454 1.295.427.482.791 1.01 1.082 1.572.291.563.508 1.16.646 1.777.137.617.194 1.254.17 1.886-.024.632-.13 1.259-.316 1.863-.186.604-.452 1.186-.787 1.727-.336.542-.74 1.044-1.201 1.494-.462.45-.98.846-1.54 1.175-.561.329-1.163.59-1.792.778-.629.188-1.284.3-1.946.334-.662.034-1.33-.01-1.986-.13-.656-.119-1.299-.314-1.912-.58-.613-.267-1.195-.604-1.73-1.003-.535-.4-1.023-.861-1.45-1.375-.427-.514-.793-1.08-1.087-1.683-.294-.604-.516-1.244-.66-1.9-.145-.655-.212-1.326-.2-1.996.013-.67.107-1.337.278-1.984.172-.648.422-1.276.744-1.867.322-.59.714-1.143 1.166-1.642.453-.5.965-.945 1.524-1.325.56-.38 1.165-.694 1.803-.935.638-.241 1.307-.41 1.99-.499.342-.045.686-.069 1.03-.071zm-.334 1.64c-.393.015-.782.072-1.16.17-.378.098-.746.237-1.094.415-.348.179-.677.397-.978.649-.301.251-.576.536-.816.847-.241.311-.446.648-.611 1.003-.165.355-.29.726-.372 1.107-.081.381-.119.77-.112 1.159.007.388.059.776.155 1.151.095.376.233.74.411 1.081.179.341.396.66.648.947.252.288.539.544.853.763.314.219.654.4 1.012.539.358.139.732.234 1.114.284.381.05.769.053 1.151.011.382-.043.759-.132 1.119-.265.36-.133.704-.31 1.022-.524.317-.214.608-.466.866-.748.257-.283.48-.595.663-.93.183-.334.326-.691.427-1.06.1-.37.158-.751.171-1.135.014-.384-.017-.77-.092-1.147-.075-.376-.194-.743-.354-1.091-.16-.348-.361-.677-.597-.978-.236-.3-.507-.572-.806-.808-.299-.236-.625-.436-.969-.594-.344-.158-.705-.274-1.076-.345-.37-.071-.749-.097-1.125-.078z"/>
    </svg>
  ),
};

const Download: React.FC = () => {
  const { currentUser, userDoc } = useAuth();
  const navigate = useNavigate();
  const [release, setRelease] = useState<DesktopRelease | null>(null);
  const [loading, setLoading] = useState(true);

  const hasSubscription =
    userDoc?.services?.['hasod-downloader']?.status === 'active';

  useEffect(() => {
    fetch('/desktop-releases.json')
      .then((res) => res.json())
      .then((data: DesktopRelease) => {
        setRelease(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleDownload = (url: string) => {
    if (url) {
      window.open(url, '_blank');
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (!currentUser) {
    return null;
  }

  const platforms: PlatformKey[] = ['macOS-arm64', 'macOS-x64', 'Windows-x64', 'Linux-x64'];

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
          <div className="version-info">
            <span className="version-badge">
              {loading ? 'Loading...' : `Version ${release?.version || '0.1.0'}`}
            </span>
            {release && (
              <span className="release-date">
                Released {formatDate(release.releaseDate)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="download-section">
        {hasSubscription ? (
          <div className="downloads-grid">
            {platforms.map((platformKey) => {
              const platform = release?.downloads[platformKey];
              const isAvailable = platform?.url && platform.url.length > 0;
              return (
                <div
                  key={platformKey}
                  className={`download-card ${!isAvailable ? 'coming-soon' : ''}`}
                >
                  <div className="platform-info">
                    <div className="platform-icon">
                      {platformIcons[platformKey]}
                    </div>
                    <div className="platform-text">
                      <span className="platform-name">{platform?.name || platformKey}</span>
                      <span className="platform-arch">{platform?.description}</span>
                    </div>
                  </div>
                  {isAvailable ? (
                    <>
                      <button
                        className="download-button"
                        onClick={() => handleDownload(platform.url)}
                      >
                        <svg className="download-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7,10 12,15 17,10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Download
                      </button>
                      <span className="file-info">{platform.size}</span>
                    </>
                  ) : (
                    <div className="coming-soon-badge">Coming Soon</div>
                  )}
                </div>
              );
            })}
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
            <span className="req-label">macOS</span>
            <span className="req-value">10.15 (Catalina) or later</span>
          </div>
          <div className="requirement">
            <span className="req-label">Windows</span>
            <span className="req-value">Windows 10 or later (64-bit)</span>
          </div>
          <div className="requirement">
            <span className="req-label">Linux</span>
            <span className="req-value">Ubuntu 20.04+ / Fedora 35+</span>
          </div>
          <div className="requirement">
            <span className="req-label">Disk Space</span>
            <span className="req-value">~200 MB</span>
          </div>
        </div>
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

        .version-info {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
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

        .release-date {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.5);
        }

        .download-section {
          padding: 0 32px 60px;
          display: flex;
          justify-content: center;
        }

        .downloads-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 24px;
          max-width: 1200px;
          width: 100%;
        }

        .download-card {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 32px;
          text-align: center;
          backdrop-filter: blur(10px);
          transition: all 0.3s ease;
        }

        .download-card:hover {
          background: rgba(255, 255, 255, 0.08);
          transform: translateY(-4px);
        }

        .download-card.coming-soon {
          opacity: 0.6;
        }

        .download-card.coming-soon:hover {
          transform: none;
        }

        .platform-info {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          margin-bottom: 24px;
        }

        .platform-icon {
          width: 40px;
          height: 40px;
          color: #fff;
        }

        .platform-icon svg {
          width: 100%;
          height: 100%;
        }

        .platform-text {
          text-align: left;
        }

        .platform-name {
          display: block;
          font-size: 18px;
          font-weight: 600;
          color: #fff;
        }

        .platform-arch {
          display: block;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.6);
        }

        .download-button {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 12px 32px;
          font-size: 16px;
          font-weight: 600;
          color: #fff;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: none;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
        }

        .download-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 32px rgba(102, 126, 234, 0.5);
        }

        .download-button:active {
          transform: translateY(0);
        }

        .download-icon {
          width: 20px;
          height: 20px;
        }

        .file-info {
          display: block;
          margin-top: 12px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.5);
        }

        .coming-soon-badge {
          display: inline-block;
          padding: 10px 24px;
          font-size: 14px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.5);
          background: rgba(255, 255, 255, 0.05);
          border: 1px dashed rgba(255, 255, 255, 0.2);
          border-radius: 10px;
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
