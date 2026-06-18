# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

**EC-app** — ECサイトのデータを可視化・分析するWebアプリケーション。  
技術スタック: HTML / CSS / JavaScript（バンドラー・フレームワーク不使用のバニラ構成）

データソースは `../分析アプリ/` ディレクトリ以下のCSVファイル（楽天など）。

## 開発・実行

ビルドステップは不要。HTMLファイルをブラウザで直接開くか、ローカルサーバーを使用する。

```bash
# Python が使える場合（推奨）
python -m http.server 8000
# Node.js が使える場合
npx serve .
```

ブラウザで `http://localhost:8000` を開いてアプリを確認する。

## データフロー

1. ユーザーがCSVファイル（楽天売上データ等）を読み込む
2. JavaScriptでパース・集計処理を行う
3. 結果をグラフ・表としてHTMLに描画する

CSVの文字コードはShift-JIS（楽天標準）の可能性があるため、読み込み時にエンコーディングを考慮する。

## コーディング規約

- JavaScriptはES Modulesを使用する場合 `<script type="module">` を利用する
- CSSはファイル分割せずシングルファイルで管理してもよいが、コンポーネントが増えたら分離する
- グローバル変数の多用を避け、関数・モジュールでスコープを管理する
