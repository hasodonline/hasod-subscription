// Floating panel hook - handles floating window management
import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import api from '../api/tauri';

export function useFloatingPanel(
  isLicenseValid: boolean,
  onUrlDropped: (url: string) => Promise<void>
) {
  const [floatingOpen, setFloatingOpen] = useState(true);

  useEffect(() => {
    // Listen for URLs dropped on the floating panel
    const unlistenFloatingDrop = listen<string>('floating-url-dropped', (event) => {
      console.log('[FloatingPanel] URL dropped:', event.payload);
      if (isLicenseValid) {
        onUrlDropped(event.payload);
      }
    });

    // Open floating window by default when license is valid
    if (isLicenseValid) {
      openFloatingWindow();
    }

    return () => {
      unlistenFloatingDrop.then(fn => fn());
    };
  }, [isLicenseValid]);

  const openFloatingWindow = async () => {
    try {
      const isOpen = await api.platform.isFloatingWindowOpen();
      if (!isOpen) {
        await api.platform.toggleFloatingWindow();
      }
      setFloatingOpen(true);
    } catch (error) {
      console.error('Failed to open floating window:', error);
    }
  };

  const toggleFloatingWindow = async () => {
    try {
      await api.platform.toggleFloatingWindow();
      const isOpen = await api.platform.isFloatingWindowOpen();
      setFloatingOpen(isOpen);
    } catch (error) {
      console.error('Failed to toggle floating window:', error);
    }
  };

  return {
    floatingOpen,
    toggleFloatingWindow,
  };
}
