// Queue management hook - handles download queue logic
import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import api from '../api/tauri';
import type { DownloadJob, QueueStatus } from '../api/tauri';

export function useQueue(isLicenseValid: boolean) {
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);

  useEffect(() => {
    // Listen for queue updates
    const unlistenQueue = listen<QueueStatus>('queue-update', (event) => {
      if (event.payload) {
        setQueueStatus(event.payload);
      }
    });

    // Load initial queue status
    api.queue.getQueueStatus().then(setQueueStatus).catch(console.error);

    return () => {
      unlistenQueue.then(fn => fn());
    };
  }, []);

  const addToQueue = async (url: string): Promise<void> => {
    if (!isLicenseValid) {
      throw new Error('License not valid');
    }

    // Detect if URL is a Spotify album
    if (url.includes('spotify.com/album') || url.startsWith('spotify:album:')) {
      console.log('[Queue] Detected Spotify album, fetching all tracks...');
      await api.queue.addSpotifyAlbum(url);
    }
    // Detect if URL is a Spotify playlist
    else if (url.includes('spotify.com/playlist') || url.startsWith('spotify:playlist:')) {
      console.log('[Queue] Detected Spotify playlist, fetching all tracks...');
      await api.queue.addSpotifyPlaylist(url);
    }
    // Detect if URL is a YouTube playlist
    else if (url.includes('youtube.com') && url.includes('list=')) {
      console.log('[Queue] Detected YouTube playlist, extracting all videos...');
      await api.queue.addYoutubePlaylist(url);
    }
    else {
      await invoke<DownloadJob>('add_to_queue', { url });
    }

    await api.queue.startProcessing();
    const status = await api.queue.getQueueStatus();
    setQueueStatus(status);
  };

  const clearCompleted = async () => {
    try {
      await api.queue.clearCompleted();
      const status = await api.queue.getQueueStatus();
      setQueueStatus(status);
    } catch (error) {
      console.error('Failed to clear completed:', error);
    }
  };

  const clearAll = async () => {
    try {
      // Remove all jobs
      if (queueStatus?.jobs) {
        for (const job of queueStatus.jobs) {
          await api.queue.removeFromQueue(job.id);
        }
      }
      const status = await api.queue.getQueueStatus();
      setQueueStatus(status);
    } catch (error) {
      console.error('Failed to clear all:', error);
    }
  };

  const removeJob = async (jobId: string) => {
    try {
      await api.queue.removeFromQueue(jobId);
      const status = await api.queue.getQueueStatus();
      setQueueStatus(status);
    } catch (error) {
      console.error('Failed to remove job:', error);
    }
  };

  return {
    queueStatus,
    addToQueue,
    clearCompleted,
    clearAll,
    removeJob,
  };
}
