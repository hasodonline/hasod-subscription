/**
 * Download Page
 * Main page for the music download service
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import DownloadForm from '../components/DownloadForm';
import DownloadProgress from '../components/DownloadProgress';
import DownloadResult from '../components/DownloadResult';
import {
  submitDownload,
  getDownloadHistory,
  deleteJob,
  subscribeToJob,
} from '../api/download.api';
import type { DownloadJob } from '../types/download';

const Download: React.FC = () => {
  const { currentUser, userDoc } = useAuth();
  const navigate = useNavigate();
  const [activeJobs, setActiveJobs] = useState<DownloadJob[]>([]);
  const [completedJobs, setCompletedJobs] = useState<DownloadJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [subscriptions, setSubscriptions] = useState<Map<string, () => void>>(new Map());

  // Check if user has active subscription
  const hasSubscription =
    userDoc?.services?.['hasod-downloader']?.status === 'active';

  useEffect(() => {
    if (!currentUser) {
      navigate('/');
      return;
    }

    if (userDoc && !hasSubscription) {
      // Don't navigate away, just show message
      return;
    }

    // Load download history
    loadHistory();

    // Cleanup subscriptions on unmount
    return () => {
      subscriptions.forEach((unsubscribe) => unsubscribe());
    };
  }, [currentUser, userDoc, hasSubscription]);

  const loadHistory = async () => {
    if (!currentUser) return;

    try {
      const jobs = await getDownloadHistory(currentUser.uid, 20);

      // Separate active and completed jobs
      const active = jobs.filter(
        (job) => job.status === 'queued' || job.status === 'downloading' || job.status === 'processing'
      );
      const completed = jobs.filter(
        (job) => job.status === 'complete' || job.status === 'error'
      );

      setActiveJobs(active);
      setCompletedJobs(completed);

      // Subscribe to active jobs for real-time updates
      active.forEach((job) => {
        if (!subscriptions.has(job.jobId)) {
          const unsubscribe = subscribeToJob(job.jobId, (updatedJob) => {
            if (updatedJob) {
              updateJob(updatedJob);
            }
          });
          setSubscriptions((prev) => new Map(prev).set(job.jobId, unsubscribe));
        }
      });
    } catch (err: any) {
      console.error('Failed to load history:', err);
      // Silently ignore index-building errors - they'll resolve automatically
      // Only show user-facing errors for actual issues
      const errorMessage = err.response?.data?.error || err.message || '';
      if (!errorMessage.includes('index') && !errorMessage.includes('FAILED_PRECONDITION')) {
        setError('Failed to load download history. Please refresh the page.');
      }
      // If it's an index error, just log it and continue - history will load once index is ready
    }
  };

  const updateJob = (updatedJob: DownloadJob) => {
    const isActive =
      updatedJob.status === 'queued' ||
      updatedJob.status === 'downloading' ||
      updatedJob.status === 'processing';

    if (isActive) {
      setActiveJobs((prev) =>
        prev.map((job) => (job.jobId === updatedJob.jobId ? updatedJob : job))
      );
    } else {
      // Move to completed
      setActiveJobs((prev) => prev.filter((job) => job.jobId !== updatedJob.jobId));
      setCompletedJobs((prev) => {
        const exists = prev.some((job) => job.jobId === updatedJob.jobId);
        if (exists) {
          return prev.map((job) => (job.jobId === updatedJob.jobId ? updatedJob : job));
        }
        return [updatedJob, ...prev];
      });

      // Unsubscribe from this job
      const unsubscribe = subscriptions.get(updatedJob.jobId);
      if (unsubscribe) {
        unsubscribe();
        setSubscriptions((prev) => {
          const newMap = new Map(prev);
          newMap.delete(updatedJob.jobId);
          return newMap;
        });
      }
    }
  };

  const handleSubmit = async (url: string, transliterate: boolean) => {
    if (!currentUser) return;

    setLoading(true);
    setError('');

    try {
      const result = await submitDownload(currentUser.uid, url, transliterate);

      // Subscribe to the new job
      const unsubscribe = subscribeToJob(result.jobId, (updatedJob) => {
        if (updatedJob) {
          updateJob(updatedJob);
        }
      });
      setSubscriptions((prev) => new Map(prev).set(result.jobId, unsubscribe));

      // Add to active jobs (will be updated via subscription)
      setActiveJobs((prev) => [
        {
          jobId: result.jobId,
          uid: currentUser.uid,
          url,
          platform: 'unknown' as any,
          type: 'single',
          status: 'queued',
          progress: 0,
          message: 'Job queued',
          metadata: {},
          files: [],
          transliterateEnabled: transliterate,
          createdAt: new Date() as any,
        },
        ...prev,
      ]);
    } catch (err: any) {
      console.error('Failed to submit download:', err);
      const errorMsg = err.response?.data?.error || 'Failed to submit download';

      if (err.response?.data?.requiresSubscription) {
        setError('You need an active Hasod Downloader subscription to download music.');
      } else {
        setError(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (jobId: string) => {
    if (!currentUser) return;

    try {
      await deleteJob(jobId, currentUser.uid);
      setCompletedJobs((prev) => prev.filter((job) => job.jobId !== jobId));
    } catch (err: any) {
      console.error('Failed to delete job:', err);
    }
  };

  if (!currentUser) {
    return null;
  }

  if (!hasSubscription) {
    return (
      <div className="download-page">
        <div className="page-header">
          <h1>🎵 Music Downloader</h1>
          <p>Download high-quality music from YouTube, Spotify, and more</p>
        </div>

        <div className="subscription-required">
          <h2>Subscription Required</h2>
          <p>
            You need an active subscription to Hasod Downloader to use this service.
          </p>
          <button onClick={() => navigate('/subscriptions')} className="subscribe-button">
            View Subscriptions
          </button>
        </div>

        <style jsx>{`
          .download-page {
            max-width: 1000px;
            margin: 0 auto;
            padding: 32px 16px;
          }

          .page-header {
            text-align: center;
            margin-bottom: 48px;
          }

          .page-header h1 {
            font-size: 36px;
            margin: 0 0 12px 0;
            color: #333;
          }

          .page-header p {
            font-size: 18px;
            color: #666;
            margin: 0;
          }

          .subscription-required {
            background: white;
            border-radius: 8px;
            padding: 48px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            text-align: center;
          }

          .subscription-required h2 {
            margin: 0 0 16px 0;
            color: #333;
          }

          .subscription-required p {
            margin: 0 0 24px 0;
            color: #666;
            font-size: 16px;
          }

          .subscribe-button {
            padding: 12px 32px;
            background-color: #4285f4;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.2s;
          }

          .subscribe-button:hover {
            background-color: #357ae8;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="download-page">
      <div className="page-header">
        <h1>🎵 Music Downloader</h1>
        <p>Download high-quality music from YouTube, Spotify, SoundCloud, and Bandcamp</p>
      </div>

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError('')} className="close-button">
            ×
          </button>
        </div>
      )}

      <DownloadForm onSubmit={handleSubmit} disabled={loading} />

      {activeJobs.length > 0 && (
        <section className="jobs-section">
          <h2>Active Downloads</h2>
          {activeJobs.map((job) => (
            <DownloadProgress key={job.jobId} job={job} />
          ))}
        </section>
      )}

      {completedJobs.length > 0 && (
        <section className="jobs-section">
          <h2>Download History</h2>
          {completedJobs.map((job) => (
            <DownloadResult
              key={job.jobId}
              job={job}
              onDelete={() => handleDelete(job.jobId)}
            />
          ))}
        </section>
      )}

      {activeJobs.length === 0 && completedJobs.length === 0 && (
        <div className="empty-state">
          <p>No downloads yet. Paste a music URL above to get started!</p>
        </div>
      )}

      <style jsx>{`
        .download-page {
          max-width: 1000px;
          margin: 0 auto;
          padding: 32px 16px;
        }

        .page-header {
          text-align: center;
          margin-bottom: 48px;
        }

        .page-header h1 {
          font-size: 36px;
          margin: 0 0 12px 0;
          color: #333;
        }

        .page-header p {
          font-size: 18px;
          color: #666;
          margin: 0;
        }

        .error-banner {
          background-color: #ffebee;
          border-left: 4px solid #f44336;
          color: #d32f2f;
          padding: 16px 20px;
          border-radius: 4px;
          margin-bottom: 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .close-button {
          background: none;
          border: none;
          color: #d32f2f;
          font-size: 24px;
          cursor: pointer;
          padding: 0 8px;
          line-height: 1;
        }

        .jobs-section {
          margin-top: 48px;
        }

        .jobs-section h2 {
          font-size: 24px;
          margin: 0 0 24px 0;
          color: #333;
        }

        .empty-state {
          text-align: center;
          padding: 64px 32px;
          color: #999;
        }

        .empty-state p {
          font-size: 16px;
          margin: 0;
        }
      `}</style>
    </div>
  );
};

export default Download;
