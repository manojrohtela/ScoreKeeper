export interface PlayerStanding {
  rank: number;
  name: string;
  total: number;
  matches: Record<string, number>;
}

export interface StandingsResponse {
  players: PlayerStanding[];
  match_headers: string[];
}

export interface UploadResponse {
  match_name: string;
  match_number: number;
  extracted: Record<string, number>;
  message: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  answer: string;
}
