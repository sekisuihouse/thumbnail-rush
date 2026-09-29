"use client";
import type { PublicRoomState } from "@/types/game";

export function FinalScreen({ state, onLeave }: { state: PublicRoomState; onLeave: () => void }) {
  const sorted = [...state.players].sort((a,b) => b.score - a.score);
  const winner = sorted[0];
  return <main className="final shell"><p className="eyebrow">FINAL RESULT</p><h1>WINNER</h1><div className="winnerName">{winner?.name ?? "—"}</div><div className="podium panel">{sorted.map((p,i) => <div className="finalRow" key={p.id}><b>{i+1}</b><strong>{p.name}</strong><span><small>正解</small>{p.correctCount}</span><span><small>平均</small>{formatMs(p.averageAnswerMs)}</span><span><small>最速</small>{formatMs(p.fastestAnswerMs)}</span><em>{p.score} pt</em></div>)}</div><button className="primary" onClick={onLeave}>トップへ戻る</button></main>;
}
function formatMs(ms: number | null) { return ms === null ? "—" : `${(ms / 1000).toFixed(2)}s`; }
