# ObsidianMCP 使用方法

## 機能強化版の新機能

### 1. Vault検出と選択
最初にVaultを選択する必要があります：

```
1. "list_vaults" - システム上のすべてのObsidian Vaultを検出
2. "select_vault /path/to/vault" - 特定のVaultを選択
```

### 2. Vault分析
選択したVaultの構造と統計を表示：

```
"analyze_vault" - フォルダ構造とVault統計を表示
```

表示内容：
- 総ノート数
- 総フォルダ数
- 総サイズ
- よく使われるタグTop 10
- フォルダツリー構造

### 3. ノート操作

#### ノート作成
```
"create_note with title 'Meeting Notes' and content '# Today's Meeting'"
```

#### ノート読み込み
```
"read_note Projects/project1.md"
```

#### ノート一覧
```
"list_notes in Projects folder"
"list_notes recursively" - サブフォルダも含む
```

#### ノート検索
```
"search_notes for 'project'"
"search_notes for 'todo' in Projects folder"
```

## Claude Desktopでの設定

1. Claude Desktopの設定ファイルを開く：
   - Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

2. 以下を追加：
```json
{
  "mcpServers": {
    "obsidian-mcp": {
      "command": "node",
      "args": ["/Users/r.ishii/Documents/mcp-obsidian/dist/index-enhanced.js"]
    }
  }
}
```

3. Claude Desktopを再起動

## 使用例

### 初回使用時
```
User: List all my Obsidian vaults
Claude: [list_vaults実行]

User: Select the Documents/Obsidian vault
Claude: [select_vault実行]

User: Show me the vault structure
Claude: [analyze_vault実行]
```

### 日常的な使用
```
User: Create a daily note for today
Claude: [create_note in Daily Notes folder]

User: Find all notes about "project"
Claude: [search_notes for "project"]

User: Show me what's in the Projects folder
Claude: [list_notes in Projects folder]
```

## トラブルシューティング

### Vaultが見つからない場合
- Vaultパスが正しいか確認
- .obsidianフォルダが存在するか確認
- `~/.obsidian-mcp/config.yaml`にパスを追加

### ノートが作成できない場合
- Vaultが選択されているか確認
- フォルダの書き込み権限を確認
- パスに特殊文字が含まれていないか確認