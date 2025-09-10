# ObsidianMCP

[![npm version](https://badge.fury.io/js/obsidian-mcp.svg)](https://badge.fury.io/js/obsidian-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

MCP (Model Context Protocol) server that enables Claude Desktop to seamlessly interact with your Obsidian vaults, providing AI-powered note management and knowledge base operations.

MCP（Model Context Protocol）サーバーを使用して、Claude DesktopとObsidian保管庫をシームレスに連携させ、AI支援によるノート管理とナレッジベース操作を実現します。

## Features / 機能

### Core Features / コア機能
- 🔍 **Automatic Vault Discovery** - Automatically finds all Obsidian vaults on your system
- 📝 **Full Note Management** - Create, read, update, delete notes with frontmatter support
- 🔐 **File Locking** - Detects concurrent editing to prevent conflicts
- 🏷️ **Tag Management** - Create, analyze, and manage tags across your vault
- 🔎 **Full-Text Search** - Search content across all notes with regex support
- 📊 **Vault Analytics** - Analyze vault structure, statistics, and folder hierarchy

### Plugin Integration / プラグイン連携
- 📋 **Templater Support** - Use and process Templater templates with variables
- 📚 **Book Search Integration** - Search books by ISBN/title and create reading notes
  - Google Books API and Open Library support
  - Show up to 5 book candidates with detailed metadata
  - Easy selection with option numbers

---

- 🔍 **保管庫自動探索** - システム内のすべてのObsidian保管庫を自動検出
- 📝 **完全なノート管理** - フロントマター対応でノートの作成・読取・更新・削除
- 🔐 **ファイルロック** - 同時編集を検出して競合を防止
- 🏷️ **タグ管理** - 保管庫全体のタグを作成・分析・管理
- 🔎 **全文検索** - 正規表現対応の全ノート検索
- 📊 **保管庫分析** - 保管庫構造、統計、フォルダ階層の分析

### プラグイン統合
- 📋 **Templater対応** - 変数付きTemplaterテンプレートの使用と処理
- 📚 **書籍検索統合** - ISBN/タイトルで書籍を検索し読書ノートを作成
  - Google Books APIとOpen Library対応
  - 詳細メタデータ付きで最大5件の候補表示
  - オプション番号による簡単選択

## Installation / インストール方法

### Prerequisites / 前提条件
- Claude Desktop app / Claude Desktopアプリ
- Node.js v18 or higher / Node.js v18以上
- At least one Obsidian vault / 最低1つのObsidian保管庫

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

| OS | Config File Location / 設定ファイルの場所 |
|----|------------------------------------------|
| **Mac** | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Windows** | `%APPDATA%\Claude\claude_desktop_config.json` |
| **Linux** | `~/.config/Claude/claude_desktop_config.json` |

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
      "args": ["C:\\Users\\username\\Documents\\obsidian-mcp\\dist\\index-enhanced.js"]
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

## Configuration / 設定

### Environment Variables (Optional) / 環境変数（オプション）

Optional environment variables / オプションの環境変数:
```bash
# Default vault path / デフォルト保管庫パス
export OBSIDIAN_VAULT_PATH="~/Documents/MyVault"

# Google Books API key (for enhanced book search) / Google Books APIキー（書籍検索拡張用）
export GOOGLE_BOOKS_API_KEY="your-api-key-here"
```

## Usage in Claude / Claudeでの使用方法

Once configured, you can use natural language commands in Claude:
設定完了後、Claudeで自然言語コマンドを使用できます:

### First Time Setup / 初回セットアップ
```
"List all my Obsidian vaults"
"Select the Documents/Obsidian vault"
"Show me the vault structure"
"Analyze my vault and show statistics"
```

### Daily Usage / 日常的な使用

#### Note Operations / ノート操作
```
"Create a new note called 'Meeting Notes' in the Projects folder"
"Read the note 'Project Plan' from the Work folder"
"Update my daily note with today's tasks"
"Search for all notes mentioning 'project deadline'"
"Show me all notes tagged with #important"
```

#### Template Operations / テンプレート操作
```
"List all available templates"
"Create a note from the 'Meeting' template"
"Process this template with custom variables"
```

#### Book Search / 書籍検索
```
"Search for books about 'machine learning'"
"Find book by ISBN 9784873119502"
"Create a reading note for option 2 from the search"
```

## Available Commands / 利用可能なコマンド

### Core Commands / コアコマンド
| Command | Description | 説明 |
|---------|-------------|------|
| `list_vaults` | Find all Obsidian vaults | すべてのObsidian保管庫を検索 |
| `select_vault` | Choose which vault to work with | 作業する保管庫を選択 |
| `analyze_vault` | Show folder structure and statistics | フォルダ構造と統計を表示 |
| `create_note` | Create a new note with frontmatter | フロントマター付きでノート作成 |
| `read_note` | Read an existing note | 既存のノートを読取 |
| `update_note` | Update note content | ノート内容を更新 |
| `delete_note` | Delete a note | ノートを削除 |
| `list_notes` | List notes in a folder | フォルダ内のノート一覧 |
| `search_notes` | Search notes by content | 内容でノートを検索 |
| `get_tags` | Get all tags in vault | 保管庫内の全タグを取得 |

### Plugin Commands / プラグインコマンド
| Command | Description | 説明 |
|---------|-------------|------|
| `list_templates` | List Templater templates | Templaterテンプレート一覧 |
| `create_from_template` | Create note from template | テンプレートからノート作成 |
| `process_template` | Process template syntax | テンプレート構文を処理 |
| `search_book_by_isbn` | Search book by ISBN | ISBNで書籍検索 |
| `search_book_by_title` | Search books by title/author | タイトル/著者で書籍検索 |
| `create_book_note` | Create note from book data | 書籍データからノート作成 |

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

## Contributing / コントリビューション

Contributions are welcome! Please feel free to submit a Pull Request.
コントリビューションを歓迎します！お気軽にPull Requestを送信してください。

1. Fork the repository / リポジトリをフォーク
2. Create your feature branch / 機能ブランチを作成 (`git checkout -b feature/AmazingFeature`)
3. Commit your changes / 変更をコミット (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch / ブランチにプッシュ (`git push origin feature/AmazingFeature`)
5. Open a Pull Request / Pull Requestを開く

## License / ライセンス

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
このプロジェクトはMITライセンスの下でライセンスされています - 詳細は[LICENSE](LICENSE)ファイルを参照してください。

## Acknowledgments / 謝辞

- Built for [Claude Desktop](https://claude.ai/desktop) using the [Model Context Protocol](https://github.com/anthropics/model-context-protocol)
- Designed for [Obsidian](https://obsidian.md/) users
- [Claude Desktop](https://claude.ai/desktop)用に[Model Context Protocol](https://github.com/anthropics/model-context-protocol)を使用して構築
- [Obsidian](https://obsidian.md/)ユーザー向けに設計

## Support / サポート
