'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X, Mic, MicOff, Video, VideoOff, Monitor, PhoneOff,
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';

interface Participant {
  id: string;
  name: string;
  color: string;
  isMuted: boolean;
  hasVideo: boolean;
}

const DEMO_PARTICIPANTS: Participant[] = [
  { id: 'u1', name: 'You', color: '#0d9488', isMuted: false, hasVideo: true },
  { id: 'u2', name: 'Sarah Chen', color: '#0284c7', isMuted: false, hasVideo: true },
  { id: 'u3', name: 'Marcus Johnson', color: '#d97706', isMuted: true, hasVideo: true },
  { id: 'u5', name: 'Alex Rivera', color: '#059669', isMuted: false, hasVideo: false },
];

interface VideoCallModalProps {
  channelName: string;
  onClose: () => void;
}

export function VideoCallModal({ channelName, onClose }: VideoCallModalProps) {
  const [isCalling, setIsCalling] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [screenShare, setScreenShare] = useState(false);

  // Simulate connecting after 2 seconds
  useEffect(() => {
    const timer = setTimeout(() => setIsCalling(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Call duration timer
  useEffect(() => {
    if (isCalling) return;
    const interval = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isCalling]);

  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative flex w-full max-w-4xl flex-col rounded-2xl bg-surface-900 shadow-2xl overflow-hidden" style={{ height: '80vh', maxHeight: 640 }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-800">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-white">#{channelName}</span>
            {isCalling ? (
              <span className="flex items-center gap-1.5 text-xs text-amber-400">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                Connecting...
              </span>
            ) : (
              <span className="text-xs text-surface-400">{formatTime(elapsedSeconds)}</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-800 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Video Grid */}
        <div className="flex-1 p-4 overflow-hidden">
          {isCalling ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-brand-600 animate-pulse">
                  <span className="text-2xl font-bold text-white">#</span>
                </div>
                <p className="text-lg font-medium text-white">Calling #{channelName}...</p>
                <p className="mt-1 text-sm text-surface-400">Waiting for participants to join</p>
              </div>
            </div>
          ) : (
            <div className="grid h-full grid-cols-2 gap-3">
              {DEMO_PARTICIPANTS.map((participant) => (
                <div
                  key={participant.id}
                  className="relative flex flex-col items-center justify-center rounded-xl overflow-hidden"
                  style={{ backgroundColor: participant.hasVideo ? participant.color : '#1e293b' }}
                >
                  {/* Video placeholder */}
                  {participant.hasVideo ? (
                    <div className="flex h-full w-full items-center justify-center">
                      <span className="text-5xl font-bold text-white/80">
                        {getInitials(participant.name)}
                      </span>
                    </div>
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2">
                      <div
                        className="flex h-16 w-16 items-center justify-center rounded-full"
                        style={{ backgroundColor: participant.color }}
                      >
                        <span className="text-2xl font-bold text-white">
                          {getInitials(participant.name)}
                        </span>
                      </div>
                      <span className="text-xs text-surface-400">Camera off</span>
                    </div>
                  )}

                  {/* Name badge */}
                  <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 backdrop-blur-sm">
                    {participant.isMuted && <MicOff className="h-3 w-3 text-red-400" />}
                    <span className="text-xs font-medium text-white">{participant.name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3 border-t border-surface-800 px-5 py-4">
          <button
            onClick={() => setMicOn(!micOn)}
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-full transition-colors',
              micOn
                ? 'bg-surface-700 text-white hover:bg-surface-600'
                : 'bg-red-500 text-white hover:bg-red-600'
            )}
            title={micOn ? 'Mute' : 'Unmute'}
          >
            {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>

          <button
            onClick={() => setCameraOn(!cameraOn)}
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-full transition-colors',
              cameraOn
                ? 'bg-surface-700 text-white hover:bg-surface-600'
                : 'bg-red-500 text-white hover:bg-red-600'
            )}
            title={cameraOn ? 'Turn off camera' : 'Turn on camera'}
          >
            {cameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </button>

          <button
            onClick={() => setScreenShare(!screenShare)}
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-full transition-colors',
              screenShare
                ? 'bg-brand-600 text-white hover:bg-brand-700'
                : 'bg-surface-700 text-white hover:bg-surface-600'
            )}
            title={screenShare ? 'Stop sharing' : 'Share screen'}
          >
            <Monitor className="h-5 w-5" />
          </button>

          <div className="mx-2 h-6 w-px bg-surface-700" />

          <button
            onClick={onClose}
            className="flex h-11 w-14 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
            title="End call"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default VideoCallModal;
