# ObsidianMCP Usage Guide / 使用方法ガイド

Complete usage instructions for all 53+ functions available in ObsidianMCP.  
ObsidianMCPで利用可能な53以上の機能の完全使用方法。

**You can use these commands in either English or Japanese - both languages work identically!**  
**これらのコマンドは英語でも日本語でも使用可能です - どちらの言語でも同じように動作します！**

## Table of Contents / 目次

- [First Time Setup / 初回セットアップ](#first-time-setup--初回セットアップ)
- [Core Functions / コア機能 (17 functions)](#core-functions--コア機能-17-functions)
- [Vault Analytics / 保管庫分析 (4 functions)](#vault-analytics--保管庫分析-4-functions)
- [AI Analysis / AI分析 (3 functions)](#ai-analysis--ai分析-3-functions)
- [Template Management / テンプレート管理 (6 functions)](#template-management--テンプレート管理-6-functions)
- [Task Notes / タスクノート (6 functions)](#task-notes--タスクノート-6-functions)
- [Book Search / 書籍検索 (14 functions)](#book-search--書籍検索-14-functions)
- [Daily Notes / デイリーノート (1 function)](#daily-notes--デイリーノート-1-function)
- [Advanced Search / 高度検索 (2 functions)](#advanced-search--高度検索-2-functions)

## First Time Setup / 初回セットアップ

### 1. Vault Discovery and Selection / 保管庫探索と選択

```
"List all my Obsidian vaults"
"私のObsidian保管庫を全て表示して"
"システム上のObsidian vaultを一覧表示してください"
```
Shows all detected Obsidian vaults on your system.  
システム上で検出されたすべてのObsidian保管庫を表示します。

```
"Select the vault at /Users/username/Documents/MyVault"
"/Users/username/Documents/MyVaultの保管庫を選択して"
"この保管庫パスを使用してください: /Users/username/Documents/MyVault"
```
Select a specific vault to work with.  
作業する特定の保管庫を選択します。

### 2. Initial Vault Analysis / 初期保管庫分析

```
"Analyze my vault structure and show statistics"
"Show me the overall structure of my vault" 
"Get writing statistics for my vault"
"保管庫の構造を分析して統計を表示して"
"私の保管庫の全体構造を見せて"
"執筆統計を取得してください"
```

## Core Functions / コア機能 (17 functions)

### Note Management / ノート管理

#### Create Notes / ノート作成
```
"Create a new note called 'Project Planning' in the Work folder"
"Write a note about machine learning in the Studies folder with tags #AI #learning"
"Workフォルダに「プロジェクト計画」というノートを作成して"
"Studiesフォルダに機械学習についてのノートを#AI #learningタグ付きで書いて"
```

#### Read Notes / ノート読取
```
"Read the note 'Meeting Notes' from yesterday"
"Show me the content of the note in Projects/Website Redesign"
"昨日の「会議ノート」を読んで"
"Projects/Website Redesignにあるノートの内容を見せて"
```

#### Update Notes / ノート更新
```
"Update my daily note with today's accomplishments"
"Add a new section to my project plan note"
"Append today's thoughts to my journal note"
"今日の成果をデイリーノートに更新して"
"プロジェクト計画ノートに新しいセクションを追加して"
"今日の考えをジャーナルノートに追記して"
```

#### Move and Rename / 移動とリネーム
```
"Move the note 'Old Project' to the Archive folder"
"Rename 'Draft' to 'Final Report' and update all links"
```

### Search and Discovery / 検索と発見

#### Content Search / 内容検索
```
"Search for all notes mentioning 'project deadline'"
"Find notes containing the word 'important' in the title"
"Search for notes with regex pattern 'TODO:.*urgent'"
"「プロジェクト締切」について言及しているノートを全て検索して"
"タイトルに「重要」という単語を含むノートを見つけて"
"正規表現パターン'TODO:.*緊急'でノートを検索して"
```

#### Tag Operations / タグ操作
```
"List all tags in my vault"
"Show me all notes tagged with #meeting"
"Find notes with tags #project and #urgent"
```

## Vault Analytics / 保管庫分析 (4 functions)

### Structure Analysis / 構造分析
```
"Analyze my vault structure and show folder statistics"
"Give me a detailed breakdown of my vault's organization"
```

### Writing Statistics / 執筆統計
```
"Show me my writing statistics for the past month"
"Calculate my productivity metrics and word count trends"
```

### Orphan Note Detection / 孤立ノート検出
```
"Find all orphan notes that aren't linked to anything"
"Show me notes with no incoming or outgoing links"
```

### Link Graph Analysis / リンクグラフ分析
```
"Generate a link graph of my note connections"
"Show me the network topology of my vault"
```

## AI Analysis / AI分析 (3 functions)

### Note Summarization / ノート要約
```
"Summarize the content of my 'Research Methods' note"
"Create a summary of my meeting notes with key points"
```

### Outline Generation / アウトライン生成
```
"Generate an outline for my 'Machine Learning Guide' note"
"Create a hierarchical structure for my research paper"
```

### Tag Suggestions / タグ提案
```
"Suggest relevant tags for my 'Data Science Project' note"
"Recommend tags based on the content of my study notes"
```

## Template Management / テンプレート管理 (6 functions)

### List and Create Templates / テンプレート一覧・作成
```
"List all available templates in my vault"
"Create a new meeting template with date, attendees, and action items"
"Build a project template with Templater variables"
```

### Apply Templates / テンプレート適用
```
"Create a note from my 'Meeting' template"
"Apply the 'Daily Note' template to create today's note"
```

## Task Notes / タスクノート (6 functions)

### Task Management / タスク管理
```
"Create a task note for implementing the new feature"
"List all my task notes"
"Show me all high-priority tasks"
"Find tasks created in the last 7 days"
```

## Book Search / 書籍検索 (14 functions)

### Search and Note Creation / 検索・ノート作成
```
"Search for books about 'machine learning algorithms'"
"Find books by author 'Malcolm Gladwell'"
"Create a reading note for option 2 from the search results"
"Create a reading list for data science books"
"「機械学習アルゴリズム」について書籍を検索して"
"マルコム・グラッドウェルの著作を検索して"
"検索結果の2番目の選択肢で読書ノートを作成して"
"データサイエンス本の読書リストを作成して"
```

## Daily Notes / デイリーノート (1 function)

### Create Daily Notes / デイリーノート作成
```
"Create today's daily note"
"Make a daily note for tomorrow with my meeting template"
"Create a daily note for 2024-01-15 using template selection"
"今日のデイリーノートを作成して"
"明日のデイリーノートを会議テンプレートで作成して"
"2024-01-15のデイリーノートをテンプレート選択で作成して"
```

## Advanced Search / 高度検索 (2 functions)

### Date Range Search / 日付範囲検索
```
"Find all notes created between 2024-01-01 and 2024-01-31"
"Show notes modified in the last week"
"Search for notes created this month in the Projects folder"
"2024-01-01から2024-01-31の間に作成されたノートを全て見つけて"
"過去1週間で変更されたノートを表示して"
"Projectsフォルダで今月作成されたノートを検索して"
```

### Broken Link Validation / 壊れたリンク検証
```
"Find and show me all broken links in my vault"
"Check for broken links in the Projects folder only"
"Find broken links and automatically fix obvious ones"
```

## Advanced Usage Tips / 高度な使用方法のヒント

### Combining Commands / コマンドの組み合わせ
```
"First analyze my vault structure, then find orphan notes, and suggest how to organize them"
"Search for notes about 'project planning' from last month, summarize key findings, and create an outline"
```

### Template Examples / テンプレート例

#### Meeting Template / 会議テンプレート
```markdown
# Meeting: {{title}}
**Date:** <% tp.date.now("YYYY-MM-DD") %>
**Attendees:** 
- [ ] 

## Agenda
1. 

## Action Items
- [ ] **[@person]** - Task - Due: 

Tags: #meeting #<% tp.date.now("YYYY") %>
```

#### Project Template / プロジェクトテンプレート
```markdown
# Project: {{title}}
**Status:** 🟡 In Progress
**Priority:** Medium

## Objective
- 

## Tasks
- [ ] 
- [ ] 

Tags: #project #active
```

## Best Practices / ベストプラクティス

1. **Use consistent folder structure** / 一貫したフォルダ構造を使用
2. **Implement a tagging strategy** / タグ戦略を実装
3. **Regular maintenance with analytics** / 分析を使った定期メンテナンス
4. **Create templates for recurring note types** / 定期的なノートタイプのテンプレートを作成

## Troubleshooting / トラブルシューティング

### Common Issues / よくある問題
- **Vault not found** / 保管庫が見つからない: Check .obsidian folder exists / .obsidianフォルダの存在確認
- **Template issues** / テンプレート問題: Ensure Templater plugin is enabled / Templaterプラグインの有効化確認
- **Search problems** / 検索問題: Verify file permissions and extensions / ファイル権限と拡張子の確認