import type { Server, Socket } from "socket.io";
import { randomUUID } from "node:crypto";
import { calculateScore } from "@/lib/scoring";
import { generateRoomCode } from "@/lib/room-code";
import { sanitizeAnswer, sanitizeName } from "@/lib/sanitize";
import { matchTitle } from "@/lib/title-match";
import type {
  Ack,
  ClientToServerEvents,
  GameSettings,
  PublicPlayer,
  PublicRoomState,
  Question,
  RevealedAnswer,
  ServerToClientEvents
} from "@/types/game";
import { generateLiveQuestions } from "./youtube-question-provider";

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;

interface PlayerInternal extends PublicPlayer {
  token: string;
  socketId: string | null;
  answerTimes: number[];
  lastAnswerAt: number;
}

interface RoomInternal {
  code: string;
  phase: PublicRoomState["phase"];
  settings: GameSettings;
  players: Map<string, PlayerInternal>;
  hostToken: string;
  round: number;
  questions: Question[];
  currentQuestion: Question | null;
  countdownEndsAt: number | null;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  result: RevealedAnswer | null;
  timer: NodeJS.Timeout | null;
}

const DEFAULT_SETTINGS: GameSettings = {
  rounds: 5,
  roundSeconds: 120,
  searchDepth: 3,
  minViewCount: 0,
  language: "mixed",
  difficulty: "NORMAL"
};

export class GameManager {
  private rooms = new Map<string, RoomInternal>();
  private socketRoom = new Map<string, { roomCode: string; playerToken: string }>();

  constructor(private io: GameServer) {}

  attach(socket: GameSocket): void {
    socket.on("room:create", (payload, callback) => this.create(socket, payload, callback));
    socket.on("room:join", (payload, callback) => this.join(socket, payload, callback));
    socket.on("room:update-settings", (payload, callback) => this.updateSettings(socket, payload, callback));
    socket.on("game:start", (callback) => this.start(socket, callback));
    socket.on("answer:submit", (payload, callback) => this.answer(socket, payload.answer, callback));
    socket.on("room:leave", () => this.leave(socket));
    socket.on("disconnect", () => this.disconnect(socket));
  }

  private create(socket: GameSocket, payload: { name: string; playerToken: string }, callback: Ack<{ code: string; playerId: string }>): void {
    const name = sanitizeName(payload.name);
    if (!name || !payload.playerToken) return callback({ ok: false, error: "名前を入力してください" });
    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();
    const room: RoomInternal = {
      code,
      phase: "LOBBY",
      settings: { ...DEFAULT_SETTINGS },
      players: new Map(),
      hostToken: payload.playerToken,
      round: 0,
      questions: [],
      currentQuestion: null,
      countdownEndsAt: null,
      roundStartedAt: null,
      roundEndsAt: null,
      result: null,
      timer: null
    };
    this.rooms.set(code, room);
    const player = this.upsertPlayer(room, socket, payload.playerToken, name, true);
    callback({ ok: true, code, playerId: player.id });
    this.broadcast(room);
  }

  private join(socket: GameSocket, payload: { code: string; name: string; playerToken: string }, callback: Ack<{ code: string; playerId: string }>): void {
    const code = payload.code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    const room = this.rooms.get(code);
    const name = sanitizeName(payload.name);
    if (!room) return callback({ ok: false, error: "ルームが見つかりません" });
    if (!name || !payload.playerToken) return callback({ ok: false, error: "名前を入力してください" });
    if (room.phase !== "LOBBY" && !room.players.has(payload.playerToken)) {
      return callback({ ok: false, error: "ゲームはすでに始まっています" });
    }
    if ([...room.players.values()].some((p) => p.name === name && p.token !== payload.playerToken)) {
      return callback({ ok: false, error: "その名前は使用中です" });
    }
    const player = this.upsertPlayer(room, socket, payload.playerToken, name, room.hostToken === payload.playerToken);
    callback({ ok: true, code, playerId: player.id });
    this.broadcast(room);
  }

  private upsertPlayer(room: RoomInternal, socket: GameSocket, token: string, name: string, isHost: boolean): PlayerInternal {
    const existing = room.players.get(token);
    if (existing) {
      if (existing.socketId) this.io.sockets.sockets.get(existing.socketId)?.disconnect(true);
      existing.socketId = socket.id;
      existing.connected = true;
      existing.name = name;
    } else {
      room.players.set(token, {
        id: randomUUID(), token, socketId: socket.id, name, isHost, connected: true,
        score: 0, correctCount: 0, averageAnswerMs: null, fastestAnswerMs: null,
        status: "waiting", answerTimes: [], lastAnswerAt: 0
      });
    }
    socket.join(room.code);
    this.socketRoom.set(socket.id, { roomCode: room.code, playerToken: token });
    return room.players.get(token)!;
  }

  private updateSettings(socket: GameSocket, update: Partial<GameSettings>, callback: Ack): void {
    const context = this.context(socket);
    if (!context) return callback({ ok: false, error: "ルームに参加していません" });
    const { room, player } = context;
    if (!player.isHost || room.phase !== "LOBBY") return callback({ ok: false, error: "ホストのみ変更できます" });
    room.settings = {
      rounds: clampInteger(update.rounds ?? room.settings.rounds, 1, 20),
      roundSeconds: clampInteger(update.roundSeconds ?? room.settings.roundSeconds, 30, 300),
      searchDepth: clampInteger(update.searchDepth ?? room.settings.searchDepth, 1, 5),
      minViewCount: validViewCount(update.minViewCount) ? update.minViewCount! : room.settings.minViewCount,
      language: ["ja", "en", "mixed"].includes(update.language ?? "") ? update.language! : room.settings.language,
      difficulty: ["EASY", "NORMAL", "HARD", "CHAOS"].includes(update.difficulty ?? "") ? update.difficulty! : room.settings.difficulty
    };
    callback({ ok: true });
    this.broadcast(room);
  }

  private async start(socket: GameSocket, callback: Ack): Promise<void> {
    const context = this.context(socket);
    if (!context) return callback({ ok: false, error: "ルームに参加していません" });
    const { room, player } = context;
    if (!player.isHost) return callback({ ok: false, error: "ホストのみ開始できます" });
    if (room.phase !== "LOBBY") return callback({ ok: false, error: "すでに開始済みです" });
    room.phase = "PREPARING";
    this.broadcast(room);
    try {
      room.questions = await generateLiveQuestions(room.settings, room.settings.rounds);
    } catch (error) {
      room.phase = "LOBBY";
      this.broadcast(room);
      callback({ ok: false, error: error instanceof Error ? error.message : "YouTubeから問題を取得できません" });
      return;
    }
    room.round = 0;
    for (const p of room.players.values()) Object.assign(p, { score: 0, correctCount: 0, answerTimes: [], averageAnswerMs: null, fastestAnswerMs: null });
    callback({ ok: true });
    this.beginCountdown(room);
  }

  private beginCountdown(room: RoomInternal): void {
    this.clearTimer(room);
    room.phase = "COUNTDOWN";
    room.currentQuestion = room.questions[room.round] ?? null;
    room.result = null;
    room.countdownEndsAt = Date.now() + 4000;
    room.roundStartedAt = null;
    room.roundEndsAt = null;
    for (const p of room.players.values()) p.status = "waiting";
    this.broadcast(room);
    room.timer = setTimeout(() => this.beginRound(room), 4000);
  }

  private beginRound(room: RoomInternal): void {
    if (room.phase !== "COUNTDOWN" || !room.currentQuestion) return;
    const now = Date.now();
    room.phase = "PLAYING";
    room.countdownEndsAt = null;
    room.roundStartedAt = now;
    room.roundEndsAt = now + room.settings.roundSeconds * 1000;
    for (const p of room.players.values()) p.status = "searching";
    this.broadcast(room);
    room.timer = setTimeout(() => this.endRound(room, null, null), room.settings.roundSeconds * 1000);
  }

  private answer(socket: GameSocket, rawAnswer: string, callback: Ack<{ accepted: boolean; correct: boolean }>): void {
    const context = this.context(socket);
    if (!context || context.room.phase !== "PLAYING" || !context.room.currentQuestion || !context.room.roundStartedAt) {
      return callback({ ok: false, error: "回答受付中ではありません" });
    }
    const { room, player } = context;
    const question = room.currentQuestion!;
    const roundStartedAt = room.roundStartedAt!;
    const now = Date.now();
    if (now - player.lastAnswerAt < 700) return callback({ ok: false, error: "回答が速すぎます。少し待ってください" });
    player.lastAnswerAt = now;
    const answer = sanitizeAnswer(rawAnswer);
    if (!answer) return callback({ ok: false, error: "回答を入力してください" });
    const correct = matchTitle(answer, question.title).match;
    player.status = correct ? "correct" : "answered";
    callback({ ok: true, accepted: true, correct });
    socket.emit("answer:feedback", { correct, message: correct ? "正解！" : "違います。もう一度！" });
    if (correct && room.phase === "PLAYING") {
      this.io.to(room.code).emit("round:winner", { name: player.name });
      this.endRound(room, player, now - roundStartedAt);
    } else {
      this.broadcast(room);
      setTimeout(() => {
        if (room.phase === "PLAYING" && player.status === "answered") {
          player.status = "searching";
          this.broadcast(room);
        }
      }, 900);
    }
  }

  private endRound(room: RoomInternal, winner: PlayerInternal | null, elapsedMs: number | null): void {
    if (room.phase !== "PLAYING" || !room.currentQuestion) return;
    this.clearTimer(room);
    const points = winner && elapsedMs !== null ? calculateScore(room.settings.roundSeconds, elapsedMs) : 0;
    if (winner && elapsedMs !== null) {
      winner.score += points;
      winner.correctCount += 1;
      winner.answerTimes.push(elapsedMs);
      winner.fastestAnswerMs = Math.min(...winner.answerTimes);
      winner.averageAnswerMs = Math.round(winner.answerTimes.reduce((a, b) => a + b, 0) / winner.answerTimes.length);
    }
    room.phase = "RESULT";
    room.roundEndsAt = null;
    room.result = {
      title: room.currentQuestion.title,
      videoId: room.currentQuestion.videoId,
      thumbnailUrl: room.currentQuestion.thumbnailUrl,
      channelTitle: room.currentQuestion.channelTitle,
      publishedAt: room.currentQuestion.publishedAt,
      winnerName: winner?.name ?? null,
      elapsedMs,
      points
    };
    this.broadcast(room);
    room.timer = setTimeout(() => {
      room.round += 1;
      if (room.round >= room.settings.rounds) {
        room.phase = "FINISHED";
        room.currentQuestion = null;
        this.broadcast(room);
      } else {
        this.beginCountdown(room);
      }
    }, 9000);
  }

  private context(socket: GameSocket): { room: RoomInternal; player: PlayerInternal } | null {
    const link = this.socketRoom.get(socket.id);
    if (!link) return null;
    const room = this.rooms.get(link.roomCode);
    const player = room?.players.get(link.playerToken);
    return room && player ? { room, player } : null;
  }

  private leave(socket: GameSocket): void {
    const context = this.context(socket);
    if (!context) return;
    context.room.players.delete(context.player.token);
    socket.leave(context.room.code);
    this.socketRoom.delete(socket.id);
    if (!context.room.players.size) {
      this.clearTimer(context.room);
      this.rooms.delete(context.room.code);
    } else {
      if (context.player.isHost) this.promoteHost(context.room);
      this.broadcast(context.room);
    }
  }

  private disconnect(socket: GameSocket): void {
    const context = this.context(socket);
    this.socketRoom.delete(socket.id);
    if (!context) return;
    context.player.connected = false;
    context.player.socketId = null;
    this.broadcast(context.room);
  }

  private promoteHost(room: RoomInternal): void {
    const next = [...room.players.values()].find((p) => p.connected) ?? [...room.players.values()][0];
    for (const p of room.players.values()) p.isHost = p === next;
    room.hostToken = next.token;
  }

  private broadcast(room: RoomInternal): void {
    this.io.to(room.code).emit("room:state", this.publicState(room));
  }

  private publicState(room: RoomInternal): PublicRoomState {
    return {
      code: room.code, phase: room.phase, settings: room.settings,
      players: [...room.players.values()].map(({ token: _t, socketId: _s, answerTimes: _a, lastAnswerAt: _l, ...publicPlayer }) => publicPlayer),
      round: Math.min(room.round + 1, room.settings.rounds), totalRounds: room.settings.rounds,
      serverNow: Date.now(), countdownEndsAt: room.countdownEndsAt,
      roundStartedAt: room.roundStartedAt, roundEndsAt: room.roundEndsAt,
      thumbnailUrl: room.phase === "PLAYING" ? room.currentQuestion?.thumbnailUrl ?? null : null,
      result: room.phase === "RESULT" || room.phase === "FINISHED" ? room.result : null
    };
  }

  private clearTimer(room: RoomInternal): void {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
  }
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(Number(value) || min)));
}

function validViewCount(value: number | undefined): boolean {
  return value === undefined || [0, 10_000, 100_000, 1_000_000, 10_000_000].includes(value);
}
