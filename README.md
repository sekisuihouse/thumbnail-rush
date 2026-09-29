# Thumbnail Rush

YouTube の公式サムネイルだけを見て元動画のタイトルを探し、最初に当てた人が得点するリアルタイム早押しゲームです。6桁のコードを共有するだけで、PC・スマートフォンから同じルームに参加できます。

## オンラインで遊ぶ

<https://thumbnail-rush-production.up.railway.app>

ホストがルームを作り、表示された6桁コードを参加者へ共有してください。

## 実装機能

- ルーム作成・6桁コード参加・ホスト権限・再接続
- 同期された `3 → 2 → 1 → GO!` とサーバー基準タイマー
- Socket.IO によるリアルタイム状態配信
- サーバー到着順の早押し判定、回答レート制限、入力サニタイズ
- NFKC・大小文字・全半角・連続空白の正規化と厳しめの類似度判定
- スピードボーナス、ラウンド順位、最終統計
- 難易度、検索深度、最低再生回数、言語、ラウンド数、制限時間の設定
- ゲーム開始ごとにYouTube APIから全ラウンドの問題を新規抽選
- 深い検索ページ、重複、ライブ、非公開、短尺偏重、チャンネル偏重、画像不達のフィルター
- 1万語以上へ生成拡張できるカテゴリ別検索語システム
- ロジックのユニットテスト

## アーキテクチャ

```text
ゲーム時
Browser A ─┐
Browser B ─┼─ Socket.IO ─ Node/Next.js ─ server-side GameManager
Browser C ─┘                         └─ YouTube Data API
                                             ↑
                                  data/search-words/*.json
```

Socket.IO + 常駐 Node.js を選んだ理由は、数人〜数十人の低遅延対戦をシンプルにサーバー権威型で実装でき、Railway / Render / Fly.io へデプロイしやすいためです。正解タイトル、動画ID、チャンネル、検索語はプレイ中のクライアントへ送られません。回答・得点・時刻・ラウンド状態はすべてサーバーが確定します。

ゲーム開始時に、各ラウンドについて異なるカテゴリの検索語2つを抽選し、YouTube検索のランダムな深さまで`nextPageToken`で進みます。そのページから条件に合う動画を1本だけ選びます。同一ゲーム中に選ばれた`videoId`は集合で管理し、再選択を拒否します。ランタイムのルームはメモリ上に置きます。

## 必要環境

- Node.js 20 以上
- npm 10 以上
- 問題を追加生成する場合のみ Google Cloud の YouTube Data API v3 キー

画面表示とロビー作成はAPIキーなしでも確認できますが、ゲーム開始にはYouTube APIキーが必須です。

## インストールとローカル起動

```bash
git clone https://github.com/sekisuihouse/thumbnail-rush.git
cd thumbnail-rush
npm install
cp .env.example .env.local
npm run dev
```

ブラウザで <http://localhost:3000> を開きます。別ブラウザまたはシークレットウィンドウでも開き、発行されたコードを入力すると対戦を確認できます。同一LANの端末から試す場合は、PCのローカルIPアドレス（例 `http://192.168.1.10:3000`）を開いてください。

## YouTube API キーの取得

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成します。
2. 「APIとサービス」→「ライブラリ」で **YouTube Data API v3** を有効化します。
3. 「認証情報」から API キーを作ります。
4. APIキーには可能なら YouTube Data API v3 のAPI制限を設定します。
5. `.env.local` に保存します。

```env
YOUTUBE_API_KEY=your_key_here
PORT=3000
QUESTION_POOL_TARGET=1000
```

`.env.local` は `.gitignore` 済みです。クライアントへ公開される `NEXT_PUBLIC_` 接頭辞を付けないでください。

## 検索語と問題生成

カテゴリ別の種辞書は `data/search-words/` にあります。先に組み合わせ展開ファイルを作ると1万語以上へ増やせます。

```bash
npm run generate-words
npm run generate-questions
```

生成数、言語、最大検索ページ数は引数でも指定できます。

```bash
npm run generate-questions -- --target=1000 --language=mixed --depth=4
```

ジェネレーターは異なるカテゴリから2語を選び、1〜`depth`ページを`nextPageToken`で辿ります。到達したページの候補を最大50件まとめて検証・保存するため、「1問につき毎回検索」より大幅にクォータを節約します。検索レスポンスは `data/cache/` に保存し、同じクエリ・ページを再利用します。動画詳細取得は50件を一括処理します。

フィルター対象は、非公開、埋め込み不可、ライブ、空タイトル、不達サムネイル、重複動画、同一チャンネル過多です。60秒未満の動画は80%を間引き、Shortsだけに偏るのを防ぎます。サムネイルは `maxres → standard → high → medium → default` の順で採用します。書き込みは反復ごとに行うため、途中停止しても取得済み問題は残ります。

### クォータ上の注意

YouTube Data API の `search.list` は通常 **1回100 units**、`videos.list` は **1回1 unit** です。現在は指定どおりゲーム開始ごと・ラウンドごとに新しい検索を行います。概算消費は `ラウンド数 × 到達ページ数 × 100` に候補詳細取得分を加えた値です。5ラウンドを平均3ページ検索すると約1,500 units以上を消費します。条件に合う候補がなく再検索した場合はさらに増えます。

## DB設定

外部DBは不要です。`data/questions.json` は開発・検証用のシードと管理スクリプトの出力先ですが、通常ゲームの選定には使いません。ゲームごとの問題と使用済み`videoId`はサーバーメモリで保持します。

大規模化する場合は `QuestionPool` の実装をPostgreSQLやD1へ差し替え、ルーム状態をRedisまたはDurable Objectsへ移してください。ゲームロジックと保存層は分離されています。

## マルチプレイヤーと不正対策

- `server.ts` が Next.js と Socket.IO を同じHTTPサーバーで起動
- `GameManager` がルームごとに唯一の状態を所有
- 回答はサーバー受信時刻で直列処理され、最初の正解後は即座に受付終了
- 700ms/回のプレイヤー別レート制限、最大200文字、制御文字除去
- 設定変更と開始はホストのみ
- 再接続時はブラウザ固有トークンで同じプレイヤーを復元
- 公開状態DTOには問題の正解メタデータを含めない

## テストと品質チェック

```bash
npm test
npm run typecheck
npm run build
```

タイトル正規化、正解判定、得点、ルームコード、別カテゴリ検索語抽選、難易度別問題抽選をテストします。TypeScript は `strict` です。

## デプロイ

### Railway（推奨）

1. このフォルダをGitHubリポジトリへpushします。
2. Railwayで **New Project → Deploy from GitHub repo** を選びます。
3. Variablesへ必要なら `YOUTUBE_API_KEY` を設定します（ゲーム実行だけなら不要）。
4. Build Commandを `npm run build`、Start Commandを `npm start` にします。
5. Settings → Networkingで公開ドメインを発行します。

Railwayが注入する `PORT` をサーバーが自動利用します。WebSocketも同じ公開URLを使います。

### Docker

```bash
docker build -t thumbnail-rush .
docker run --rm -p 3000:3000 thumbnail-rush
```

RenderやFly.ioでもDockerfileをそのまま利用できます。WebSocket対応の常駐サービスを選んでください。Vercelの通常Serverless Functionsは常駐Socket.IOサーバーを維持できないため、この構成のデプロイ先には適しません。

## 技術構成

- Next.js 16 / React 19 / TypeScript strict
- Socket.IO 4（WebSocket + polling fallback）
- カスタムNode HTTPサーバー
- Vitest
- YouTube Data API v3（ゲーム開始時の問題抽選）
- CSSによるレスポンシブなダークゲームUI

## 現在の制約

- ルームはメモリ保持のため、サーバー再起動で終了します。
- 単一Nodeインスタンス向けです。複数インスタンスへ水平分割する場合はSocket.IO Redis Adapterと共有状態ストアが必要です。
- YouTube側で後日削除されたシード問題は、次回ジェネレーター実行で自動再検証されません。定期的な再生成または検証コマンドの追加を推奨します。
- YouTube検索順位は地域・時期・API挙動で変化します。保存される `searchRank` は生成時に辿ったページ内の概算順位です。
- 画像からタイトルを探すというゲーム性上、検索エンジンや画像検索の使用そのものは防げません。友人同士のフェアプレイを前提とします。

## ディレクトリ

```text
src/app/              Next.js画面・スタイル
src/components/       ロビー、ゲーム、結果UI
src/lib/              正規化、得点、抽選など純粋ロジック
src/server/           ゲーム管理・YouTubeリアルタイム問題抽選
scripts/              検索語・問題生成
data/search-words/    カテゴリ別検索語
data/questions.json   問題DB
server.ts             Next.js + Socket.IOエントリ
```

## ライセンスとYouTube表示

コードの公開時は任意のライセンスを設定してください。サムネイルの権利は各動画の権利者に帰属します。本番公開時はYouTube API Services Terms of Serviceおよびブランドガイドラインを確認してください。
