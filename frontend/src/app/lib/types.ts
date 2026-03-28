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

export interface ExtractedPlayer {
  username: string;
  display_name: string;
  raw_name: string;   // what AI read from image
  points: number;
}

export interface ExtractResponse {
  players: ExtractedPlayer[];
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
