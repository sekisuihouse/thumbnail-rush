"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HomeScreen } from "@/components/home-screen";
import { LobbyScreen } from "@/components/lobby-screen";
import { GameScreen } from "@/components/game-screen";
import { FinalScreen } from "@/components/final-screen";
import { getSocket } from "@/lib/client-socket";
import type { GameSettings, PublicRoomState } from "@/types/game";

const TOKEN_KEY = "thumbnail-rush-token";
const SESSION_KEY = "thumbnail-rush-session";

export default function Page() {
  const [state, setState] = useState<PublicRoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const sessionRef = useRef<{ code: string; name: string } | null>(null);
  const tokenRef = useRef("");

  useEffect(() => {
    tokenRef.current = localStorage.getItem(TOKEN_KEY) ?? crypto.randomUUID();
    localStorage.setItem(TOKEN_KEY, tokenRef.current);
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved) { try { sessionRef.current = JSON.parse(saved) as { code: string; name: string }; } catch { localStorage.removeItem(SESSION_KEY); } }
    const socket = getSocket();
    const onState = (next: PublicRoomState) => {
      setState(next);
      const me = next.players.find((p) => p.id === playerId) ?? next.players.find((p) => p.name === sessionRef.current?.name);
      if (me) setPlayerId(me.id);
    };
    const reconnect = () => {
      const session = sessionRef.current;
      if (session) socket.emit("room:join", { ...session, playerToken: tokenRef.current }, (response) => {
        if (response.ok) setPlayerId(response.playerId);
        else { localStorage.removeItem(SESSION_KEY); sessionRef.current = null; setState(null); }
      });
    };
    socket.on("room:state", onState);
    socket.on("room:error", setError);
    socket.on("answer:feedback", ({ message }) => { setFeedback(message); setTimeout(() => setFeedback(""), 1400); });
    socket.on("connect", reconnect);
    socket.connect();
    return () => { socket.off("room:state", onState); socket.off("room:error", setError); socket.off("connect", reconnect); socket.disconnect(); };
  }, []); // player identity is recovered by the persistent name/token session

  const enter = useCallback((name: string, code?: string) => {
    if (!name.trim()) {
      setError("名前を入力してください");
      return;
    }
    setBusy(true); setError(""); const socket = getSocket();
    const event = code ? "room:join" as const : "room:create" as const;
    const payload = code ? { code, name, playerToken: tokenRef.current } : { name, playerToken: tokenRef.current };
    socket.emit(event, payload as never, (response: { ok: boolean; code?: string; playerId?: string; error?: string }) => {
      setBusy(false);
      if (!response.ok || !response.code) return setError(response.error ?? "接続できませんでした");
      sessionRef.current = { name, code: response.code };
      if (response.playerId) setPlayerId(response.playerId);
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionRef.current));
    });
  }, []);
  const leave = () => { getSocket().emit("room:leave"); localStorage.removeItem(SESSION_KEY); sessionRef.current = null; setState(null); setPlayerId(null); };
  const settings = (update: Partial<GameSettings>) => { setError(""); getSocket().emit("room:update-settings", update, (r) => { if (!r.ok) setError(r.error); }); };
  const start = () => { setError(""); getSocket().emit("game:start", (r) => { if (!r.ok) setError(r.error); }); };
  const answer = (value: string) => getSocket().emit("answer:submit", { answer: value }, (r) => { if (!r.ok) { setFeedback(r.error); setTimeout(() => setFeedback(""), 1400); } });

  if (!state) return <HomeScreen busy={busy} error={error} onCreate={(name) => enter(name)} onJoin={(name, code) => enter(name, code)} />;
  if (state.phase === "LOBBY" || state.phase === "PREPARING") return <LobbyScreen state={state} playerId={playerId} error={error} onSettings={settings} onStart={start} onLeave={leave} />;
  if (state.phase === "FINISHED") return <FinalScreen state={state} onLeave={leave} />;
  return <GameScreen state={state} playerId={playerId} feedback={feedback} onAnswer={answer} onLeave={leave} />;
}
