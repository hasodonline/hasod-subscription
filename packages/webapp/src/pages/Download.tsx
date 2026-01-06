import { useEffect, useState } from 'react';

interface DownloadInfo {
  name: string;
  description: string;
  url: string;
  filename: string;
  size: string;
}

interface ReleaseManifest {
  version: string;
  releaseDate: string;
  releaseUrl: string;
  downloads: {
    'macOS-arm64': DownloadInfo;
    'macOS-x64': DownloadInfo;
    'Windows-x64': DownloadInfo;
  };
}

export default function Download() {
  const [manifest, setManifest] = useState<ReleaseManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/desktop-releases.json')
      .then(res => res.json())
      .then(data => {
        setManifest(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load release manifest:', err);
        setError('Failed to load downloads');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="download-page">
        <h2>Hasod Downloads</h2>
        <p>Loading...</p>
      </div>
    );
  }

  if (error || !manifest) {
    return (
      <div className="download-page">
        <h2>Hasod Downloads</h2>
        <p>{error || 'Failed to load downloads'}</p>
      </div>
    );
  }

  const platforms = [
    { key: 'macOS-arm64', icon: '🍎', platform: 'macOS' },
    { key: 'macOS-x64', icon: '🍎', platform: 'macOS' },
    { key: 'Windows-x64', icon: '🪟', platform: 'Windows' },
  ] as const;

  return (
    <div className="download-page">
      <h2>Hasod Downloads</h2>
      <p className="version-info">
        Version {manifest.version} • Released {new Date(manifest.releaseDate).toLocaleDateString()}
      </p>

      <div className="download-grid">
        {platforms.map(({ key, icon }) => {
          const download = manifest.downloads[key];
          if (!download || !download.url) return null;

          return (
            <div key={key} className="download-card">
              <div className="download-icon">{icon}</div>
              <h3>{download.name}</h3>
              <p>{download.description}</p>
              <p className="download-size">{download.size}</p>
              <a
                href={download.url}
                className="download-button"
                download
              >
                Download
              </a>
            </div>
          );
        })}
      </div>

      <div className="download-requirements">
        <h3>Requirements</h3>
        <ul>
          <li>Active Hasod Downloader subscription</li>
          <li>macOS 10.15+ or Windows 10+</li>
        </ul>
      </div>

      <div className="macos-note">
        <h3>macOS - App Won't Open?</h3>
        <p>If you see "app is damaged" or "unidentified developer" - choose one of these fixes:</p>

        <div className="fix-option">
          <h4>Option 1: System Settings (Easiest)</h4>
          <ol>
            <li>Try to open the app - you'll see an error, click <strong>Done</strong></li>
            <li>Click the Apple menu  → <strong>System Settings</strong></li>
            <li>Click <strong>Privacy & Security</strong> in the sidebar</li>
            <li>Scroll down until you see "Hasod Downloads was blocked"</li>
            <li>Click <strong>Open Anyway</strong></li>
            <li>Enter your Mac password if asked</li>
            <li>Click <strong>Open</strong> to confirm</li>
          </ol>
        </div>

        <div className="fix-option">
          <h4>Option 2: Terminal Command (Faster)</h4>
          <ol>
            <li>Press <strong>Cmd + Space</strong> and type <strong>Terminal</strong>, press Enter</li>
            <li>Click the green box below to copy the command:</li>
          </ol>
          <code className="terminal-command" onClick={(e) => {
            navigator.clipboard.writeText('xattr -cr "/Applications/Hasod Downloads.app"');
            const el = e.target as HTMLElement;
            el.classList.add('copied');
            setTimeout(() => el.classList.remove('copied'), 2000);
          }}>
            xattr -cr "/Applications/Hasod Downloads.app"
          </code>
          <p className="click-hint">Click to copy</p>
          <ol start={3}>
            <li>In Terminal, press <strong>Cmd + V</strong> to paste, then press <strong>Enter</strong></li>
            <li>Close Terminal and open the app - it will work now!</li>
          </ol>
        </div>
      </div>

      <p className="release-link">
        <a href={manifest.releaseUrl} target="_blank" rel="noopener noreferrer">
          View all releases on GitHub
        </a>
      </p>

      <style>{`
        .download-page {
          max-width: 900px;
          margin: 0 auto;
          padding: 2rem;
          text-align: center;
        }
        .version-info {
          color: #888;
          margin-bottom: 2rem;
        }
        .download-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
          margin: 2rem 0;
        }
        .download-card {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 1.5rem;
          text-align: center;
        }
        .download-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }
        .download-card h3 {
          margin: 0.5rem 0;
          color: #fff;
        }
        .download-card p {
          color: #aaa;
          margin: 0.5rem 0;
        }
        .download-size {
          font-size: 0.9rem;
          color: #666;
        }
        .download-button {
          display: inline-block;
          margin-top: 1rem;
          padding: 0.75rem 2rem;
          background: #3B8ED0;
          color: white;
          text-decoration: none;
          border-radius: 8px;
          font-weight: bold;
          transition: background 0.2s;
        }
        .download-button:hover {
          background: #2d7ac0;
        }
        .download-requirements {
          margin-top: 3rem;
          text-align: left;
          background: rgba(255, 255, 255, 0.03);
          padding: 1.5rem;
          border-radius: 8px;
        }
        .download-requirements h3 {
          margin-top: 0;
        }
        .download-requirements ul {
          margin: 0;
          padding-left: 1.5rem;
        }
        .download-requirements li {
          color: #aaa;
          margin: 0.5rem 0;
        }
        .release-link {
          margin-top: 2rem;
        }
        .release-link a {
          color: #3B8ED0;
        }
        .macos-note {
          margin-top: 2rem;
          text-align: left;
          background: rgba(255, 193, 7, 0.1);
          border: 1px solid rgba(255, 193, 7, 0.3);
          padding: 1.5rem;
          border-radius: 8px;
        }
        .macos-note h3 {
          margin-top: 0;
          color: #ffc107;
        }
        .macos-note p {
          margin: 0.5rem 0;
        }
        .macos-note ol {
          margin: 0.5rem 0;
          padding-left: 1.5rem;
        }
        .macos-note li {
          color: #aaa;
          margin: 0.5rem 0;
        }
        .macos-note a {
          color: #3B8ED0;
        }
        .terminal-command {
          display: block;
          background: #1a1a1a;
          color: #4ade80;
          padding: 1rem;
          border-radius: 6px;
          font-family: monospace;
          font-size: 0.9rem;
          cursor: pointer;
          margin: 1rem 0 0.5rem;
          transition: all 0.2s;
          border: 1px solid #333;
        }
        .terminal-command:hover {
          background: #222;
          border-color: #3B8ED0;
        }
        .terminal-command.copied {
          border-color: #4ade80;
          background: rgba(74, 222, 128, 0.1);
        }
        .terminal-command.copied::after {
          content: ' ✓ Copied!';
          color: #4ade80;
        }
        .click-hint {
          font-size: 0.8rem;
          color: #666;
          margin: 0;
        }
        .fix-option {
          background: rgba(0, 0, 0, 0.2);
          padding: 1rem;
          border-radius: 8px;
          margin: 1rem 0;
        }
        .fix-option h4 {
          margin: 0 0 0.75rem 0;
          color: #3B8ED0;
        }
        .fix-option ol {
          margin: 0.5rem 0;
          padding-left: 1.5rem;
        }
        .fix-option li {
          color: #ccc;
          margin: 0.5rem 0;
          line-height: 1.5;
        }
        .fix-option strong {
          color: #fff;
        }
      `}</style>
    </div>
  );
}
