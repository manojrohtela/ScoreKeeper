import type {
  AdminActionResponse, AdminMatchDetail, ChatResponse,
  ConfirmUploadResponse, ExtractResponse, MatchListResponse,
  StandingsResponse,
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

export const listMatches = (): Promise<MatchListResponse> =>
  req<MatchListResponse>('/matches');

export const getMatch = (matchId: number): Promise<AdminMatchDetail> =>
  req<AdminMatchDetail>(`/matches/${matchId}`);

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

export const updateMatch = (
  matchId: number,
  code: string,
  players: { username: string; points: number }[],
): Promise<AdminActionResponse> =>
  req<AdminActionResponse>(`/matches/${matchId}/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, players }),
  });

export const deleteMatch = (matchId: number, code: string): Promise<AdminActionResponse> =>
  req<AdminActionResponse>(`/matches/${matchId}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

export const resetData = (code: string): Promise<AdminActionResponse> =>
  req<AdminActionResponse>('/reset-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

export const exportXlsx = (): string => `${BASE}/export`;
