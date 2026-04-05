export interface PlayerStanding {
  rank: number;
  username: string;
  display_name: string;
  total: number;
  matches: Record<string, number>;
}

export interface StandingsResponse {
  players: PlayerStanding[];
  match_headers: string[];
}

export interface AdminMatchSummary {
  id: number;
  name: string;
}

export interface AdminMatchPlayer {
  username: string;
  display_name: string;
  points: number;
}

export interface AdminMatchDetail {
  match_id: number;
  match_name: string;
  players: AdminMatchPlayer[];
}

export interface MatchListResponse {
  matches: AdminMatchSummary[];
}

export interface AdminActionResponse {
  success: boolean;
  message: string;
}

export interface ExtractedPlayer {
  username: string;
  display_name: string;
  raw_name: string;   // what AI read from image
  points: number;
}

export interface ExtractResponse {
  players: ExtractedPlayer[];
  match_title: string;
}

export interface ConfirmUploadResponse {
  match_name: string;
  match_number: number;
  message: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  answer: string;
}
