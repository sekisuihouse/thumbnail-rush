export type Difficulty = "EASY" | "NORMAL" | "HARD" | "CHAOS";
export type LanguageMode = "ja" | "en" | "mixed";
export type GamePhase = "LOBBY" | "PREPARING" | "COUNTDOWN" | "PLAYING" | "RESULT" | "FINISHED";

export interface Question {
  id: string;
  videoId: string;
  title: string;
  thumbnailUrl: string;
  channelTitle: string;
  publishedAt: string;
  searchWords: string[];
  searchRank: number;
  language?: "ja" | "en";
  durationSeconds?: number;
  viewCount?: number;
  generatedAt?: string;
}

export interface GameSettings {
  rounds: number;
  roundSeconds: number;
  searchDepth: number;
  minViewCount: number;
  language: LanguageMode;
  difficulty: Difficulty;
}

export interface PublicPlayer {
  id: string;
  name: string;
  score: number;
  isHost: boolean;
  connected: boolean;
  correctCount: number;
  averageAnswerMs: number | null;
  fastestAnswerMs: number | null;
  status: "waiting" | "searching" | "answered" | "correct";
}

export interface RevealedAnswer {
  title: string;
  videoId: string;
  thumbnailUrl: string;
  channelTitle: string;
  publishedAt: string;
  winnerName: string | null;
  elapsedMs: number | null;
  points: number;
}

export interface PublicRoomState {
  code: string;
  phase: GamePhase;
  settings: GameSettings;
  players: PublicPlayer[];
  round: number;
  totalRounds: number;
  serverNow: number;
  countdownEndsAt: number | null;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  thumbnailUrl: string | null;
  result: RevealedAnswer | null;
}

export interface ClientToServerEvents {
  "room:create": (payload: { name: string; playerToken: string }, callback: Ack<{ code: string; playerId: string }>) => void;
  "room:join": (payload: { code: string; name: string; playerToken: string }, callback: Ack<{ code: string; playerId: string }>) => void;
  "room:update-settings": (payload: Partial<GameSettings>, callback: Ack) => void;
  "game:start": (callback: Ack) => void;
  "answer:submit": (payload: { answer: string }, callback: Ack<{ accepted: boolean; correct: boolean }>) => void;
  "room:leave": () => void;
}

export interface ServerToClientEvents {
  "room:state": (state: PublicRoomState) => void;
  "room:error": (message: string) => void;
  "answer:feedback": (payload: { correct: boolean; message: string }) => void;
  "round:winner": (payload: { name: string }) => void;
}

export type Ack<T extends object = object> = (response: ({ ok: true } & T) | { ok: false; error: string }) => void;
