import type { ChatResponse, StandingsResponse, UploadResponse } from './types';

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

export const uploadMatch = (file: File): Promise<UploadResponse> => {
  const form = new FormData();
  form.append('file', file);
  return req<UploadResponse>('/upload', { method: 'POST', body: form });
};

export const sendChat = (question: string): Promise<ChatResponse> =>
  req<ChatResponse>('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
