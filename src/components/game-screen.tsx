"use client";

import { useEffect, useMemo, useState } from "react";
import type { PublicRoomState } from "@/types/game";

interface Props { state: PublicRoomState; playerId: string | null; feedback: string; onAnswer: (answer: string) => void; onLeave: () => void; }

export function GameScreen({ state, playerId, feedback, onAnswer, onLeave }: Props) {
  const [answer, setAnswer] = useState("");
  const [, tick] = useState(0);
  const offset = useMemo(() => Date.now() - state.serverNow, [state.serverNow]);
  useEffect(() => { const timer = setInterval(() => tick(v => v + 1), 100); return () => clearInterval(timer); }, []);
  useEffect(() => setAnswer(""), [state.round]);
  const serverNow = Date.now() - offset;
  if (state.phase === "COUNTDOWN") {
    const remaining = Math.max(0, (state.countdownEndsAt ?? serverNow) - serverNow);
    const text = remaining <= 1000 ? "GO!" : String(Math.ceil((remaining - 1000) / 1000));
    return <main className="countdown"><p>ROUND {state.round}</p><div key={text}>{text}</div><span>GET READY</span></main>;
  }
  if (state.phase === "RESULT") return <RoundResult state={state} serverNow={serverNow} onLeave={onLeave} />;
  const remainingMs = Math.max(0, (state.roundEndsAt ?? serverNow) - serverNow);
  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);
  const submit = () => { if (answer.trim()) { onAnswer(answer); setAnswer(""); } };
  return <main className="game shell">
    <header className="gameHeader"><div><span>ROUND</span><strong>{state.round} <i>/ {state.totalRounds}</i></strong></div><div className={`timer ${remainingMs < 15000 ? "danger" : ""}`}>{String(mins).padStart(2,"0")}:{String(secs).padStart(2,"0")}</div><div className="roomMini">ROOM {state.code}</div></header>
    <section className="thumbnailFrame">{state.thumbnailUrl && <img src={state.thumbnailUrl} alt="この動画のサムネイル" referrerPolicy="no-referrer" />}</section>
    <section className="answerArea"><p>この動画のタイトルは？</p><div className="answerRow"><input value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder="タイトルを入力..." maxLength={200} autoFocus /><button className="primary" onClick={submit}>回答</button></div><div className="feedback" aria-live="polite">{feedback}</div></section>
    <section className="playersStrip">{state.players.map(p => <div key={p.id} className={`playerChip ${p.id === playerId ? "me" : ""}`}><span>{p.name}</span><small>{p.status === "answered" ? "TRY AGAIN" : p.status === "correct" ? "FOUND IT!" : "SEARCHING..."}</small></div>)}</section>
  </main>;
}

function RoundResult({ state, serverNow, onLeave }: { state: PublicRoomState; serverNow: number; onLeave: () => void }) {
  const result = state.result;
  if (!result) return null;
  const sorted = [...state.players].sort((a,b) => b.score - a.score);
  return <main className="result shell">
    <header className="topbar"><div className="miniBrand">ROUND {state.round} RESULT</div><button className="ghost" onClick={onLeave}>退出</button></header>
    <p className="resultKicker">{result.winnerName ? <><strong>{result.winnerName}</strong> さんが正解！</> : "TIME UP — 正解者なし"}</p>
    <div className="resultGrid"><section><div className="resultThumb"><img src={result.thumbnailUrl} alt="正解動画のサムネイル" /></div><h1 className="answerTitle">{result.title}</h1><p className="channel">{result.channelTitle}</p><a className="youtube" href={`https://www.youtube.com/watch?v=${encodeURIComponent(result.videoId)}`} target="_blank" rel="noreferrer">YouTubeで見る ↗</a></section>
    <section className="panel ranking"><h2>RANKING</h2>{sorted.map((p, i) => <div className="rank" key={p.id}><b>{i+1}</b><span>{p.name}</span><strong>{p.score} pt</strong></div>)}</section></div>
    <p className="nextRound">次のラウンドまで {Math.max(0, Math.ceil(((state.serverNow + 9000) - serverNow) / 1000))} 秒</p>
  </main>;
}
