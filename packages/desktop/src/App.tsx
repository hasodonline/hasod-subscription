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

// Queue types matching Rust backend
interface TrackMetadata {
  title: string;
  artist: string;
  album: string;
  duration?: number;
  thumbnail?: string;
}

interface DownloadJob {
  id: string;
  url: string;
  service: string;
  status: string;
  progress: number;
  message: string;
  metadata: TrackMetadata;
  output_path?: string;
  created_at: number;
  started_at?: number;
  completed_at?: number;
  error?: string;
}

interface QueueStatus {
  jobs: DownloadJob[];
  active_count: number;
  queued_count: number;
  completed_count: number;
  error_count: number;
  is_processing: boolean;
}

// Service icons and colors
const serviceStyles: Record<string, { icon: string; color: string; name: string }> = {
  YouTube: { icon: '🎬', color: '#FF0000', name: 'YouTube' },
  Spotify: { icon: '🟢', color: '#1DB954', name: 'Spotify' },
  SoundCloud: { icon: '🟠', color: '#FF5500', name: 'SoundCloud' },
  Deezer: { icon: '🟣', color: '#A238FF', name: 'Deezer' },
  Tidal: { icon: '🔵', color: '#00FFFF', name: 'Tidal' },
  AppleMusic: { icon: '🍎', color: '#FA2D48', name: 'Apple Music' },
  Bandcamp: { icon: '🎵', color: '#629AA9', name: 'Bandcamp' },
  Unknown: { icon: '❓', color: '#667eea', name: 'Unknown' },
};

function App() {
  const [activeTab, setActiveTab] = useState<'download' | 'license'>('license');
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [storedAuth, setStoredAuth] = useState<StoredAuth | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginMessage, setLoginMessage] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [downloadProgress, setDownloadProgress] = useState('');
  const [floatingOpen, setFloatingOpen] = useState(true);  // Default: on
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);

  // Open floating window on app start
  const openFloatingWindow = async () => {
    try {
      const isOpen = await invoke<boolean>('is_floating_window_open');
      if (!isOpen) {
        await invoke('toggle_floating_window');
      }
      setFloatingOpen(true);
    } catch (error) {
      console.error('Failed to open floating window:', error);
    }
  };

  const toggleFloatingWindow = async () => {
    try {
      await invoke('toggle_floating_window');
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

    try {
      await invoke('add_to_queue', { url });
      await invoke('start_queue_processing');
      const status = await invoke<QueueStatus>('get_queue_status');
      setQueueStatus(status);
    } catch (error) {
      console.error('[App] Failed to add to queue:', error);
    }
  };

  useEffect(() => {
    initializeAuth();
  }, []);

  useEffect(() => {
    // Listen to download progress events
    const unlistenDownload = listen<string>('download-progress', (event) => {
      setDownloadProgress(prev => prev + '\n' + event.payload);
    });

    // Listen for queue updates
    const unlistenQueue = listen<QueueStatus>('queue-update', (event) => {
      if (event.payload) {
        setQueueStatus(event.payload);
      }
    });

    // Listen for URLs dropped on the floating panel
    const unlistenFloatingDrop = listen<string>('floating-url-dropped', (event) => {
      console.log('[App] floating-url-dropped event:', event.payload);
      if (licenseStatus?.is_valid) {
        handleFloatingDownload(event.payload);
      }
    });

    // Load initial queue status
    invoke<QueueStatus>('get_queue_status').then(setQueueStatus).catch(console.error);

    // Open floating window by default when license is valid
    if (licenseStatus?.is_valid) {
      openFloatingWindow();
    }

    return () => {
      unlistenDownload.then(fn => fn());
      unlistenQueue.then(fn => fn());
      unlistenFloatingDrop.then(fn => fn());
    };
  }, [licenseStatus?.is_valid]);

  const initializeAuth = async () => {
    setLoading(true);
    try {
      const auth = await invoke<StoredAuth | null>('get_stored_auth');

      if (auth) {
        console.log('Found stored auth for:', auth.email);
        setStoredAuth(auth);
        await checkLicense(auth.email);
      } else {
        console.log('No stored auth found');
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
      const result = await invoke<OAuthStartResult>('start_google_login');
      console.log('OAuth started, opening browser...');
      await invoke('plugin:opener|open_url', { url: result.auth_url });

      setLoginMessage('Waiting for login in browser...');
      const code = await invoke<string>('wait_for_oauth_callback');
      console.log('Got authorization code');

      setLoginMessage('Exchanging tokens...');
      const auth = await invoke<StoredAuth>('exchange_oauth_code', { code });
      console.log('Got tokens for:', auth.email);

      setStoredAuth(auth);
      setLoginMessage('Checking license...');
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
      await handleLogout();
    } finally {
      setLoading(false);
    }
  };

  const handleAddToQueue = async () => {
    if (!downloadUrl.trim()) {
      alert('Please enter a URL');
      return;
    }

    if (!licenseStatus?.is_valid) {
      alert('License not valid. Please login first.');
      return;
    }

    try {
      await invoke<DownloadJob>('add_to_queue', { url: downloadUrl });
      setDownloadUrl('');
      await invoke('start_queue_processing');
      const status = await invoke<QueueStatus>('get_queue_status');
      setQueueStatus(status);
    } catch (error) {
      console.error('Failed to add to queue:', error);
      alert('Failed to add to queue: ' + error);
    }
  };

  const handleClearCompleted = async () => {
    try {
      await invoke('clear_completed_jobs');
      const status = await invoke<QueueStatus>('get_queue_status');
      setQueueStatus(status);
    } catch (error) {
      console.error('Failed to clear completed:', error);
    }
  };

  const handleRemoveJob = async (jobId: string) => {
    try {
      await invoke('remove_from_queue', { jobId });
      const status = await invoke<QueueStatus>('get_queue_status');
      setQueueStatus(status);
    } catch (error) {
      console.error('Failed to remove job:', error);
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
          <p>Multi-Service Music Downloader</p>
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
        <p>Multi-Service Music Downloader</p>
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
          {queueStatus && (queueStatus.active_count + queueStatus.queued_count) > 0 && (
            <span className="tab-badge">{queueStatus.active_count + queueStatus.queued_count}</span>
          )}
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

            {/* Supported Services Banner */}
            <div className="services-banner">
              <span className="services-label">Supported:</span>
              <div className="services-list">
                {Object.entries(serviceStyles).slice(0, 7).map(([key, style]) => (
                  <span key={key} className="service-chip" title={style.name}>
                    <span className="service-icon">{style.icon}</span>
                    <span className="service-name">{style.name}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* URL Input */}
            <div className="download-form">
              <input
                type="text"
                value={downloadUrl}
                onChange={(e) => setDownloadUrl(e.target.value)}
                placeholder="Paste URL from any supported service..."
                className="url-input"
                disabled={!licenseStatus?.is_valid}
                onKeyDown={(e) => e.key === 'Enter' && handleAddToQueue()}
              />
              <button
                onClick={handleAddToQueue}
                disabled={!licenseStatus?.is_valid || !downloadUrl.trim()}
                className="btn-download"
              >
                Add to Queue
              </button>
            </div>

            {/* Queue Status */}
            {queueStatus && queueStatus.jobs.length > 0 && (
              <div className="queue-section">
                <div className="queue-header">
                  <h3>Download Queue</h3>
                  <div className="queue-stats">
                    {queueStatus.active_count > 0 && (
                      <span className="stat downloading">{queueStatus.active_count} downloading</span>
                    )}
                    {queueStatus.queued_count > 0 && (
                      <span className="stat queued">{queueStatus.queued_count} waiting</span>
                    )}
                    {queueStatus.completed_count > 0 && (
                      <span className="stat completed">{queueStatus.completed_count} done</span>
                    )}
                    {queueStatus.error_count > 0 && (
                      <span className="stat error">{queueStatus.error_count} failed</span>
                    )}
                  </div>
                  {queueStatus.completed_count > 0 && (
                    <button className="btn-clear" onClick={handleClearCompleted}>
                      Clear Completed
                    </button>
                  )}
                </div>

                <div className="queue-list">
                  {queueStatus.jobs.map(job => {
                    const style = serviceStyles[job.service] || serviceStyles.Unknown;
                    return (
                      <div key={job.id} className={`queue-item ${job.status.toLowerCase()}`}>
                        <span className="job-icon" style={{ color: style.color }}>{style.icon}</span>
                        <div className="job-info">
                          <div className="job-title">
                            {job.metadata?.title || 'Loading...'}
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
                                    style={{ width: `${job.progress}%`, backgroundColor: style.color }}
                                  />
                                </div>
                                <span className="progress-percent">{Math.round(job.progress)}%</span>
                              </div>
                            )}
                            {job.status === 'Queued' && (
                              <span className="status-label queued">Waiting...</span>
                            )}
                            {job.status === 'Complete' && (
                              <span className="status-label complete">Done</span>
                            )}
                            {job.status === 'Error' && (
                              <span className="status-label error" title={job.error}>Failed</span>
                            )}
                          </div>
                        </div>
                        {(job.status === 'Queued' || job.status === 'Error') && (
                          <button
                            className="btn-remove"
                            onClick={() => handleRemoveJob(job.id)}
                            title="Remove from queue"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Progress Log (collapsible) */}
            {downloadProgress && (
              <details className="progress-box">
                <summary>Progress Log</summary>
                <pre className="progress-output">{downloadProgress}</pre>
              </details>
            )}

            <div className="info-box">
              <h3>Features</h3>
              <ul>
                <li><strong>Queue System:</strong> Add multiple URLs, they download one by one</li>
                <li><strong>Quick Drop Zone:</strong> Drag URLs from browser directly to floating button</li>
                <li><strong>Auto-Organization:</strong> Files saved as Artist/Album/Song.mp3</li>
                <li><strong>High Quality:</strong> Downloads best available audio quality</li>
              </ul>
              <p className="note">Files saved to: ~/Downloads/Hasod Downloads/</p>
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>Hasod Downloads v0.2.0 | Multi-Service Queue</p>
      </footer>
    </div>
  );
}

export default App;
