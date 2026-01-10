// Authentication hook - handles all auth-related logic
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import api from '../api/tauri';
import type { LicenseStatus, StoredAuth } from '../api/tauri';

export function useAuth() {
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [storedAuth, setStoredAuth] = useState<StoredAuth | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginMessage, setLoginMessage] = useState('');

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    setLoading(true);
    try {
      const auth = await api.auth.getStoredAuth();

      if (auth) {
        console.log('Found stored auth for:', auth.email);
        setStoredAuth(auth);
        await checkLicense(auth.email);
      } else {
        console.log('No stored auth found');
        const uuid = await api.auth.getDeviceUuid();
        setLicenseStatus({
          is_valid: false,
          status: 'not_registered',
          uuid,
          registration_url: await api.auth.getRegistrationUrl(),
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
      const status = await api.auth.checkLicense(email);
      setLicenseStatus(status);
    } catch (error) {
      console.error('License check failed:', error);
    }
  };

  const handleGoogleLogin = async (t: any) => {
    setLoggingIn(true);
    setLoginMessage(t.login.openingGoogle);

    try {
      const result = await api.auth.startGoogleLogin();
      console.log('OAuth started, opening browser...');
      await invoke('plugin:opener|open_url', { url: result.auth_url });

      setLoginMessage(t.login.waitingForLogin);
      const code = await api.auth.waitForOAuthCallback();
      console.log('Got authorization code');

      setLoginMessage(t.login.exchangingTokens);
      const auth = await api.auth.exchangeOAuthCode(code);
      console.log('Got tokens for:', auth.email);

      setStoredAuth(auth);
      setLoginMessage(t.login.checkingLicense);
      await checkLicense(auth.email);
      setLoginMessage('');
    } catch (error) {
      console.error('Login failed:', error);
      setLoginMessage('');
      alert(t.login.loginFailed + ' ' + error);
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.auth.logout();
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

  const handleRegister = async () => {
    if (licenseStatus?.registration_url) {
      await invoke('plugin:opener|open_url', { url: licenseStatus.registration_url });
    }
  };

  return {
    licenseStatus,
    storedAuth,
    loading,
    loggingIn,
    loginMessage,
    handleGoogleLogin,
    handleLogout,
    handleRefreshAuth,
    handleRegister,
  };
}
