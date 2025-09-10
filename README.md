# ObsidianMCP

[![npm version](https://badge.fury.io/js/obsidian-mcp.svg)](https://badge.fury.io/js/obsidian-mcp)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

MCP (Model Context Protocol) server that enables Claude Desktop to seamlessly interact with your Obsidian vaults, providing AI-powered note management and knowledge base operations.

MCP（Model Context Protocol）サーバーを使用して、Claude DesktopとObsidian保管庫をシームレスに連携させ、AI支援によるノート管理とナレッジベース操作を実現します。

## Features / 機能

**🎯 Complete Feature Set: 59 Functions / 完全機能セット：59の機能**

### 🏗️ Core Features / コア機能 (17 functions)

- 🔍 **Automatic Vault Discovery** - Automatically finds all Obsidian vaults on your system
- 📝 **Smart Note Management** - Create, read, update, delete, move notes with automatic title extraction and frontmatter support
- 🎯 **Intelligent Title Handling** - Automatically extracts titles from H1 headings or generates timestamp-based titles when not specified
- 🔐 **User Confirmation System** - Mandatory confirmation for all note creation and deletion operations with detailed folder status
- 🔐 **File Locking & Link Updates** - Detects concurrent editing and updates links when moving files
- 🏷️ **Tag Management** - Create, analyze, and manage tags across your vault
- 🔎 **Full-Text Search** - Search content across all notes with regex support
- 📁 **Folder Operations** - Create, move, delete folders with automatic link updates and path validation
- 🔗 **Backlink Analysis** - Find notes that link to a specific note

### 📚 Book Search Plugin / 書籍検索プラグイン (14 functions)

- 📖 **Advanced Book Search** - Search books by ISBN, title, author across multiple APIs
- 📝 **Automated Book Notes** - Create reading notes with metadata, reviews, and progress tracking
- 📊 **Reading Lists** - Manage reading lists with progress tracking
- 🔗 **Book Connections** - Link books to existing notes and create book networks
- 📤 **Export System** - Export book data in multiple formats

### 🎯 Templater Plugin / テンプレートプラグイン (6 functions)

- 📋 **Advanced Template Management** - Create, list, and apply templates with variable processing
- 🎨 **Custom Template Creation** - Build templates with Templater syntax support
- 📁 **Custom Folder Support** - Save templates in user-specified folders
- 🔄 **Template Processing** - Full Templater syntax processing with variables and functions

### ✅ Tasks Plugin / タスクプラグイン (6 functions)

- 📝 **Task Creation** - Create tasks with Obsidian Tasks plugin format including priorities, dates, and tags
- 📋 **Task Management** - List and filter tasks by status, priority, project, tags, and dates
- 🔄 **Status Updates** - Update task status (complete, in-progress, cancelled, etc.)
- 📊 **Task Analytics** - Get comprehensive task statistics and progress tracking
- 🔴 **Overdue Detection** - Automatically find and list overdue tasks
- 📁 **Project Organization** - Group and manage tasks by project

### 🎯 Kanban Plugin / Kanbanプラグイン (8 functions)

- 🎪 **Board Management** - Create and manage Kanban boards with customizable lanes
- 📝 **Card Operations** - Add, update, move, and delete cards with rich metadata
- 🔄 **Workflow Automation** - Move cards between lanes to track project progress
- 👥 **Team Collaboration** - Assign cards to team members with due dates and tags
- 📊 **Board Analytics** - Get comprehensive board statistics and lane-by-lane breakdowns
- 📦 **Archive System** - Archive completed cards for historical tracking
- 🔍 **Board Discovery** - List and search all Kanban boards across the vault
- ✅ **Checklist Support** - Add checklist items to cards for detailed task breakdown

### 📊 Vault Analytics Plugin / 保管庫分析プラグイン (4 functions)

- 📁 **Structure Analysis** - Analyze vault folder structure and file distribution
- 📈 **Writing Statistics** - Track word counts, writing frequency, and productivity
- 🔍 **Orphan Note Detection** - Find notes with no incoming or outgoing links
- 🕸️ **Link Graph Generation** - Visualize note connections and network topology

### 🤖 AI Analysis Plugin / AI分析プラグイン (3 functions)

- 📄 **Note Summarization** - Generate summaries of note content with key points
- 📋 **Outline Generation** - Create hierarchical outlines from note content
- 🏷️ **Smart Tag Suggestions** - AI-powered tag recommendations based on content

### 📝 Time-based Notes / 時系列ノート (2 functions)

- 📅 **Daily Note Creation** - Create daily notes with template selection prompts
- 📅 **Weekly Note Creation** - Create weekly notes with customizable date formats

### 🔍 Advanced Search & Maintenance / 高度検索・メンテナンス (2 functions)

- 📅 **Date Range Search** - Find notes by creation/modification date with flexible filtering
- 🔗 **Broken Link Validation** - Detect and automatically repair broken links with smart suggestions

---

### 🏗️ コア機能 (17機能)

- 🔍 **保管庫自動探索** - システム内のすべてのObsidian保管庫を自動検出
- 📝 **スマートノート管理** - 自動タイトル抽出・フロントマター対応でノートの作成・読取・更新・削除・移動
- 🎯 **インテリジェントタイトル処理** - H1見出しからの自動タイトル抽出、未指定時のタイムスタンプベースタイトル生成
- 🔐 **ユーザー確認システム** - 詳細フォルダ状態表示付きノート作成・削除時の必須確認
- 🔐 **ファイルロック・リンク更新** - 同時編集検出とファイル移動時のリンク自動更新
- 🏷️ **タグ管理** - 保管庫全体のタグを作成・分析・管理
- 🔎 **全文検索** - 正規表現対応の全ノート検索
- 📁 **フォルダ操作** - パス検証・リンク自動更新付きフォルダの作成・移動・削除
- 🔗 **バックリンク分析** - 特定のノートにリンクしているノートを発見

### 📚 書籍検索プラグイン (14機能)

- 📖 **高度書籍検索** - ISBN、タイトル、著者で複数API横断検索
- 📝 **自動書籍ノート** - メタデータ、レビュー、進捗追跡付き読書ノート作成
- 📊 **読書リスト** - 進捗追跡付き読書リスト管理
- 🔗 **書籍関連付け** - 既存ノートとの関連付けと書籍ネットワーク作成
- 📤 **エクスポート** - 複数形式での書籍データエクスポート

### 🎯 テンプレートプラグイン (6機能)

- 📋 **高度テンプレート管理** - 変数処理付きテンプレートの作成・一覧・適用
- 🎨 **カスタムテンプレート作成** - Templater構文対応テンプレート構築
- 📁 **カスタムフォルダ対応** - ユーザー指定フォルダでのテンプレート保存
- 🔄 **テンプレート処理** - 変数・関数付きTemplater構文完全処理

### 📋 タスクノートプラグイン (6機能)

- ✅ **タスク管理** - ステータス追跡付きタスクノート作成・管理
- 🎯 **優先度システム** - 優先度別（高・中・低）タスク整理
- 📅 **日付ベースタスク** - 日付範囲・期限別タスク検索
- 🗂️ **プロジェクト整理** - プロジェクト・コンテキスト別タスクグループ化

### 📊 保管庫分析プラグイン (4機能)

- 📁 **構造分析** - 保管庫フォルダ構造・ファイル分布分析
- 📈 **執筆統計** - 文字数、執筆頻度、生産性追跡
- 🔍 **孤立ノート検出** - 入出力リンクのないノート発見
- 🕸️ **リンクグラフ生成** - ノート接続・ネットワーク構造可視化

### 🤖 AI分析プラグイン (3機能)

- 📄 **ノート要約** - キーポイント付きノート内容要約生成
- 📋 **アウトライン生成** - ノート内容から階層アウトライン作成
- 🏷️ **スマートタグ提案** - 内容ベースAI駆動タグ推薦

### 📝 時系列ノート (2機能)

- 📅 **デイリーノート作成** - テンプレート選択確認付き日次ノート作成
- 📅 **週次ノート作成** - カスタマイズ可能な日付形式での週次ノート作成

### 🔍 高度検索・メンテナンス (2機能)

- 📅 **日付範囲検索** - 柔軟フィルタリング付き作成・更新日別ノート検索
- 🔗 **壊れたリンク検証** - スマート提案付き壊れたリンク検出・自動修復

## Installation / インストール方法

### Prerequisites / 前提条件

- Claude Desktop app / Claude Desktopアプリ
- Node.js v18 or higher / Node.js v18以上
- At least one Obsidian vault / 最低1つのObsidian保管庫

### Required Obsidian Community Plugins / 必要なObsidianコミュニティプラグイン

For full functionality, install these Obsidian community plugins:
全機能を使用するには、以下のObsidianコミュニティプラグインをインストールしてください：

| Plugin Name     | GitHub URL                                             | Purpose / 用途                                                                                         |
| --------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| **Templater**   | https://github.com/SilentVoid13/Templater              | Template processing with variables and JavaScript functions / 変数・JavaScript関数付きテンプレート処理 |
| **Tasks**       | https://github.com/obsidian-tasks-group/obsidian-tasks | Task management with rich formatting and filtering / リッチフォーマット・フィルタリング付きタスク管理     |
| **Kanban**      | https://github.com/mgmeyers/obsidian-kanban            | Markdown-backed Kanban boards for project management / マークダウンベースKanbanボード・プロジェクト管理  |
| **Book Search** | https://github.com/anpigon/obsidian-book-search-plugin | Book search and reading note management / 書籍検索・読書ノート管理                                     |
| **Dataview**    | https://github.com/blacksmithgu/obsidian-dataview      | Dynamic content queries and data visualization / 動的コンテンツクエリ・データ可視化                    |

### Optional Community Plugins / オプションのコミュニティプラグイン

These plugins enhance functionality but are not required:
これらのプラグインは機能を強化しますが必須ではありません：

| Plugin Name         | GitHub URL                                             | Purpose / 用途                                                         |
| ------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| **Calendar**        | https://github.com/liamcain/obsidian-calendar-plugin   | Better date-based note navigation / 日付ベースノートナビゲーション改善 |
| **Tag Wrangler**    | https://github.com/pjeby/tag-wrangler                  | Advanced tag management / 高度なタグ管理                               |
| **Advanced Tables** | https://github.com/tgrosinger/advanced-tables-obsidian | Enhanced table editing / テーブル編集機能強化                          |

### Step 1: Download and Build / ダウンロードとビルド

```bash
# Clone the repository / リポジトリをクローン
git clone https://github.com/rei-Nempi/obsidian-mcp.git
cd obsidian-mcp

# Install dependencies / 依存関係をインストール
npm install

# Build the project / プロジェクトをビルド
npm run build:enhanced
```

### Step 2: Configure Claude Desktop / Claude Desktopの設定

Find your Claude Desktop configuration file:
Claude Desktopの設定ファイルを見つけます：

| OS          | Config File Location / 設定ファイルの場所                         |
| ----------- | ----------------------------------------------------------------- |
| **Mac**     | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Windows** | `%APPDATA%\Claude\claude_desktop_config.json`                     |
| **Linux**   | `~/.config/Claude/claude_desktop_config.json`                     |

Open the file and add the following configuration:
ファイルを開いて以下の設定を追加します：

```json
{
  "mcpServers": {
    "obsidian-mcp": {
      "command": "node",
      "args": ["/YOUR/PATH/TO/obsidian-mcp/dist/index-enhanced.js"]
    }
  }
}
```

**Example for Mac / Macの例:**

```json
{
  "mcpServers": {
    "obsidian-mcp": {
      "command": "node",
      "args": ["/Users/username/Documents/obsidian-mcp/dist/index-enhanced.js"]
    }
  }
}
```

**Example for Windows / Windowsの例:**

```json
{
  "mcpServers": {
    "obsidian-mcp": {
      "command": "node",
      "args": [
        "C:\\Users\\username\\Documents\\obsidian-mcp\\dist\\index-enhanced.js"
      ]
    }
  }
}
```

⚠️ **Important Notes / 重要な注意事項:**

- Use absolute paths, not relative paths / 相対パスではなく絶対パスを使用
- On Windows, use double backslashes `\\` or forward slashes `/` / Windowsでは二重バックスラッシュ`\\`またはスラッシュ`/`を使用
- Make sure the path points to `dist/index-enhanced.js` / パスが`dist/index-enhanced.js`を指していることを確認

### Step 3: Restart Claude Desktop / Claude Desktopを再起動

After saving the configuration file, completely quit and restart Claude Desktop.
設定ファイルを保存後、Claude Desktopを完全に終了して再起動します。

### Verify Installation / インストールの確認

In Claude Desktop, try:
Claude Desktopで以下を試してください：

```
"List all my Obsidian vaults"
```

If successful, you'll see a list of discovered Obsidian vaults.
成功すると、検出されたObsidian保管庫のリストが表示されます。

## Usage / 使用方法

📖 **For detailed usage instructions and examples, see [USAGE.md](USAGE.md)**  
📖 **詳細な使用方法と例については、[USAGE.md](USAGE.md)をご覧ください**

### Quick Start / クイックスタート

Once configured, you can use natural language commands in Claude:
設定完了後、Claudeで自然言語コマンドを使用できます:

```
"List all my Obsidian vaults"
"Select my main vault and analyze its structure"
"Create a new note with automatic title extraction from content"
"Create a daily note with template selection"
"Search for notes about 'project planning' from last week"
"Find and fix any broken links in my vault"
"Summarize the content of my meeting notes"
"Show me writing statistics for the past month"
```

## Available Commands / 利用可能なコマンド

**📋 Complete Command Reference: [USAGE.md](USAGE.md) contains detailed examples for all 59 functions**  
**📋 完全コマンドリファレンス：[USAGE.md](USAGE.md)に全59機能の詳細例があります**

### Core Commands / コアコマンド (17 functions)

| Command                          | Description                                    | 説明                                     |
| -------------------------------- | ---------------------------------------------- | ---------------------------------------- |
| `list_vaults`                    | Find all Obsidian vaults                       | すべてのObsidian保管庫を検索             |
| `select_vault`                   | Choose which vault to work with                | 作業する保管庫を選択                     |
| `create_note` / `write_note`     | Create/update notes with smart title handling  | スマートタイトル処理付きノート作成・更新 |
| `create_from_template`           | Create notes from templates with confirmation  | 確認機能付きテンプレートからノート作成   |
| `read_note`                      | Read existing note content                     | 既存ノート内容読取                       |
| `move_note`                      | Move/rename notes with link updates            | リンク更新付きノート移動・リネーム       |
| `delete_note`                    | Delete notes safely with confirmation         | 確認機能付きノート安全削除               |
| `list_notes`                     | List notes with filtering                      | フィルタリング付きノート一覧             |
| `search_notes`                   | Search notes by content/regex                  | 内容・正規表現でノート検索               |
| `get_backlinks`                  | Find notes linking to target                   | 対象にリンクするノート検索               |
| `get_note_info`                  | Get note metadata and links                    | ノートメタデータ・リンク取得             |
| `list_tags` / `get_notes_by_tag` | Tag management and filtering                   | タグ管理・フィルタリング                 |
| `create_folder` / `move_folder`  | Folder operations with link updates            | リンク更新付きフォルダ操作               |

### Analytics & AI Commands / 分析・AIコマンド (9 functions)

| Command                   | Description                         | 説明                         |
| ------------------------- | ----------------------------------- | ---------------------------- |
| `analyze_vault_structure` | Analyze vault folder structure      | 保管庫フォルダ構造分析       |
| `get_writing_stats`       | Writing statistics and productivity | 執筆統計・生産性分析         |
| `find_orphan_notes`       | Find unlinked notes                 | 未リンクノート検索           |
| `get_link_graph`          | Generate link network graph         | リンクネットワークグラフ生成 |
| `summarize_note`          | AI-powered note summarization       | AI駆動ノート要約             |
| `generate_note_outline`   | Create hierarchical outlines        | 階層アウトライン作成         |
| `suggest_tags`            | Smart tag recommendations           | スマートタグ推薦             |
| `get_notes_by_date_range` | Search notes by date                | 日付範囲ノート検索           |
| `validate_broken_links`   | Find and fix broken links           | 壊れたリンク検出・修復       |

### Template & Task Commands / テンプレート・タスクコマンド (13 functions)

| Command                                       | Description                       | 説明                               |
| --------------------------------------------- | --------------------------------- | ---------------------------------- |
| `list_templates` / `list_available_templates` | List available templates          | 利用可能テンプレート一覧           |
| `create_template` / `create_custom_template`  | Create custom templates           | カスタムテンプレート作成           |
| `apply_template` / `apply_template_to_note`   | Apply templates to notes          | ノートにテンプレート適用           |
| `create_daily_note`                           | Create daily notes with templates | テンプレート付き日次ノート作成     |
| `create_task_note`                            | Create task-oriented notes        | タスク指向ノート作成               |
| `list_task_notes`                             | List task notes with filtering    | フィルタリング付きタスクノート一覧 |
| `get_tasks_by_status`                         | Filter tasks by completion status | 完了ステータス別タスクフィルタ     |
| `get_tasks_by_priority`                       | Filter tasks by priority level    | 優先度レベル別タスクフィルタ       |
| `get_tasks_by_date_range`                     | Find tasks in date range          | 日付範囲内タスク検索               |

### Book Search Commands / 書籍検索コマンド (14 functions)

| Command                              | Description                         | 説明                         |
| ------------------------------------ | ----------------------------------- | ---------------------------- |
| `search_books`                       | Search books across multiple APIs   | 複数API横断書籍検索          |
| `get_book_details`                   | Get detailed book information       | 詳細書籍情報取得             |
| `create_book_note`                   | Create reading notes from book data | 書籍データから読書ノート作成 |
| `list_book_notes`                    | List all book-related notes         | 書籍関連ノート一覧           |
| `create_reading_list`                | Manage reading lists                | 読書リスト管理               |
| `get_reading_progress`               | Track reading progress              | 読書進捗追跡                 |
| And 8 more book-related functions... | その他8つの書籍関連機能...          | [詳細はUSAGE.md参照]         |

## Troubleshooting / トラブルシューティング

### Vault Not Found / 保管庫が見つからない

- Ensure your vault contains a `.obsidian` folder / 保管庫に`.obsidian`フォルダがあることを確認
- Check that the vault path is accessible / 保管庫パスがアクセス可能か確認
- Try setting `OBSIDIAN_VAULT_PATH` environment variable / 環境変数`OBSIDIAN_VAULT_PATH`を設定

### Permission Errors / 権限エラー

- Make sure you have read/write access to your vault / 保管庫への読み書き権限を確認
- On macOS, grant Terminal/Claude full disk access in System Preferences / macOSではシステム環境設定でフルディスクアクセスを許可

### Claude Desktop Not Connecting / Claude Desktopが接続しない

1. Restart Claude Desktop after configuration / 設定後Claude Desktopを再起動
2. Check the config file exists at the correct location / 設定ファイルが正しい場所にあるか確認
3. Verify the path to `index-enhanced.js` is absolute / `index-enhanced.js`へのパスが絶対パスか確認

## License / ライセンス

This project is licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License - see the [LICENSE](LICENSE) file for details.
このプロジェクトはCreative Commons 表示-非営利-継承 4.0 国際ライセンスの下でライセンスされています - 詳細は[LICENSE](LICENSE)ファイルを参照してください。

**Commercial use is strictly prohibited. This software is for personal, educational, and non-profit use only.**
**商用利用は厳格に禁止されています。このソフトウェアは個人利用、教育目的、非営利目的でのみ使用可能です。**

### What you can do / 許可されること
- ✅ Personal use / 個人利用
- ✅ Educational use / 教育目的での使用  
- ✅ Non-profit use / 非営利目的での使用
- ✅ Modify and distribute / 改変・配布

### What you cannot do / 禁止されること
- ❌ Sell this software / このソフトウェアの販売
- ❌ Use in paid services / 有料サービスでの使用
- ❌ Generate revenue from this software / このソフトウェアからの収益生成
- ❌ Commercial integration / 商用統合

For commercial licensing, please contact the project maintainers.
商用ライセンスについては、プロジェクトメンテナーにお問い合わせください。
