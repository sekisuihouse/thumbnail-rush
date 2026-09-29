"use client";

import { useState } from "react";

interface Props {
  busy: boolean;
  error: string;
  onCreate: (name: string) => void;
  onJoin: (name: string, code: string) => void;
}

export function HomeScreen({ busy, error, onCreate, onJoin }: Props) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  return (
    <main className="home shell">
      <div className="brandMark">▶</div>
      <p className="eyebrow">REAL-TIME YOUTUBE HUNT</p>
      <h1>THUMBNAIL<br /><span>RUSH</span></h1>
      <p className="tagline">サムネだけを頼りに、元動画のタイトルを最速で見つけろ。</p>
      <section className="joinCard panel">
        <label>PLAYER NAME</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="あなたの名前" autoFocus />
        <button className="primary" disabled={busy} onClick={() => onCreate(name)}>
          {busy ? "接続中..." : "ルームを作る"}
        </button>
        <div className="or"><span>またはコードで参加</span></div>
        <div className="joinRow">
          <input className="codeInput" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} placeholder="A7K2PF" />
          <button disabled={busy || !name.trim() || code.length !== 6} onClick={() => onJoin(name, code)}>参加</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      <p className="footerNote">NO VIDEO. JUST ONE THUMBNAIL.</p>
    </main>
  );
}
