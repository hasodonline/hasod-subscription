import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import './App.css';

interface LicenseStatus {
  is_valid: boolean;
  status: string;
  uuid: string;
  email?: string;
  registration_url?: string;
  expires_at?: string;
  error?: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<'download' | 'license'>('license');
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [downloadProgress, setDownloadProgress] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    // Check license on mount
    checkLicense();

    // Listen to download progress events
    const unlisten = listen<string>('download-progress', (event) => {
      setDownloadProgress(prev => prev + '\n' + event.payload);
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  const checkLicense = async (email?: string) => {
    setLoading(true);
    try {
      const status = await invoke<LicenseStatus>('check_license', {
        userEmail: email || null
      });
      setLicenseStatus(status);
    } catch (error) {
      console.error('License check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!downloadUrl.trim()) {
      alert('Please enter a URL');
      return;
    }

    if (!licenseStatus?.is_valid) {
      alert('License not valid. Please register first.');
      return;
    }

    setDownloading(true);
    setDownloadProgress('Starting download...\n');

    try {
      const downloadDir = await invoke<string>('create_download_dir');
      const result = await invoke<string>('download_youtube', {
        url: downloadUrl,
        outputDir: downloadDir
      });

      setDownloadProgress(prev => prev + '\n✅ ' + result);
      alert('Download complete! Check: ' + downloadDir);
    } catch (error) {
      console.error('Download failed:', error);
      setDownloadProgress(prev => prev + '\n❌ Error: ' + error);
      alert('Download failed: ' + error);
    } finally {
      setDownloading(false);
    }
  };

  const handleRegister = async () => {
    if (licenseStatus?.registration_url) {
      // Use Tauri's shell open command
      await invoke('plugin:opener|open_url', { url: licenseStatus.registration_url });
    }
  };

  const handleGoogleLogin = () => {
    // For now, prompt user to enter their email
    // In production, implement full OAuth flow
    const email = prompt('Enter your Hasod account email:');
    if (email) {
      checkLicense(email);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Hasod Downloads - מוריד הסוד</h1>
        <p>YouTube, Spotify, SoundCloud Downloader</p>
      </header>

      <nav className="tabs">
        <button
          className={activeTab === 'download' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('download')}
          disabled={!licenseStatus?.is_valid}
        >
          📥 Downloads
        </button>
        <button
          className={activeTab === 'license' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('license')}
        >
          🔑 License
        </button>
      </nav>

      <main className="content">
        {activeTab === 'license' && (
          <div className="license-tab">
            <h2>License Status</h2>

            {loading && <p className="loading">Checking license...</p>}

            {licenseStatus && (
              <div className={`status-card ${licenseStatus.is_valid ? 'valid' : 'invalid'}`}>
                <div className="status-header">
                  {licenseStatus.is_valid ? (
                    <span className="status-badge success">✅ Active</span>
                  ) : (
                    <span className="status-badge error">❌ {licenseStatus.status.replace('_', ' ')}</span>
                  )}
                </div>

                <div className="status-details">
                  <p><strong>Device ID:</strong> <code>{licenseStatus.uuid}</code></p>

                  {licenseStatus.email && (
                    <p><strong>Email:</strong> {licenseStatus.email}</p>
                  )}

                  {licenseStatus.expires_at && (
                    <p><strong>Expires:</strong> {licenseStatus.expires_at}</p>
                  )}

                  {licenseStatus.error && (
                    <p className="error-message">⚠️ {licenseStatus.error}</p>
                  )}
                </div>

                <div className="actions">
                  {!licenseStatus.email && (
                    <button onClick={handleGoogleLogin} className="btn-primary">
                      Login with Google
                    </button>
                  )}

                  {!licenseStatus.is_valid && licenseStatus.registration_url && (
                    <button onClick={handleRegister} className="btn-secondary">
                      Register / Subscribe
                    </button>
                  )}

                  <button onClick={() => checkLicense()} className="btn-secondary" disabled={loading}>
                    🔄 Refresh Status
                  </button>
                </div>
              </div>
            )}

            <div className="info-box">
              <h3>How It Works</h3>
              <ol>
                <li>Click "Login with Google" and enter your Hasod account email</li>
                <li>App validates your subscription via Hasod API</li>
                <li>If you have active "מוריד הסוד" subscription → Downloads enabled</li>
                <li>If not → Click "Register" to subscribe on webapp</li>
              </ol>
            </div>
          </div>
        )}

        {activeTab === 'download' && (
          <div className="download-tab">
            <h2>Download Music</h2>

            {!licenseStatus?.is_valid && (
              <div className="warning-box">
                ⚠️ License not active. Please go to License tab and register.
              </div>
            )}

            <div className="download-form">
              <input
                type="text"
                value={downloadUrl}
                onChange={(e) => setDownloadUrl(e.target.value)}
                placeholder="Paste YouTube, Spotify, or SoundCloud URL..."
                className="url-input"
                disabled={downloading || !licenseStatus?.is_valid}
              />

              <button
                onClick={handleDownload}
                disabled={downloading || !licenseStatus?.is_valid || !downloadUrl.trim()}
                className="btn-download"
              >
                {downloading ? '⏳ Downloading...' : '📥 Download'}
              </button>
            </div>

            {downloadProgress && (
              <div className="progress-box">
                <h3>Progress</h3>
                <pre className="progress-output">{downloadProgress}</pre>
              </div>
            )}

            <div className="info-box">
              <h3>Supported Platforms</h3>
              <ul>
                <li>✅ YouTube - Videos and playlists</li>
                <li>⏳ Spotify - Coming soon (via Cloud Functions API)</li>
                <li>⏳ SoundCloud - Coming soon</li>
              </ul>
              <p className="note">Files are saved to: ~/Downloads/Hasod Downloads/</p>
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>Hasod Downloads v0.1.0 | עשוי באהבה על ידי הסוד און ליין</p>
      </footer>
    </div>
  );
}

export default App;
