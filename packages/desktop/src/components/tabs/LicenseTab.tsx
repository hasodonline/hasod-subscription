// License Tab Component - License and authentication interface
import type { LicenseStatus, StoredAuth } from '../../api/tauri';
import { useLanguage } from '../../i18n';

interface LicenseTabProps {
  licenseStatus: LicenseStatus | null;
  storedAuth: StoredAuth | null;
  loading: boolean;
  loggingIn: boolean;
  loginMessage: string;
  onGoogleLogin: () => void;
  onRegister: () => void;
  onRefreshAuth: () => void;
  onLogout: () => void;
}

export function LicenseTab({
  licenseStatus,
  storedAuth,
  loading,
  loggingIn,
  loginMessage,
  onGoogleLogin,
  onRegister,
  onRefreshAuth,
  onLogout,
}: LicenseTabProps) {
  const { t } = useLanguage();

  return (
    <div className="license-tab">
      <h2>{t.license.title}</h2>

      {loggingIn && (
        <div className="login-progress">
          <p className="loading">{loginMessage}</p>
        </div>
      )}

      {licenseStatus && !loggingIn && (
        <div className={`status-card ${licenseStatus.is_valid ? 'valid' : 'invalid'}`}>
          <div className="status-header">
            {licenseStatus.is_valid ? (
              <span className="status-badge success">{t.license.statusActive}</span>
            ) : (
              <span className="status-badge error">
                {licenseStatus.status.replace('_', ' ')}
              </span>
            )}
          </div>

          <div className="status-details">
            <p>
              <strong>{t.license.deviceId}</strong> <code>{licenseStatus.uuid}</code>
            </p>

            {storedAuth && (
              <p>
                <strong>{t.license.email}</strong> {storedAuth.email}
              </p>
            )}

            {licenseStatus.expires_at && (
              <p>
                <strong>{t.license.expires}</strong> {licenseStatus.expires_at}
              </p>
            )}

            {licenseStatus.error && (
              <p className="error-message">{licenseStatus.error}</p>
            )}
          </div>

          <div className="actions">
            {!storedAuth && (
              <button
                onClick={onGoogleLogin}
                className="btn-primary google-btn"
                disabled={loggingIn}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  style={{ marginRight: '8px' }}
                >
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                {t.license.loginWithGoogle}
              </button>
            )}

            {storedAuth && !licenseStatus.is_valid && licenseStatus.registration_url && (
              <button onClick={onRegister} className="btn-secondary">
                {t.license.subscribeNow}
              </button>
            )}

            {storedAuth && (
              <>
                <button onClick={onRefreshAuth} className="btn-secondary" disabled={loading}>
                  {t.license.refreshStatus}
                </button>
                <button onClick={onLogout} className="btn-secondary btn-logout">
                  {t.license.logout}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="info-box">
        <h3>{t.license.howItWorks}</h3>
        <ol>
          <li>{t.license.step1}</li>
          <li>{t.license.step2}</li>
          <li>{t.license.step3}</li>
          <li>{t.license.step4}</li>
        </ol>
      </div>
    </div>
  );
}
