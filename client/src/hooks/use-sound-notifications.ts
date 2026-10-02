import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import type { ProductionRecord } from '@shared/schema';

function playDingDong() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const t = ctx.currentTime;

    function tone(freq: number, start: number, duration: number, gain: number) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(gain, start + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    }

    tone(880, t + 0.0, 0.6, 0.4);
    tone(660, t + 0.35, 0.7, 0.35);

    setTimeout(() => ctx.close(), 2000);
  } catch {}
}

function playSuccess() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const t = ctx.currentTime;

    function tone(freq: number, start: number, duration: number, gain: number) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(gain, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    }

    tone(523, t + 0.0, 0.25, 0.3);
    tone(659, t + 0.15, 0.25, 0.3);
    tone(784, t + 0.30, 0.45, 0.35);

    setTimeout(() => ctx.close(), 2000);
  } catch {}
}

export function useSoundNotifications() {
  const { user } = useAuth();
  const knownIds = useRef<Set<number>>(new Set());
  const knownStatuses = useRef<Map<number, string>>(new Map());
  const initialized = useRef(false);

  const { data: records } = useQuery<ProductionRecord[]>({
    queryKey: ['/api/records'],
    refetchInterval: 12_000,
    enabled: !!user,
  });

  useEffect(() => {
    if (!records) return;

    if (!initialized.current) {
      records.forEach(r => {
        knownIds.current.add(r.id);
        knownStatuses.current.set(r.id, r.status);
      });
      initialized.current = true;
      return;
    }

    let hasNew = false;
    let hasCompleted = false;

    records.forEach(r => {
      if (!knownIds.current.has(r.id)) {
        hasNew = true;
        knownIds.current.add(r.id);
        knownStatuses.current.set(r.id, r.status);
        return;
      }

      const prevStatus = knownStatuses.current.get(r.id);
      if (prevStatus && prevStatus !== 'completed' && r.status === 'completed') {
        hasCompleted = true;
      }
      knownStatuses.current.set(r.id, r.status);
    });

    if (hasNew) {
      setTimeout(playDingDong, 100);
    } else if (hasCompleted) {
      setTimeout(playSuccess, 100);
    }
  }, [records]);
}
