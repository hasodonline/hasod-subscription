// Main App Component - Slim version using hooks and components
import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useLanguage } from './i18n';
import LanguageSwitcher from './components/LanguageSwitcher';
import { LicenseTab } from './components/tabs/LicenseTab';
import { DownloadTab } from './components/tabs/DownloadTab';
import { useAuth, useQueue, useFloatingPanel } from './hooks';
import './App.css';

function App() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'download' | 'license'>('license');
  const [downloadProgress, setDownloadProgress] = useState('');

  // Use custom hooks for logic
  const {
    licenseStatus,
    storedAuth,
    loading,
    loggingIn,
    loginMessage,
    handleGoogleLogin,
    handleLogout,
    handleRefreshAuth,
    handleRegister,
  } = useAuth();

  const {
    queueStatus,
    addToQueue,
    clearCompleted,
    clearAll,
    removeJob,
  } = useQueue(licenseStatus?.is_valid || false);

  const { floatingOpen, toggleFloatingWindow } = useFloatingPanel(
    licenseStatus?.is_valid || false,
    addToQueue
  );

  // Listen to download progress events
  useEffect(() => {
    const unlistenDownload = listen<string>('download-progress', (event) => {
      setDownloadProgress(prev => prev + '\n' + event.payload);
    });

    return () => {
      unlistenDownload.then(fn => fn());
    };
  }, []);

  // Initial loading state
  if (loading && !licenseStatus) {
    return (
      <div className="app-container">
        <header className="app-header">
          <LanguageSwitcher />
          <h1>{t.header.title}</h1>
          <p>{t.header.subtitle}</p>
        </header>
        <main className="content">
          <div className="loading-container">
            <p className="loading">{t.common.loading}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <LanguageSwitcher />
        <h1>{t.header.title}</h1>
        <p>{t.header.subtitle}</p>
        {licenseStatus?.is_valid && (
          <button
            className={`floating-toggle ${floatingOpen ? 'active' : ''}`}
            onClick={toggleFloatingWindow}
            title={floatingOpen ? t.header.hideDropZoneTooltip : t.header.showDropZoneTooltip}
          >
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path
                fill="currentColor"
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14l-4-4h3V8h2v4h3l-4 4z"
              />
            </svg>
            {floatingOpen ? t.header.hideDropZone : t.header.showDropZone}
          </button>
        )}
      </header>

      <nav className="tabs">
        <button
          className={activeTab === 'download' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('download')}
          disabled={!licenseStatus?.is_valid}
        >
          {t.tabs.downloads}
          {queueStatus && (queueStatus.active_count + queueStatus.queued_count) > 0 && (
            <span className="tab-badge">
              {queueStatus.active_count + queueStatus.queued_count}
            </span>
          )}
        </button>
        <button
          className={activeTab === 'license' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('license')}
        >
          {t.tabs.license}
        </button>
      </nav>

      <main className="content">
        {activeTab === 'license' && (
          <LicenseTab
            licenseStatus={licenseStatus}
            storedAuth={storedAuth}
            loading={loading}
            loggingIn={loggingIn}
            loginMessage={loginMessage}
            onGoogleLogin={() => handleGoogleLogin(t)}
            onRegister={handleRegister}
            onRefreshAuth={handleRefreshAuth}
            onLogout={handleLogout}
          />
        )}

        {activeTab === 'download' && (
          <DownloadTab
            isLicenseValid={licenseStatus?.is_valid || false}
            queueStatus={queueStatus}
            onAddToQueue={addToQueue}
            onRemoveJob={removeJob}
            onClearCompleted={clearCompleted}
            onClearAll={clearAll}
          />
        )}

        {/* Progress Log (collapsible) - only show if there's progress */}
        {downloadProgress && activeTab === 'download' && (
          <details className="progress-box">
            <summary>{t.download.progressLog}</summary>
            <pre className="progress-output">{downloadProgress}</pre>
          </details>
        )}
      </main>

      <footer className="app-footer">
        <p>{t.footer.version}</p>
      </footer>
    </div>
  );
}

export default App;
