import type {
  ChatResponse, ConfirmUploadResponse,
  ExtractResponse, StandingsResponse,
} from './types';

const BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/scorekeeper').replace(/\/$/, '');

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, init);
  if (!r.ok) {
    let msg = `Error ${r.status}`;
    try { const d = await r.json(); if (d?.detail) msg = d.detail; } catch {}
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

export const getStandings = (): Promise<StandingsResponse> =>
  req<StandingsResponse>('/standings');

export const verifyCode = (code: string): Promise<{ valid: boolean }> =>
  req('/verify-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

export const changeCode = (old_code: string, new_code: string): Promise<{ success: boolean; message: string }> =>
  req('/change-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ old_code, new_code }),
  });

export const extractFromImage = (file: File): Promise<ExtractResponse> => {
  const form = new FormData();
  form.append('file', file);
  return req<ExtractResponse>('/upload', { method: 'POST', body: form });
};

export const confirmUpload = (
  code: string,
  players: { username: string; points: number }[],
): Promise<ConfirmUploadResponse> =>
  req<ConfirmUploadResponse>('/confirm-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, players }),
  });

export const sendChat = (question: string): Promise<ChatResponse> =>
  req<ChatResponse>('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });

export const exportXlsx = (): string => `${BASE}/export`;
