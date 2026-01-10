// Audio Player Component - Play/Pause/Stop for downloaded songs
import { useState, useRef, useEffect } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';

interface AudioPlayerProps {
  filePath: string | null;
  onClose?: () => void;
}

export function AudioPlayer({ filePath, onClose }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!filePath || !audioRef.current) return;

    // Convert file path to Tauri URL
    const audioSrc = convertFileSrc(filePath);
    audioRef.current.src = audioSrc;
    audioRef.current.load();

    // Auto-play when file loads
    const handleCanPlay = async () => {
      if (audioRef.current) {
        try {
          await audioRef.current.play();
          setIsPlaying(true);
        } catch (error) {
          console.error('[AudioPlayer] Auto-play failed:', error);
        }
      }
    };

    audioRef.current.addEventListener('canplay', handleCanPlay);
    return () => {
      audioRef.current?.removeEventListener('canplay', handleCanPlay);
    };
  }, [filePath]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);
    const handleError = (e: Event) => {
      e.preventDefault();
      const audioEl = e.target as HTMLAudioElement;
      console.error('[AudioPlayer] Audio error:', audioEl.error?.message || 'Unknown error');
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, []);

  const handlePlayPause = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (error) {
        console.error('[AudioPlayer] Play failed:', error);
      }
    }
  };

  const handleStop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!filePath) return null;

  return (
    <div className="audio-player" onClick={(e) => e.stopPropagation()}>
      <audio
        ref={audioRef}
        preload="metadata"
        controlsList="nodownload nofullscreen noremoteplayback"
        disablePictureInPicture
        playsInline
      />

      <div className="player-controls">
        <button
          className="player-btn play-pause"
          onClick={handlePlayPause}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶️'}
        </button>

        <button
          className="player-btn stop"
          onClick={handleStop}
          title="Stop"
        >
          ⏹
        </button>

        <div className="player-time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>

        {onClose && (
          <button
            className="player-btn close"
            onClick={onClose}
            title="Close player"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
