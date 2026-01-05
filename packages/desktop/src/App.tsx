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

interface StoredAuth {
  email: string;
  id_token: string;
  refresh_token: string;
  expires_at: number;
  device_id: string;
}

interface OAuthStartResult {
  auth_url: string;
  state: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<'download' | 'license'>('license');
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [storedAuth, setStoredAuth] = useState<StoredAuth | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginMessage, setLoginMessage] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [downloadProgress, setDownloadProgress] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [floatingOpen, setFloatingOpen] = useState(false);

  const toggleFloatingWindow = async () => {
    try {
      await invoke('toggle_floating_window');
      // Check if window is now open
      const isOpen = await invoke<boolean>('is_floating_window_open');
      setFloatingOpen(isOpen);
    } catch (error) {
      console.error('Failed to toggle floating window:', error);
    }
  };

  // Function to handle download from floating panel
  const handleFloatingDownload = async (url: string) => {
    console.log('[App] Received URL from floating panel:', url);

    if (!licenseStatus?.is_valid) {
      console.log('[App] License not valid, cannot download');
      return;
    }

    setDownloading(true);
    setDownloadProgress('Starting download from drop zone...\n');
    setDownloadUrl(url); // Also update the URL input

    try {
      const downloadDir = await invoke<string>('create_download_dir');
      const result = await invoke<string>('download_youtube', {
        url: url,
        outputDir: downloadDir
      });

      setDownloadProgress(prev => prev + '\n' + result);
      console.log('[App] Download complete:', downloadDir);
    } catch (error) {
      console.error('[App] Download failed:', error);
      setDownloadProgress(prev => prev + '\nError: ' + error);
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    // Check for stored auth on mount
    initializeAuth();
  }, []);

  useEffect(() => {
    // Listen to download progress events
    const unlistenDownload = listen<string>('download-progress', (event) => {
      setDownloadProgress(prev => prev + '\n' + event.payload);
    });

    // Listen for URLs dropped on the floating panel
    const unlistenFloatingDrop = listen<string>('floating-url-dropped', (event) => {
      console.log('[App] floating-url-dropped event:', event.payload);
      // Only download if license is valid
      if (licenseStatus?.is_valid) {
        handleFloatingDownload(event.payload);
      } else {
        console.log('[App] License not valid, ignoring drop');
      }
    });

    return () => {
      unlistenDownload.then(fn => fn());
      unlistenFloatingDrop.then(fn => fn());
    };
  }, [licenseStatus?.is_valid]);

  const initializeAuth = async () => {
    setLoading(true);
    try {
      // Check for stored auth in keychain
      const auth = await invoke<StoredAuth | null>('get_stored_auth');

      if (auth) {
        console.log('Found stored auth for:', auth.email);
        setStoredAuth(auth);
        // Check license with stored email
        await checkLicense(auth.email);
      } else {
        console.log('No stored auth found');
        // Get device info for display
        const uuid = await invoke<string>('get_device_uuid');
        setLicenseStatus({
          is_valid: false,
          status: 'not_registered',
          uuid,
          registration_url: await invoke<string>('get_registration_url'),
        });
      }
    } catch (error) {
      console.error('Auth initialization failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkLicense = async (email: string) => {
    try {
      const status = await invoke<LicenseStatus>('check_license', {
        userEmail: email
      });
      setLicenseStatus(status);
    } catch (error) {
      console.error('License check failed:', error);
    }
  };

  const handleGoogleLogin = async () => {
    setLoggingIn(true);
    setLoginMessage('Opening Google login...');

    try {
      // Step 1: Start OAuth flow - get auth URL
      const result = await invoke<OAuthStartResult>('start_google_login');
      console.log('OAuth started, opening browser...');

      // Step 2: Open browser to auth URL
      await invoke('plugin:opener|open_url', { url: result.auth_url });

      setLoginMessage('Waiting for login in browser...');

      // Step 3: Wait for callback (this starts the local server)
      const code = await invoke<string>('wait_for_oauth_callback');
      console.log('Got authorization code');

      setLoginMessage('Exchanging tokens...');

      // Step 4: Exchange code for tokens
      const auth = await invoke<StoredAuth>('exchange_oauth_code', { code });
      console.log('Got tokens for:', auth.email);

      setStoredAuth(auth);
      setLoginMessage('Checking license...');

      // Step 5: Check license with the authenticated email
      await checkLicense(auth.email);

      setLoginMessage('');
    } catch (error) {
      console.error('Login failed:', error);
      setLoginMessage('');
      alert('Login failed: ' + error);
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await invoke('logout');
      setStoredAuth(null);
      setLicenseStatus(null);
      await initializeAuth();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleRefreshAuth = async () => {
    if (!storedAuth) return;

    setLoading(true);
    try {
      const newAuth = await invoke<StoredAuth>('refresh_auth_token');
      setStoredAuth(newAuth);
      await checkLicense(newAuth.email);
    } catch (error) {
      console.error('Token refresh failed:', error);
      // If refresh fails, logout and re-authenticate
      await handleLogout();
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
      alert('License not valid. Please login first.');
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

      setDownloadProgress(prev => prev + '\n' + result);
      alert('Download complete! Check: ' + downloadDir);
    } catch (error) {
      console.error('Download failed:', error);
      setDownloadProgress(prev => prev + '\nError: ' + error);
      alert('Download failed: ' + error);
    } finally {
      setDownloading(false);
    }
  };

  const handleRegister = async () => {
    if (licenseStatus?.registration_url) {
      await invoke('plugin:opener|open_url', { url: licenseStatus.registration_url });
    }
  };

  // Initial loading state
  if (loading && !licenseStatus) {
    return (
      <div className="app-container">
        <header className="app-header">
          <h1>Hasod Downloads - מוריד הסוד</h1>
          <p>YouTube, Spotify, SoundCloud Downloader</p>
        </header>
        <main className="content">
          <div className="loading-container">
            <p className="loading">Loading...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Hasod Downloads - מוריד הסוד</h1>
        <p>YouTube, Spotify, SoundCloud Downloader</p>
        {licenseStatus?.is_valid && (
          <button
            className={`floating-toggle ${floatingOpen ? 'active' : ''}`}
            onClick={toggleFloatingWindow}
            title={floatingOpen ? 'Hide Quick Drop Zone' : 'Show Quick Drop Zone'}
          >
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14l-4-4h3V8h2v4h3l-4 4z"/>
            </svg>
            {floatingOpen ? 'Hide Drop Zone' : 'Quick Drop'}
          </button>
        )}
      </header>

      <nav className="tabs">
        <button
          className={activeTab === 'download' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('download')}
          disabled={!licenseStatus?.is_valid}
        >
          Downloads
        </button>
        <button
          className={activeTab === 'license' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('license')}
        >
          License
        </button>
      </nav>

      <main className="content">
        {activeTab === 'license' && (
          <div className="license-tab">
            <h2>License Status</h2>

            {loggingIn && (
              <div className="login-progress">
                <p className="loading">{loginMessage}</p>
              </div>
            )}

            {licenseStatus && !loggingIn && (
              <div className={`status-card ${licenseStatus.is_valid ? 'valid' : 'invalid'}`}>
                <div className="status-header">
                  {licenseStatus.is_valid ? (
                    <span className="status-badge success">Active</span>
                  ) : (
                    <span className="status-badge error">{licenseStatus.status.replace('_', ' ')}</span>
                  )}
                </div>

                <div className="status-details">
                  <p><strong>Device ID:</strong> <code>{licenseStatus.uuid}</code></p>

                  {storedAuth && (
                    <p><strong>Email:</strong> {storedAuth.email}</p>
                  )}

                  {licenseStatus.expires_at && (
                    <p><strong>Expires:</strong> {licenseStatus.expires_at}</p>
                  )}

                  {licenseStatus.error && (
                    <p className="error-message">{licenseStatus.error}</p>
                  )}
                </div>

                <div className="actions">
                  {!storedAuth && (
                    <button
                      onClick={handleGoogleLogin}
                      className="btn-primary google-btn"
                      disabled={loggingIn}
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18" style={{ marginRight: '8px' }}>
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      Login with Google
                    </button>
                  )}

                  {storedAuth && !licenseStatus.is_valid && licenseStatus.registration_url && (
                    <button onClick={handleRegister} className="btn-secondary">
                      Subscribe Now
                    </button>
                  )}

                  {storedAuth && (
                    <>
                      <button onClick={handleRefreshAuth} className="btn-secondary" disabled={loading}>
                        Refresh Status
                      </button>
                      <button onClick={handleLogout} className="btn-secondary btn-logout">
                        Logout
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="info-box">
              <h3>How It Works</h3>
              <ol>
                <li>Click "Login with Google" to sign in securely</li>
                <li>Your account will be verified via Hasod API</li>
                <li>If you have active "מוריד הסוד" subscription - Downloads enabled</li>
                <li>If not - Click "Subscribe Now" to get access</li>
              </ol>
            </div>
          </div>
        )}

        {activeTab === 'download' && (
          <div className="download-tab">
            <h2>Download Music</h2>

            {!licenseStatus?.is_valid && (
              <div className="warning-box">
                License not active. Please go to License tab and login.
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
                {downloading ? 'Downloading...' : 'Download'}
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
                <li>YouTube - Videos and playlists</li>
                <li>Spotify - Coming soon (via Cloud Functions API)</li>
                <li>SoundCloud - Coming soon</li>
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
