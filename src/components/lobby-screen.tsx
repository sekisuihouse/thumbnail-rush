"use client";

import type { GameSettings, PublicRoomState } from "@/types/game";

interface Props {
  state: PublicRoomState;
  playerId: string | null;
  error: string;
  onSettings: (update: Partial<GameSettings>) => void;
  onStart: () => void;
  onLeave: () => void;
}

export function LobbyScreen({ state, playerId, error, onSettings, onStart, onLeave }: Props) {
  const me = state.players.find((player) => player.id === playerId);
  const isHost = Boolean(me?.isHost);
  const preparing = state.phase === "PREPARING";
  const copyCode = () => navigator.clipboard.writeText(state.code).catch(() => undefined);
  return (
    <main className="shell lobby">
      <header className="topbar"><div className="miniBrand">▶ THUMBNAIL RUSH</div><button className="ghost" onClick={onLeave}>退出</button></header>
      <section className="roomHero">
        <p className="eyebrow">ROOM CODE</p>
        <button className="roomCode" onClick={copyCode} title="クリックしてコピー">{state.code}</button>
        <p className="muted">クリックでコピーして友達に共有</p>
      </section>
      <div className="lobbyGrid">
        <section className="panel">
          <div className="sectionTitle"><h2>PLAYERS</h2><span>{state.players.length}人</span></div>
          <div className="playerList">
            {state.players.map((player) => <div className="player" key={player.id}>
              <span className={`presence ${player.connected ? "online" : ""}`} />
              <strong>{player.name}</strong>{player.isHost && <small>HOST</small>}
            </div>)}
          </div>
        </section>
        <section className="panel settings">
          <div className="sectionTitle"><h2>GAME SETTINGS</h2>{!isHost && <span>ホストが設定中</span>}</div>
          <Setting label="ラウンド数"><select disabled={!isHost || preparing} value={state.settings.rounds} onChange={(e) => onSettings({ rounds: Number(e.target.value) })}>{[3,5,7,10,15,20].map(v => <option key={v}>{v}</option>)}</select></Setting>
          <Setting label="制限時間"><select disabled={!isHost || preparing} value={state.settings.roundSeconds} onChange={(e) => onSettings({ roundSeconds: Number(e.target.value) })}>{[30,60,90,120,180,300].map(v => <option key={v} value={v}>{v}秒</option>)}</select></Setting>
          <Setting label="検索の深さ"><select disabled={!isHost || preparing} value={state.settings.searchDepth} onChange={(e) => onSettings({ searchDepth: Number(e.target.value) })}>{[1,2,3,4,5].map(v => <option key={v} value={v}>LEVEL {v}</option>)}</select></Setting>
          <Setting label="最低再生回数"><select disabled={!isHost || preparing} value={state.settings.minViewCount} onChange={(e) => onSettings({ minViewCount: Number(e.target.value) })}><option value={0}>制限なし</option><option value={10000}>1万回以上</option><option value={100000}>10万回以上</option><option value={1000000}>100万回以上</option><option value={10000000}>1000万回以上</option></select></Setting>
          <Setting label="言語"><select disabled={!isHost || preparing} value={state.settings.language} onChange={(e) => onSettings({ language: e.target.value as GameSettings["language"] })}><option value="mixed">日本語 + English</option><option value="ja">日本語のみ</option><option value="en">English only</option></select></Setting>
          <div className="settingBlock"><label>DIFFICULTY</label><div className="difficulty">{(["EASY","NORMAL","HARD","CHAOS"] as const).map(value => <button key={value} disabled={!isHost || preparing} className={state.settings.difficulty === value ? "active" : ""} onClick={() => onSettings({ difficulty: value })}>{value}</button>)}</div></div>
        </section>
      </div>
      {error && <p className="error lobbyError" role="alert">{error}</p>}
      {isHost ? <button className="primary start" disabled={preparing} onClick={onStart}>{preparing ? "YouTubeから問題を抽選中..." : "ゲームを開始"} <span>{preparing ? "•••" : "→"}</span></button> : <p className="waiting">{preparing ? "YouTubeから問題を抽選しています" : "ホストの開始を待っています"}<span className="dots">•••</span></p>}
    </main>
  );
}

function Setting({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="setting"><label>{label}</label>{children}</div>;
}
