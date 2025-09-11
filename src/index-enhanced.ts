#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
// import * as crypto from 'crypto'; // Reserved for future use
import { TemplaterPlugin, TemplaterVariable } from './plugins/templater';
import { BookSearchPlugin, BookMetadata } from './plugins/book-search';
import { TasksPlugin, TaskMetadata, TaskFilters } from './plugins/tasks';
import { KanbanPlugin } from './plugins/kanban';
import { VaultAnalyticsPlugin } from './plugins/vault-analytics';
import { AIAnalysisPlugin } from './plugins/ai-analysis';
import { DailyNotesPlugin } from './plugins/daily-notes';

// Full MCP Server for Obsidian with all features including plugins
const server = new Server(
  {
    name: 'obsidian-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Store discovered vaults and selected vault
let discoveredVaults: string[] = [];
let selectedVault: string | null = null;

// 保管庫の自動選択を防ぐための強制クリア関数
function clearVaultSelection(): void {
  selectedVault = null;
  workflowState.vaultSelected = false;
  workflowState.currentOperation = null;
}

// 厳密な保管庫選択チェック
function requireExplicitVaultSelection(): { error: true; content: any[] } | null {
  // workflowState.vaultSelectedとselectedVaultの両方をチェック
  if (!workflowState.vaultSelected || !selectedVault || selectedVault === null) {
    return {
      error: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: true,
            error_code: "VAULT_NOT_SELECTED",
            message: "操作を実行できません：保管庫が明示的に選択されていません",
            required_action: "必ずlist_vaults()を実行してから、select_vault(vault_index: N)で保管庫を選択してください",
            help_url: "https://docs.example.com/obsidian-mcp/vault-selection",
            note: "自動的な保管庫選択は無効化されています。安全のため明示的な選択が必要です。"
          }, null, 2)
        },
      ],
    };
  }
  return null;
}

// テンプレート提案システム
function generateSuggestedTemplates(title: string, content: string, folder: string): any[] {
  const templates = [];

  // コンテンツ分析によるテンプレート推定
  const contentLower = (content || '').toLowerCase();
  const titleLower = (title || '').toLowerCase();
  const folderLower = folder.toLowerCase();

  // 1. 会議録テンプレート
  if (titleLower.includes('会議') || titleLower.includes('ミーティング') || 
      contentLower.includes('議事録') || contentLower.includes('アジェンダ') ||
      folderLower.includes('meeting')) {
    templates.push({
      id: 'meeting',
      name: '会議録テンプレート',
      description: '会議の議事録に最適化された構造',
      content: `# ${title || '会議名'}

## 📅 会議情報
- **日時**: {{date:YYYY-MM-DD HH:mm}}
- **参加者**: 
- **場所**: 

## 📋 アジェンダ
1. 
2. 
3. 

## 📝 議事内容

### 決定事項
- 

### アクションアイテム
- [ ] 担当者: 期限: 
- [ ] 担当者: 期限: 

### 次回までの課題
- 

## 📎 添付資料
- 

---
**作成日**: {{date:YYYY-MM-DD}}
**作成者**: {{USER}}`
    });
  }

  // 2. プロジェクトテンプレート
  if (titleLower.includes('プロジェクト') || titleLower.includes('企画') ||
      contentLower.includes('計画') || contentLower.includes('タスク') ||
      folderLower.includes('project')) {
    templates.push({
      id: 'project',
      name: 'プロジェクト管理テンプレート',
      description: 'プロジェクトの進行管理に特化した構造',
      content: `# ${title || 'プロジェクト名'}

## 🎯 プロジェクト概要
**目的**: 
**期間**: {{date:YYYY-MM-DD}} ～ 
**担当**: 

## 📊 進捗状況
- **全体進捗**: 0%
- **現在のフェーズ**: 計画段階

## 📋 タスク管理
### 🔄 進行中
- [ ] 
- [ ] 

### ⏳ 予定
- [ ] 
- [ ] 

### ✅ 完了
- [x] プロジェクト計画書作成

## 🚫 課題・リスク
| 課題 | 影響度 | 対応策 | 担当 | 期限 |
|------|--------|---------|------|------|
|      |        |         |      |      |

## 📈 マイルストーン
- [ ] **フェーズ1完了**: 
- [ ] **中間レビュー**: 
- [ ] **最終完了**: 

## 📎 関連資料
- [[]]
- [[]]

---
**最終更新**: {{date:YYYY-MM-DD HH:mm}}`
    });
  }

  // 3. 学習ノートテンプレート
  if (titleLower.includes('学習') || titleLower.includes('勉強') || titleLower.includes('ノート') ||
      contentLower.includes('まとめ') || contentLower.includes('復習') ||
      folderLower.includes('study') || folderLower.includes('notes')) {
    templates.push({
      id: 'study',
      name: '学習ノートテンプレート',
      description: '学習内容の整理と復習に最適な構造',
      content: `# ${title || '学習トピック'}

## 📚 学習情報
- **分野**: 
- **難易度**: ⭐⭐⭐☆☆
- **学習日**: {{date:YYYY-MM-DD}}
- **所要時間**: 

## 🎯 学習目標
- 
- 
- 

## 📝 学習内容

### 重要ポイント
1. **概念A**: 
2. **概念B**: 
3. **概念C**: 

### 詳細メモ
${content || '学習した内容をここに記述'}

### コード例・実例
\`\`\`
// サンプルコードや例をここに
\`\`\`

## 💡 理解度チェック
- [ ] 基本概念を説明できる
- [ ] 実例を挙げることができる
- [ ] 他の概念との関連性を理解している

## 🔗 関連リンク
- [[関連ノート1]]
- [[関連ノート2]]
- [外部リンク]()

## 📅 復習予定
- **1週間後**: {{date+7d:YYYY-MM-DD}}
- **1ヶ月後**: {{date+30d:YYYY-MM-DD}}

---
**タグ**: #学習 #{{TOPIC}}`
    });
  }

  // 4. デイリーノートテンプレート
  if (titleLower.includes('日記') || titleLower.includes('daily') ||
      folderLower.includes('daily') || folderLower.includes('journal')) {
    templates.push({
      id: 'daily',
      name: 'デイリーノートテンプレート',
      description: '日々の記録と振り返りに最適な構造',
      content: `# {{date:YYYY-MM-DD}} ${title || 'デイリーノート'}

## 🌅 今日の目標
- [ ] 
- [ ] 
- [ ] 

## 📝 今日の記録

### 💼 仕事
- 

### 📚 学習
- 

### 👥 人間関係
- 

### 💪 健康
- 

## ✨ 今日の良かったこと
1. 
2. 
3. 

## 🤔 反省・改善点
- 

## 📅 明日の予定
- [ ] 
- [ ] 
- [ ] 

## 🔗 関連リンク
- [[前日: {{date-1d:YYYY-MM-DD}}]]
- [[翌日: {{date+1d:YYYY-MM-DD}}]]

---
**気分**: 😊 **天気**: ☀️ **エネルギー**: ⭐⭐⭐⭐☆`
    });
  }

  // デフォルトテンプレートを常に含める
  templates.push({
    id: 'simple',
    name: 'シンプルノートテンプレート',
    description: 'ミニマルな構造の汎用テンプレート',
    content: `# ${title || 'ノートタイトル'}

## 概要
${content || 'ここに内容を記述してください。'}

## 詳細

## メモ
- 
- 
- 

## 関連
- [[]]
- [[]]

---
**作成日**: {{date:YYYY-MM-DD}}
**タグ**: #`
  });

  // 最大3つのテンプレートを返す
  return templates.slice(0, 3);
}

// Plugin instances
let templaterPlugin: TemplaterPlugin | null = null;
let bookSearchPlugin: BookSearchPlugin | null = null;
let tasksPlugin: TasksPlugin | null = null;
let kanbanPlugin: KanbanPlugin | null = null;
let vaultAnalyticsPlugin: VaultAnalyticsPlugin | null = null;
let aiAnalysisPlugin: AIAnalysisPlugin | null = null;
let dailyNotesPlugin: DailyNotesPlugin | null = null;

// Store last book search results for easy selection
let lastBookSearchResults: BookMetadata[] = [];

// Workflow control state
interface WorkflowState {
  vaultSelected: boolean;
  currentOperation: string | null;
  interactiveMode: boolean;
}

let workflowState: WorkflowState = {
  vaultSelected: false,
  currentOperation: null,
  interactiveMode: true
};

// Standardized error structure
interface MCPError {
  error: boolean;
  error_code: string;
  message: string;
  required_action: string;
  help_url?: string;
}

// Error code definitions
const ERROR_CODES = {
  VAULT_NOT_SELECTED: 'VAULT_NOT_SELECTED',
  FOLDER_NOT_SPECIFIED: 'FOLDER_NOT_SPECIFIED',
  TEMPLATE_NOT_CONFIRMED: 'TEMPLATE_NOT_CONFIRMED',
  INVALID_PATH: 'INVALID_PATH'
} as const;

// Create standardized error response
function createErrorResponse(errorCode: keyof typeof ERROR_CODES, customMessage?: string): any {
  const errorMap: Record<keyof typeof ERROR_CODES, MCPError> = {
    VAULT_NOT_SELECTED: {
      error: true,
      error_code: 'VAULT_NOT_SELECTED',
      message: customMessage || '操作を実行できません：保管庫が選択されていません',
      required_action: 'list_vaults()を実行してから、select_vault()で保管庫を選択してください',
      help_url: 'https://docs.obsidian.md/'
    },
    FOLDER_NOT_SPECIFIED: {
      error: true,
      error_code: 'FOLDER_NOT_SPECIFIED',
      message: customMessage || '保存先フォルダが指定されていません',
      required_action: 'フォルダパラメータを指定してください',
    },
    TEMPLATE_NOT_CONFIRMED: {
      error: true,
      error_code: 'TEMPLATE_NOT_CONFIRMED',
      message: customMessage || 'テンプレートが選択されていません',
      required_action: 'テンプレートを選択して確認してください',
    },
    INVALID_PATH: {
      error: true,
      error_code: 'INVALID_PATH',
      message: customMessage || '無効なパスが指定されました',
      required_action: '正しいパス形式を指定してください',
    }
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(errorMap[errorCode], null, 2)
      }
    ]
  };
}

// Check if vault is selected - required for all vault operations
function requireVaultSelection(): boolean {
  return selectedVault !== null && workflowState.vaultSelected;
}

// Interactive vault selection prompt
function createVaultSelectionPrompt(vaults: string[]): string {
  let prompt = '=== Obsidian保管庫の選択 ===\n';
  prompt += '⚠️ 重要：すべての操作には明示的な保管庫選択が必要です\n';
  prompt += '自動的な保管庫選択は安全のため無効化されています。\n\n';
  prompt += '以下の保管庫が見つかりました：\n\n';
  
  vaults.forEach((vault, index) => {
    prompt += `${index + 1}. ${path.basename(vault)} (パス: ${vault})\n`;
  });
  
  prompt += '\n✅ 使用する保管庫の番号を選択してください：';
  prompt += '\n例: select_vault(vault_path: "/path/to/vault")';
  prompt += '\n\n📋 選択後、以下の操作が利用可能になります：';
  prompt += '\n- create_note() - ノート作成';
  prompt += '\n- read_note() - ノート読み取り';
  prompt += '\n- move_note() - ノート移動';
  prompt += '\n- その他のファイル操作';
  
  return prompt;
}

// Interactive folder specification prompt
function createFolderSelectionPrompt(): string {
  let prompt = '=== 保存先フォルダの指定 ===\n';
  prompt += 'ファイルを保存するフォルダを指定してください。\n';
  prompt += '例:\n';
  prompt += '  - Templates/     (テンプレート用)\n';
  prompt += '  - Meeting/       (議事録用)\n';
  prompt += '  - Daily/         (デイリーノート用)\n';
  prompt += '  - /             (ルートフォルダ)\n\n';
  prompt += '保存先フォルダ: folder パラメータで指定してください';
  
  return prompt;
}

// Template selection options
interface TemplateOption {
  id: number;
  name: string;
  description: string;
  usage: string;
  content: string;
}

// Generate template suggestions
function generateTemplateOptions(templateType: string): TemplateOption[] {
  const options: TemplateOption[] = [];
  
  switch (templateType.toLowerCase()) {
    case 'daily':
    case 'デイリー':
      options.push({
        id: 1,
        name: 'シンプル版',
        description: '基本的な構成',
        usage: '簡単な記録',
        content: `# {{date:YYYY-MM-DD}}

## 今日のタスク
- [ ] 

## 振り返り
- 

## メモ
- `
      });
      
      options.push({
        id: 2,
        name: '標準版',
        description: 'バランスの取れた構成',
        usage: '一般的な用途',
        content: `# {{date:YYYY-MM-DD}} - デイリーノート

## 📅 今日の予定
- [ ] 

## ✅ 完了したタスク
- 

## 📝 学んだこと
- 

## 💭 今日の振り返り
- 

## 🔗 関連リンク
- `
      });
      
      options.push({
        id: 3,
        name: '詳細版',
        description: '包括的な構成',
        usage: '詳細な記録',
        content: `# {{date:YYYY-MM-DD}} - デイリーノート

## 🎯 今日の目標
- 

## 📅 スケジュール
### 午前
- [ ] 

### 午後
- [ ] 

### 夕方
- [ ] 

## ✅ 完了したタスク
- 

## 📚 学習記録
### 新しく学んだこと
- 

### 復習したこと
- 

## 💭 今日の振り返り
### よかったこと
- 

### 改善したいこと
- 

### 明日に向けて
- 

## 🔗 関連ノート
- 

## 📊 今日の評価
満足度: /10
生産性: /10`
      });
      break;
      
    case 'meeting':
    case 'ミーティング':
      options.push({
        id: 1,
        name: 'シンプル版',
        description: '基本的な議事録',
        usage: '簡単な会議記録',
        content: `# {{title}} - {{date:YYYY-MM-DD}}

## 参加者
- 

## 議題
- 

## 議論内容
- 

## 決定事項
- 

## アクションアイテム
- [ ] `
      });
      
      options.push({
        id: 2,
        name: '標準版',
        description: '構造化された議事録',
        usage: 'ビジネス会議',
        content: `# {{title}} - {{date:YYYY-MM-DD}}

## 📋 会議情報
- **日時**: {{date:YYYY-MM-DD HH:mm}}
- **場所**: 
- **司会**: 
- **書記**: 

## 👥 参加者
- 

## 📝 議題
1. 

## 💬 議論内容
### 議題1: 
- 

## ✅ 決定事項
1. 

## 📋 アクションアイテム
- [ ] **担当者**: **期限**: 

## 📎 関連資料
- 

## 🔄 次回会議
- **日時**: 
- **議題**: `
      });
      
      options.push({
        id: 3,
        name: '詳細版',
        description: 'プロジェクト管理対応',
        usage: '重要な会議や意思決定',
        content: `# {{title}} - {{date:YYYY-MM-DD}}

## 📋 会議情報
- **日時**: {{date:YYYY-MM-DD HH:mm}}
- **場所**: 
- **会議種別**: 
- **司会**: 
- **書記**: 
- **所要時間**: 

## 👥 参加者
### 必須参加者
- 

### 任意参加者
- 

### 欠席者
- 

## 🎯 会議の目的
- 

## 📝 議題
1. 
   - **提案者**: 
   - **時間**: 分

## 💬 議論内容
### 議題1: 
#### 提起された問題・課題
- 

#### 議論のポイント
- 

#### 異なる意見・懸念事項
- 

## ✅ 決定事項
1. 
   - **理由**: 
   - **影響範囲**: 
   - **実施時期**: 

## 📋 アクションアイテム
| タスク | 担当者 | 期限 | 優先度 | 状況 |
|--------|--------|------|--------|------|
|        |        |      |        |      |

## ⚠️ リスク・懸念事項
- 

## 📊 進捗状況
- 

## 📎 関連資料・参考リンク
- 

## 🔄 次回会議
- **日時**: 
- **議題**: 
- **準備事項**: 

## 📝 その他メモ
- `
      });
      break;
      
    default:
      options.push({
        id: 1,
        name: 'シンプル版',
        description: '基本的な構成',
        usage: '簡単な記録',
        content: `# {{title}}

## 概要
- 

## 詳細
- 

## メモ
- `
      });
      
      options.push({
        id: 2,
        name: '標準版',
        description: 'バランスの取れた構成',
        usage: '一般的な用途',
        content: `# {{title}}

## 📝 概要
- 

## 🎯 目的
- 

## 📋 詳細
- 

## 🔗 関連リンク
- 

## 📝 メモ
- `
      });
      
      options.push({
        id: 3,
        name: '詳細版',
        description: '包括的な構成',
        usage: '詳細な記録',
        content: `# {{title}}

## 📝 概要
- 

## 🎯 目的・背景
- 

## 📊 現状分析
- 

## 📋 詳細内容
### ポイント1
- 

### ポイント2
- 

## ✅ アクションアイテム
- [ ] 

## 🔗 関連リンク・参考資料
- 

## 📈 今後の展開
- 

## 📝 追加メモ
- `
      });
  }
  
  return options;
}

// Create template selection prompt
function createTemplateSelectionPrompt(options: TemplateOption[]): string {
  let prompt = '=== テンプレートの選択 ===\n';
  prompt += '以下のテンプレート案から選択してください：\n\n';
  
  options.forEach(option => {
    prompt += `[Option ${option.id}] ${option.name}\n`;
    prompt += `- 特徴: ${option.description}\n`;
    prompt += `- 用途: ${option.usage}\n\n`;
  });
  
  prompt += 'テンプレートを確認して作成するには：\n';
  prompt += 'create_custom_template(name: "テンプレート名", template_option: 1-3)';
  
  return prompt;
}

// File locks for concurrent editing detection (reserved for future use)
// const fileLocks: Map<string, { timestamp: number; sessionId: string }> = new Map();
// const sessionId = crypto.randomBytes(16).toString('hex');

// Helper function to extract title from content
function extractTitleFromContent(content: string): string | null {
  if (!content) return null;
  
  // Look for H1 heading (# Title)
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }
  
  // Look for the first non-empty line as potential title
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
      // Take first 50 characters as title
      return trimmed.length > 50 ? trimmed.substring(0, 50) + '...' : trimmed;
    }
  }
  
  return null;
}

// Helper function to generate default title
function generateDefaultTitle(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').substring(0, 19);
  return `新規ノート-${timestamp}`;
}

// Helper function to update Obsidian links in content
async function updateObsidianLinks(vaultPath: string, oldPath: string, newPath: string): Promise<number> {
  let updatedCount = 0;
  
  // Convert paths to link formats
  const oldLinkName = path.basename(oldPath, '.md');
  const newLinkName = path.basename(newPath, '.md');
  const oldRelativePath = oldPath.replace(/\.md$/, '');
  const newRelativePath = newPath.replace(/\.md$/, '');
  
  // Function to recursively find and update links in all markdown files
  async function updateLinksInDir(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await updateLinksInDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md') && fullPath !== path.join(vaultPath, newPath)) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            let modified = false;
            let newContent = content;
            
            // Update wiki-style links [[note]] and [[note|alias]]
            const wikiLinkRegex = new RegExp(`\\[\\[${oldLinkName}(\\|[^\\]]*)?\\]\\]`, 'g');
            if (wikiLinkRegex.test(content)) {
              newContent = newContent.replace(wikiLinkRegex, (match, alias) => {
                modified = true;
                return `[[${newLinkName}${alias || ''}]]`;
              });
            }
            
            // Update relative path links [[folder/note]]
            const pathLinkRegex = new RegExp(`\\[\\[${oldRelativePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\|[^\\]]*)?\\]\\]`, 'g');
            if (pathLinkRegex.test(content)) {
              newContent = newContent.replace(pathLinkRegex, (match, alias) => {
                modified = true;
                return `[[${newRelativePath}${alias || ''}]]`;
              });
            }
            
            // Update markdown-style links [text](note.md)
            const markdownLinkRegex = new RegExp(`\\]\\(${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g');
            if (markdownLinkRegex.test(content)) {
              newContent = newContent.replace(markdownLinkRegex, `](${newPath})`);
              modified = true;
            }
            
            if (modified) {
              await fs.writeFile(fullPath, newContent, 'utf-8');
              updatedCount++;
            }
          } catch (error) {
            // Skip files that can't be read/written
          }
        }
      }
    } catch (error) {
      // Skip directories that can't be accessed
    }
  }
  
  await updateLinksInDir(vaultPath);
  return updatedCount;
}

// Helper function to parse frontmatter
function parseFrontmatter(content: string): { metadata: any; body: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  
  if (match) {
    const yamlContent = match[1];
    const body = match[2];
    const metadata: any = {};
    
    // Simple YAML parser for basic key-value pairs
    yamlContent.split('\n').forEach(line => {
      const kvMatch = line.match(/^(\w+):\s*(.*)$/);
      if (kvMatch) {
        const [, key, value] = kvMatch;
        // Parse arrays
        if (value.startsWith('[') && value.endsWith(']')) {
          metadata[key] = value.slice(1, -1).split(',').map(v => v.trim());
        } else {
          metadata[key] = value;
        }
      }
    });
    
    return { metadata, body };
  }
  
  return { metadata: {}, body: content };
}

// Helper function to create frontmatter
function createFrontmatter(metadata: any): string {
  if (!metadata || Object.keys(metadata).length === 0) {
    return '';
  }
  
  let frontmatter = '---\n';
  for (const [key, value] of Object.entries(metadata)) {
    if (Array.isArray(value)) {
      frontmatter += `${key}: [${value.join(', ')}]\n`;
    } else {
      frontmatter += `${key}: ${value}\n`;
    }
  }
  frontmatter += '---\n\n';
  
  return frontmatter;
}

// Initialize plugins
async function initializePlugins(): Promise<void> {
  if (!selectedVault) return;
  
  // Initialize Templater plugin
  templaterPlugin = new TemplaterPlugin(selectedVault);
  
  // Initialize Book Search plugin (with optional Google Books API key from env)
  const googleApiKey = process.env.GOOGLE_BOOKS_API_KEY;
  bookSearchPlugin = new BookSearchPlugin(selectedVault, googleApiKey);
  
  // Initialize Tasks plugin
  tasksPlugin = new TasksPlugin(selectedVault);
  
  // Initialize Kanban plugin
  kanbanPlugin = new KanbanPlugin(selectedVault);
  
  // Initialize Vault Analytics plugin
  vaultAnalyticsPlugin = new VaultAnalyticsPlugin(selectedVault);
  
  // Initialize AI Analysis plugin
  aiAnalysisPlugin = new AIAnalysisPlugin(selectedVault);
  
  // Initialize Daily Notes plugin
  dailyNotesPlugin = new DailyNotesPlugin(selectedVault);
}

// Check if plugins are available
// Function removed - plugin availability no longer checked proactively

// Find all Obsidian vaults
async function findVaults(): Promise<string[]> {
  const vaults: string[] = [];
  
  // Check environment variable first
  const envVault = process.env.OBSIDIAN_VAULT_PATH;
  if (envVault) {
    const expandedPath = envVault.replace('~', os.homedir());
    if (await isValidVault(expandedPath)) {
      vaults.push(expandedPath);
    }
  }
  
  const searchPaths = [
    path.join(os.homedir(), 'Documents'),
    path.join(os.homedir(), 'Desktop'),
    path.join(os.homedir(), 'Obsidian'),
    path.join(os.homedir(), 'Library', 'Mobile Documents', 'iCloud~md~obsidian', 'Documents'), // iCloud
  ];

  for (const searchPath of searchPaths) {
    try {
      await scanForVaults(searchPath, vaults, 0, 3);
    } catch (error) {
      // Ignore errors for non-existent paths
    }
  }

  return vaults;
}

async function isValidVault(vaultPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(vaultPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function scanForVaults(dir: string, vaults: string[], depth: number, maxDepth: number): Promise<void> {
  if (depth > maxDepth) return;

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    // Check if this directory contains .obsidian folder
    if (entries.some(e => e.name === '.obsidian' && e.isDirectory())) {
      vaults.push(dir);
      return; // Don't scan subdirectories of a vault
    }

    // Recursively scan subdirectories
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await scanForVaults(path.join(dir, entry.name), vaults, depth + 1, maxDepth);
      }
    }
  } catch (error) {
    // Ignore permission errors
  }
}

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  
  const tools = [
    {
      name: 'list_vaults',
      description: 'List all discovered Obsidian vaults on the system',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'select_vault',
      description: 'Select a specific vault to work with',
      inputSchema: {
        type: 'object',
        properties: {
          vault_path: {
            type: 'string',
            description: 'The path to the vault to select',
          },
        },
        required: ['vault_path'],
      },
    },
    {
      name: 'create_note',
      description: 'Create a new note with optional frontmatter',
      inputSchema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'The title of the note',
          },
          content: {
            type: 'string',
            description: 'The content of the note',
          },
          folder: {
            type: 'string',
            description: 'The folder to create the note in',
          },
          metadata: {
            type: 'object',
            description: 'Frontmatter metadata (tags, date, etc)',
          },
          confirm: {
            type: 'boolean',
            description: 'Confirm note creation (required for actual creation)',
            default: false,
          },
        },
        required: [],
      },
    },
    {
      name: 'delete_note',
      description: 'Delete a note from the vault',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the note file (relative to vault root)',
          },
          title: {
            type: 'string',
            description: 'Title of the note (alternative to path)',
          },
          folder: {
            type: 'string',
            description: 'Folder containing the note (used with title)',
          },
          confirm: {
            type: 'boolean',
            description: 'Confirm note deletion (required for actual deletion)',
            default: false,
          },
          trash: {
            type: 'boolean',
            description: 'Move to .trash folder instead of permanent deletion',
            default: true,
          },
        },
      },
    },
    {
      name: 'read_note',
      description: 'Read the content of a note',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the note file (relative to vault root)',
          },
          title: {
            type: 'string',
            description: 'Title of the note (alternative to path)',
          },
          folder: {
            type: 'string',
            description: 'Folder containing the note (used with title)',
          },
        },
      },
    },
    {
      name: 'update_note',
      description: 'Update the content of an existing note',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the note file (relative to vault root)',
          },
          title: {
            type: 'string',
            description: 'Title of the note (alternative to path)',
          },
          folder: {
            type: 'string',
            description: 'Folder containing the note (used with title)',
          },
          content: {
            type: 'string',
            description: 'New content for the note',
          },
          append: {
            type: 'boolean',
            description: 'Append to existing content instead of replacing',
            default: false,
          },
          metadata: {
            type: 'object',
            description: 'Update frontmatter metadata',
          },
        },
        required: ['content'],
      },
    },
    {
      name: 'list_notes',
      description: 'List notes in a folder or entire vault',
      inputSchema: {
        type: 'object',
        properties: {
          folder: {
            type: 'string',
            description: 'Folder to list notes from (empty for entire vault)',
          },
          recursive: {
            type: 'boolean',
            description: 'Include notes from subfolders',
            default: true,
          },
        },
      },
    },
    {
      name: 'search_notes',
      description: 'Search notes by content, with optional folder and tag filtering',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query to look for in note content',
          },
          folder: {
            type: 'string',
            description: 'Folder to search in (optional)',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags to filter by (optional)',
          },
          recursive: {
            type: 'boolean',
            description: 'Include subfolders in search',
          },
        },
        required: ['query'],
      } as any,
    },
    {
      name: 'get_all_tags',
      description: 'Get all tags used in the vault with their frequency',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'search_by_tag',
      description: 'Find all notes that contain a specific tag',
      inputSchema: {
        type: 'object',
        properties: {
          tag: {
            type: 'string',
            description: 'Tag to search for',
          },
          folder: {
            type: 'string',
            description: 'Folder to search in (optional)',
          },
        },
        required: ['tag'],
      } as any,
    },
    {
      name: 'add_tag_to_note',
      description: 'Add tags to an existing note',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the note file',
          },
          title: {
            type: 'string',
            description: 'Title of the note (alternative to path)',
          },
          folder: {
            type: 'string',
            description: 'Folder containing the note (used with title)',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags to add to the note',
          },
        },
        required: ['tags'],
      } as any,
    },
    {
      name: 'move_note',
      description: 'Move a note to a different folder with safety checks and link updates',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Current path to the note file',
          },
          title: {
            type: 'string',
            description: 'Title of the note (alternative to path)',
          },
          folder: {
            type: 'string',
            description: 'Current folder containing the note (used with title)',
          },
          to_folder: {
            type: 'string',
            description: 'Destination folder path',
          },
          rename: {
            type: 'string',
            description: 'New name for the note (optional)',
          },
          update_links: {
            type: 'boolean',
            description: 'Update Obsidian links in other notes',
          },
          confirm: {
            type: 'boolean',
            description: 'Skip confirmation prompt',
          },
        },
        required: ['to_folder'],
      } as any,
    },
    {
      name: 'bulk_move_notes',
      description: 'Move multiple notes with batch link updates',
      inputSchema: {
        type: 'object',
        properties: {
          moves: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                from: { type: 'string' },
                to: { type: 'string' },
              },
              required: ['from', 'to'],
            },
            description: 'Array of move operations {from: path, to: path}',
          },
          update_links: {
            type: 'boolean',
            description: 'Update Obsidian links in other notes',
          },
          confirm: {
            type: 'boolean',
            description: 'Skip confirmation prompt',
          },
        },
        required: ['moves'],
      } as any,
    },
    {
      name: 'move_folder',
      description: 'Move an entire folder with all contents and update links',
      inputSchema: {
        type: 'object',
        properties: {
          from_folder: {
            type: 'string',
            description: 'Source folder path',
          },
          to_folder: {
            type: 'string',
            description: 'Destination folder path',
          },
          update_links: {
            type: 'boolean',
            description: 'Update Obsidian links in other notes',
          },
          confirm: {
            type: 'boolean',
            description: 'Skip confirmation prompt',
          },
        },
        required: ['from_folder', 'to_folder'],
      } as any,
    },
    {
      name: 'analyze_vault_structure',
      description: 'Analyze vault folder structure and statistics',
      inputSchema: {
        type: 'object',
        properties: {},
      } as any,
    },
    {
      name: 'get_writing_stats',
      description: 'Get comprehensive writing statistics for the vault',
      inputSchema: {
        type: 'object',
        properties: {},
      } as any,
    },
    {
      name: 'find_orphan_notes',
      description: 'Find notes with no incoming or outgoing links',
      inputSchema: {
        type: 'object',
        properties: {},
      } as any,
    },
    {
      name: 'get_link_graph',
      description: 'Generate link relationship graph data for visualization',
      inputSchema: {
        type: 'object',
        properties: {},
      } as any,
    },
    {
      name: 'create_custom_template',
      description: 'Create and save a custom template',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Template name',
          },
          content: {
            type: 'string',
            description: 'Template content with Templater syntax',
          },
          description: {
            type: 'string',
            description: 'Template description',
          },
          category: {
            type: 'string',
            description: 'Template category',
            default: 'custom',
          },
          save_folder: {
            type: 'string',
            description: 'Custom folder path to save template (relative to vault root, defaults to Templates/)',
          },
        },
        required: ['name', 'content'],
      } as any,
    },
    {
      name: 'list_available_templates',
      description: 'List all available templates with metadata',
      inputSchema: {
        type: 'object',
        properties: {},
      } as any,
    },
    {
      name: 'apply_template_to_note',
      description: 'Apply template to existing note',
      inputSchema: {
        type: 'object',
        properties: {
          template_name: {
            type: 'string',
            description: 'Name of template to apply',
          },
          note_path: {
            type: 'string',
            description: 'Path to target note',
          },
          mode: {
            type: 'string',
            enum: ['replace', 'prepend', 'append'],
            description: 'How to apply template',
            default: 'replace',
          },
        },
        required: ['template_name', 'note_path'],
      } as any,
    },
    {
      name: 'summarize_note',
      description: 'Generate AI-powered summary of note content',
      inputSchema: {
        type: 'object',
        properties: {
          note_path: {
            type: 'string',
            description: 'Path to note to summarize',
          },
          max_length: {
            type: 'number',
            description: 'Maximum summary length in characters',
            default: 200,
          },
        },
        required: ['note_path'],
      } as any,
    },
    {
      name: 'generate_note_outline',
      description: 'Generate structured outline for note content',
      inputSchema: {
        type: 'object',
        properties: {
          note_path: {
            type: 'string',
            description: 'Path to note to outline',
          },
        },
        required: ['note_path'],
      } as any,
    },
    {
      name: 'suggest_tags',
      description: 'AI-powered tag suggestions based on content',
      inputSchema: {
        type: 'object',
        properties: {
          note_path: {
            type: 'string',
            description: 'Path to note for tag suggestions',
          },
          max_tags: {
            type: 'number',
            description: 'Maximum number of tags to suggest',
            default: 8,
          },
        },
        required: ['note_path'],
      } as any,
    },
    {
      name: 'create_daily_note',
      description: 'Create daily note with template selection prompt',
      inputSchema: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Date for daily note (YYYY-MM-DD format, defaults to today)',
          },
          template_name: {
            type: 'string',
            description: 'Optional template to use',
          },
          force_create: {
            type: 'boolean',
            description: 'Skip template selection prompt',
            default: false,
          },
          confirm: {
            type: 'boolean',
            description: 'Confirm daily note creation (required for actual creation)',
            default: false,
          },
        },
      } as any,
    },
    {
      name: 'create_weekly_note',
      description: 'Create weekly note with template selection prompt',
      inputSchema: {
        type: 'object',
        properties: {
          week_start: {
            type: 'string',
            description: 'Start date of week (YYYY-MM-DD format)',
          },
          template_name: {
            type: 'string',
            description: 'Optional template to use',
          },
          force_create: {
            type: 'boolean',
            description: 'Skip template selection prompt',
            default: false,
          },
        },
      } as any,
    },
    {
      name: 'get_notes_by_date_range',
      description: 'Get notes created within specified date range',
      inputSchema: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Start date (YYYY-MM-DD)',
          },
          end_date: {
            type: 'string',
            description: 'End date (YYYY-MM-DD)',
          },
          date_field: {
            type: 'string',
            description: 'Date field to search by: created, modified, or filename',
            default: 'modified',
          },
          include_content: {
            type: 'boolean',
            description: 'Include note content in results',
            default: false,
          },
          sort_by: {
            type: 'string',
            description: 'Sort results by: date, name, size',
            default: 'date',
          },
          folder_filter: {
            type: 'string',
            description: 'Filter by specific folder (optional)',
          },
        },
        required: ['start_date', 'end_date'],
      } as any,
    },
    {
      name: 'validate_broken_links',
      description: 'Validate and repair broken links in the vault',
      inputSchema: {
        type: 'object',
        properties: {
          fix_links: {
            type: 'boolean',
            description: 'Automatically fix broken links when possible',
            default: false,
          },
          scan_folder: {
            type: 'string',
            description: 'Specific folder to scan (optional)',
          },
          link_types: {
            type: 'array',
            description: 'Link types to check: wiki, markdown, or both',
            items: {
              type: 'string',
            },
            default: ['wiki', 'markdown'],
          },
          create_report: {
            type: 'boolean',
            description: 'Create a detailed report of broken links',
            default: true,
          },
        },
        required: [],
      } as any,
    },
  ];
  
  // Add Templater tools
  tools.push(
      {
        name: 'list_templates',
        description: 'List available Templater templates',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'create_from_template',
        description: 'Create a note from a Templater template',
        inputSchema: {
          type: 'object',
          properties: {
            template_name: {
              type: 'string',
              description: 'Name of the template to use',
            },
            title: {
              type: 'string',
              description: 'Title for the new note',
            },
            folder: {
              type: 'string',
              description: 'Folder to create the note in',
            },
            variables: {
              type: 'array',
              description: 'Custom variables for the template',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  value: { type: 'string' },
                },
              },
            },
            confirm: {
              type: 'boolean',
              description: 'Confirm note creation from template (required for actual creation)',
              default: false,
            },
          },
          required: ['template_name'],
        } as any,
      },
      {
        name: 'create_custom_template',
        description: 'Create a custom template with interactive selection and folder specification',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the template to create',
            },
            template_type: {
              type: 'string',
              description: 'Type of template (daily, meeting, note, etc.)',
              default: 'note',
            },
            template_option: {
              type: 'number',
              description: 'Selected template option (1-3)',
            },
            folder: {
              type: 'string',
              description: 'Folder to save the template in (e.g., Templates/)',
            },
            confirm: {
              type: 'boolean',
              description: 'Confirm template creation (required for actual creation)',
              default: false,
            },
          },
          required: ['name'],
        } as any,
      },
      {
        name: 'process_template',
        description: 'Process a template string with Templater syntax',
        inputSchema: {
          type: 'object',
          properties: {
            template: {
              type: 'string',
              description: 'Template string with Templater syntax',
            },
            variables: {
              type: 'array',
              description: 'Variables to replace in the template',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  value: { type: 'string' },
                },
              },
            },
          },
          required: ['template'],
        } as any,
      }
    );
  
  // Add Book Search tools
  tools.push(
      {
        name: 'search_book_by_isbn',
        description: 'Search for a book by ISBN',
        inputSchema: {
          type: 'object',
          properties: {
            isbn: {
              type: 'string',
              description: 'ISBN-10 or ISBN-13',
            },
            create_note: {
              type: 'boolean',
              description: 'Create a note for the book',
            },
            template: {
              type: 'string',
              description: 'Template name for the book note',
            },
            folder: {
              type: 'string',
              description: 'Folder for the book note',
            },
          },
          required: ['isbn'],
        } as any,
      },
      {
        name: 'search_book_by_title',
        description: 'Search for books by title and optionally author',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Book title to search for',
            },
            author: {
              type: 'string',
              description: 'Author name (optional)',
            },
            max_results: {
              type: 'number',
              description: 'Maximum number of results',
            },
          },
          required: ['title'],
        } as any,
      },
      {
        name: 'create_book_note',
        description: 'Create a note from book metadata or search result',
        inputSchema: {
          type: 'object',
          properties: {
            book_data: {
              type: 'object',
              description: 'Book metadata object (from search results)',
            },
            option_number: {
              type: 'number',
              description: 'Option number from previous search (1-5)',
            },
            template: {
              type: 'string',
              description: 'Template to use for the note',
            },
            folder: {
              type: 'string',
              description: 'Folder for the note',
            },
          },
        } as any,
      },
      {
        name: 'search_book_by_author',
        description: 'Search for books by author name',
        inputSchema: {
          type: 'object',
          properties: {
            author: {
              type: 'string',
              description: 'Author name to search for',
            },
          },
          required: ['author'],
        } as any,
      },
      {
        name: 'search_book_by_genre',
        description: 'Search for books by genre or category',
        inputSchema: {
          type: 'object',
          properties: {
            genre: {
              type: 'string',
              description: 'Genre or category to search for',
            },
          },
          required: ['genre'],
        } as any,
      },
      {
        name: 'get_book_recommendations',
        description: 'Get book recommendations based on a seed book or author',
        inputSchema: {
          type: 'object',
          properties: {
            seed_title: {
              type: 'string',
              description: 'Title of seed book for recommendations',
            },
            seed_author: {
              type: 'string',
              description: 'Author of seed book for recommendations',
            },
          },
        } as any,
      },
      {
        name: 'create_reading_list',
        description: 'Create or get personal reading list',
        inputSchema: {
          type: 'object',
          properties: {},
        } as any,
      },
      {
        name: 'add_book_to_reading_list',
        description: 'Add a book to personal reading list',
        inputSchema: {
          type: 'object',
          properties: {
            book_data: {
              type: 'object',
              description: 'Book metadata object',
            },
            option_number: {
              type: 'number',
              description: 'Option number from previous search (1-5)',
            },
            status: {
              type: 'string',
              enum: ['want-to-read', 'currently-reading', 'read'],
              description: 'Reading status',
              default: 'want-to-read',
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
              description: 'Priority level',
              default: 'medium',
            },
            reading_goal: {
              type: 'string',
              description: 'Personal reading goal or notes',
            },
          },
        } as any,
      },
      {
        name: 'mark_book_as_read',
        description: 'Mark a book in reading list as read',
        inputSchema: {
          type: 'object',
          properties: {
            book_id: {
              type: 'string',
              description: 'Book ID from reading list',
            },
            personal_rating: {
              type: 'number',
              description: 'Personal rating (1-5)',
              minimum: 1,
              maximum: 5,
            },
            personal_notes: {
              type: 'string',
              description: 'Personal notes about the book',
            },
          },
          required: ['book_id'],
        } as any,
      },
      {
        name: 'get_reading_progress',
        description: 'Get reading progress and statistics',
        inputSchema: {
          type: 'object',
          properties: {},
        } as any,
      },
      {
        name: 'rate_book',
        description: 'Rate a book in personal reading list',
        inputSchema: {
          type: 'object',
          properties: {
            book_id: {
              type: 'string',
              description: 'Book ID from reading list',
            },
            rating: {
              type: 'number',
              description: 'Rating (1-5)',
              minimum: 1,
              maximum: 5,
            },
            notes: {
              type: 'string',
              description: 'Additional notes about the rating',
            },
          },
          required: ['book_id', 'rating'],
        } as any,
      },
      {
        name: 'add_book_notes',
        description: 'Add or update notes for a book in reading list',
        inputSchema: {
          type: 'object',
          properties: {
            book_id: {
              type: 'string',
              description: 'Book ID from reading list',
            },
            notes: {
              type: 'string',
              description: 'Notes to add to the book',
            },
          },
          required: ['book_id', 'notes'],
        } as any,
      },
      {
        name: 'search_personal_library',
        description: 'Search through personal reading list',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query for title, author, notes, etc.',
            },
          },
          required: ['query'],
        } as any,
      },
      {
        name: 'export_reading_data',
        description: 'Export reading list and statistics',
        inputSchema: {
          type: 'object',
          properties: {
            format: {
              type: 'string',
              enum: ['json', 'csv', 'markdown'],
              description: 'Export format',
              default: 'json',
            },
          },
        } as any,
      }
    );

  // Add Tasks plugin tools
  tools.push(
    {
      name: 'create_task',
      description: 'Create a new task with Obsidian Tasks plugin format',
      inputSchema: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'Task description',
          },
          status: {
            type: 'string',
            enum: ['incomplete', 'complete', 'cancelled', 'in-progress', 'waiting', 'scheduled'],
            description: 'Task status',
            default: 'incomplete',
          },
          priority: {
            type: 'string',
            enum: ['highest', 'high', 'medium', 'low', 'lowest'],
            description: 'Task priority',
          },
          dueDate: {
            type: 'string',
            description: 'Due date (YYYY-MM-DD format)',
          },
          scheduledDate: {
            type: 'string',
            description: 'Scheduled date (YYYY-MM-DD format)',
          },
          startDate: {
            type: 'string',
            description: 'Start date (YYYY-MM-DD format)',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Task tags',
          },
          project: {
            type: 'string',
            description: 'Project name',
          },
          filePath: {
            type: 'string',
            description: 'File path to create the task in (defaults to Tasks.md)',
          },
        },
        required: ['description'],
      } as any,
    },
    {
      name: 'list_tasks',
      description: 'List tasks with optional filtering',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['incomplete', 'complete', 'cancelled', 'in-progress', 'waiting', 'scheduled'],
            },
            description: 'Filter by task status',
          },
          priority: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['highest', 'high', 'medium', 'low', 'lowest'],
            },
            description: 'Filter by priority',
          },
          hasScheduledDate: {
            type: 'boolean',
            description: 'Filter tasks with/without scheduled date',
          },
          hasDueDate: {
            type: 'boolean',
            description: 'Filter tasks with/without due date',
          },
          project: {
            type: 'string',
            description: 'Filter by project',
          },
          tag: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by tags',
          },
          path: {
            type: 'string',
            description: 'Filter by file path',
          },
          dueAfter: {
            type: 'string',
            description: 'Filter tasks due after date (YYYY-MM-DD)',
          },
          dueBefore: {
            type: 'string',
            description: 'Filter tasks due before date (YYYY-MM-DD)',
          },
        },
      } as any,
    },
    {
      name: 'update_task_status',
      description: 'Update a task status by file path and line number',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'File path containing the task',
          },
          lineNumber: {
            type: 'number',
            description: 'Line number of the task (0-based)',
          },
          newStatus: {
            type: 'string',
            enum: ['incomplete', 'complete', 'cancelled', 'in-progress', 'waiting', 'scheduled'],
            description: 'New task status',
          },
        },
        required: ['filePath', 'lineNumber', 'newStatus'],
      } as any,
    },
    {
      name: 'get_task_stats',
      description: 'Get task statistics and analytics',
      inputSchema: {
        type: 'object',
        properties: {},
      } as any,
    },
    {
      name: 'get_overdue_tasks',
      description: 'Get list of overdue tasks',
      inputSchema: {
        type: 'object',
        properties: {},
      } as any,
    },
    {
      name: 'get_tasks_by_project',
      description: 'Get tasks grouped by project',
      inputSchema: {
        type: 'object',
        properties: {},
      } as any,
    }
  );

  // Add Kanban plugin tools
  tools.push(
    {
      name: 'create_kanban_board',
      description: 'Create a new Kanban board with specified lanes',
      inputSchema: {
        type: 'object',
        properties: {
          boardName: {
            type: 'string',
            description: 'Name of the Kanban board',
          },
          laneNames: {
            type: 'array',
            items: { type: 'string' },
            description: 'Names of the lanes/columns',
            default: ['To Do', 'Doing', 'Done'],
          },
          filePath: {
            type: 'string',
            description: 'Optional file path for the board (defaults to boardName.md)',
          },
        },
        required: ['boardName'],
      } as any,
    },
    {
      name: 'add_kanban_card',
      description: 'Add a card to a Kanban board lane',
      inputSchema: {
        type: 'object',
        properties: {
          boardPath: {
            type: 'string',
            description: 'Path to the Kanban board file',
          },
          laneTitle: {
            type: 'string',
            description: 'Title of the lane to add the card to',
          },
          title: {
            type: 'string',
            description: 'Card title',
          },
          content: {
            type: 'string',
            description: 'Card content/description',
          },
          assignee: {
            type: 'string',
            description: 'Card assignee',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Card tags',
          },
          dueDate: {
            type: 'string',
            description: 'Due date (YYYY-MM-DD format)',
          },
          checkItems: {
            type: 'array',
            items: { type: 'string' },
            description: 'Checklist items',
          },
        },
        required: ['boardPath', 'laneTitle', 'title'],
      } as any,
    },
    {
      name: 'move_kanban_card',
      description: 'Move a card between lanes in a Kanban board',
      inputSchema: {
        type: 'object',
        properties: {
          boardPath: {
            type: 'string',
            description: 'Path to the Kanban board file',
          },
          cardId: {
            type: 'string',
            description: 'ID of the card to move',
          },
          targetLaneTitle: {
            type: 'string',
            description: 'Title of the target lane',
          },
          position: {
            type: 'number',
            description: 'Position in the target lane (0-based, optional)',
          },
        },
        required: ['boardPath', 'cardId', 'targetLaneTitle'],
      } as any,
    },
    {
      name: 'update_kanban_card',
      description: 'Update a Kanban card properties',
      inputSchema: {
        type: 'object',
        properties: {
          boardPath: {
            type: 'string',
            description: 'Path to the Kanban board file',
          },
          cardId: {
            type: 'string',
            description: 'ID of the card to update',
          },
          title: {
            type: 'string',
            description: 'New card title',
          },
          content: {
            type: 'string',
            description: 'New card content',
          },
          assignee: {
            type: 'string',
            description: 'New assignee',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'New tags',
          },
          dueDate: {
            type: 'string',
            description: 'New due date (YYYY-MM-DD format)',
          },
          checkItems: {
            type: 'array',
            items: { type: 'string' },
            description: 'New checklist items',
          },
        },
        required: ['boardPath', 'cardId'],
      } as any,
    },
    {
      name: 'list_kanban_boards',
      description: 'List all Kanban boards in the vault',
      inputSchema: {
        type: 'object',
        properties: {},
      } as any,
    },
    {
      name: 'get_kanban_board',
      description: 'Get detailed information about a specific Kanban board',
      inputSchema: {
        type: 'object',
        properties: {
          boardPath: {
            type: 'string',
            description: 'Path to the Kanban board file',
          },
        },
        required: ['boardPath'],
      } as any,
    },
    {
      name: 'delete_kanban_card',
      description: 'Delete a card from a Kanban board',
      inputSchema: {
        type: 'object',
        properties: {
          boardPath: {
            type: 'string',
            description: 'Path to the Kanban board file',
          },
          cardId: {
            type: 'string',
            description: 'ID of the card to delete',
          },
        },
        required: ['boardPath', 'cardId'],
      } as any,
    },
    {
      name: 'archive_kanban_card',
      description: 'Archive a card from a Kanban board',
      inputSchema: {
        type: 'object',
        properties: {
          boardPath: {
            type: 'string',
            description: 'Path to the Kanban board file',
          },
          cardId: {
            type: 'string',
            description: 'ID of the card to archive',
          },
        },
        required: ['boardPath', 'cardId'],
      } as any,
    }
  );

  // Additional missing functions
  tools.push(
    // Note Analysis Functions (2 functions)
    {
      name: 'get_note_statistics',
      description: 'Get detailed statistics about a note (word count, character count, reading time, etc.)',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the note file (relative to vault root)',
          },
          title: {
            type: 'string',
            description: 'Title of the note (alternative to path)',
          },
          folder: {
            type: 'string',
            description: 'Folder containing the note (used with title)',
          },
        },
      } as any,
    },
    {
      name: 'analyze_note_structure',
      description: 'Analyze note structure including headings, links, content distribution',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the note file (relative to vault root)',
          },
          title: {
            type: 'string',
            description: 'Title of the note (alternative to path)',
          },
          folder: {
            type: 'string',
            description: 'Folder containing the note (used with title)',
          },
        },
      } as any,
    }
  );
  
  return { tools };
});

// Tool handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'list_vaults': {
      discoveredVaults = await findVaults();
      
      if (discoveredVaults.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'Obsidian保管庫が見つかりませんでした。最初に保管庫を作成してください。',
            },
          ],
        };
      }
      
      const prompt = createVaultSelectionPrompt(discoveredVaults);
      return {
        content: [
          {
            type: 'text',
            text: prompt,
          },
        ],
      };
    }

    case 'select_vault': {
      const { vault_path } = args as any;
      
      // Validate vault exists
      try {
        const stats = await fs.stat(vault_path);
        if (!stats.isDirectory()) {
          throw new Error('Not a directory');
        }
        
        selectedVault = vault_path;
        workflowState.vaultSelected = true;
        await initializePlugins();
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ 保管庫が選択されました\n\n**保管庫パス:** ${vault_path}\n**保管庫名:** ${path.basename(vault_path)}\n\n**次のステップ:**\n- ノートを作成: create_note()\n- テンプレートを作成: create_custom_template()\n- 既存ノートを検索: search_notes()\n- 書籍検索: search_books()`,
            },
          ],
        };
      } catch (error) {
        return createErrorResponse('INVALID_PATH', `指定されたパスの保管庫にアクセスできません: ${vault_path}`);
      }
    }

    case 'list_templates': {
      if (!selectedVault || !templaterPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected or Templater not available.',
            },
          ],
        };
      }
      
      const templates = await templaterPlugin.listTemplates();
      
      if (templates.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No templates found in the Templates folder.',
            },
          ],
        };
      }
      
      let result = `Found ${templates.length} template(s):\n\n`;
      templates.forEach(t => {
        result += `📝 ${t.name}`;
        if (t.description) {
          result += ` - ${t.description}`;
        }
        result += '\n';
      });
      
      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    }

    case 'create_from_template': {
      // REQ-001: 厳密な保管庫選択チェック
      const vaultError = requireExplicitVaultSelection();
      if (vaultError) {
        return vaultError;
      }

      if (!templaterPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'Templaterプラグインが利用できません。',
            },
          ],
        };
      }
      
      const { template_name, title: inputTitle, folder, variables = [], confirm = false } = args as any;

      // REQ-002: Folder specification requirement
      if (folder === undefined && !confirm) {
        return {
          content: [
            {
              type: 'text',
              text: `=== 保存先フォルダの指定 ===\nテンプレートから作成するファイルを保存するフォルダを指定してください。\n\n例:\n  - Templates/     (テンプレート用)\n  - Meeting/       (議事録用)\n  - Daily/         (デイリーノート用)\n  - Notes/         (一般ノート用)\n  - ""             (ルートフォルダ)\n\n使用方法：create_from_template(template_name: "${template_name}", title: "${inputTitle || 'ノートタイトル'}", folder: "フォルダパス", confirm: true)`
            },
          ],
        };
      }

      const finalFolder = folder || '';
      
      // Handle missing title - ask for title or generate default
      let finalTitle = inputTitle;
      if (!finalTitle) {
        finalTitle = generateDefaultTitle();
      }
      
      // User confirmation required for note creation from template
      if (!confirm) {
        const targetPath = path.join(finalFolder, `${finalTitle}.md`);
        const fullTargetPath = path.join(selectedVault, finalFolder, `${finalTitle}.md`);
        
        // Check if folder exists
        let folderStatus = '';
        try {
          const folderPath = path.join(selectedVault, finalFolder);
          if (finalFolder) {
            await fs.access(folderPath);
            folderStatus = '✅ 既存フォルダ';
          } else {
            folderStatus = '📁 ルートフォルダ';
          }
        } catch {
          folderStatus = '🆕 新規フォルダ（作成されます）';
        }
        
        // Check if file already exists
        let fileStatus = '';
        try {
          await fs.access(fullTargetPath);
          fileStatus = '⚠️ **既存ファイルを上書きします**';
        } catch {
          fileStatus = '🆕 新規ファイル';
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `📝 テンプレートからノート作成の確認\n\n**作成するノート:**\n- テンプレート: ${template_name}\n- タイトル: ${finalTitle}\n- 相対パス: ${targetPath}\n- 絶対パス: ${fullTargetPath}\n\n**保存先フォルダ詳細:**\n- フォルダ: ${folder || '（ルート）'}\n- 状態: ${folderStatus}\n\n**ファイル状態:**\n- ${fileStatus}\n\n**確認事項:**\n${!folder ? '- ルートフォルダに保存されます\n' : ''}${fileStatus.includes('上書き') ? '- 既存ファイルが上書きされます\n' : ''}${folderStatus.includes('新規') ? '- 新しいフォルダが作成されます\n' : ''}\n本当にこの場所にテンプレートからノートを作成しますか？\n\n✅ **作成する**: create_from_template(template_name: "${template_name}", title: "${finalTitle}", folder: "${folder}", confirm: true)\n❌ **キャンセル**: 操作をキャンセルします`,
            },
          ],
        };
      }
      
      const notePath = path.join(folder, `${finalTitle}.md`);
      
      const templaterVars: TemplaterVariable[] = variables.map((v: any) => ({
        name: v.name,
        value: v.value,
      }));
      
      const result = await templaterPlugin.createNoteFromTemplate(
        template_name,
        notePath,
        templaterVars
      );
      
      if (result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Note created from template!\n\nTemplate: ${template_name}\nPath: ${result.path}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${result.error}`,
            },
          ],
        };
      }
    }

    case 'process_template': {
      if (!selectedVault || !templaterPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected or Templater not available.',
            },
          ],
        };
      }
      
      const { template, variables = [] } = args as any;
      
      const templaterVars: TemplaterVariable[] = variables.map((v: any) => ({
        name: v.name,
        value: v.value,
      }));
      
      const processed = templaterPlugin.processTemplate(template, templaterVars);
      
      return {
        content: [
          {
            type: 'text',
            text: processed,
          },
        ],
      };
    }

    case 'create_custom_template': {
      // REQ-001: 厳密な保管庫選択チェック
      const vaultError = requireExplicitVaultSelection();
      if (vaultError) {
        return vaultError;
      }
      
      const { name, template_type = 'note', template_option, folder, confirm = false } = args as any;
      
      // REQ-002: Check folder specification
      if (!folder && workflowState.interactiveMode) {
        return {
          content: [
            {
              type: 'text',
              text: createFolderSelectionPrompt(),
            },
          ],
        };
      }
      
      // REQ-003: Interactive template selection
      if (!template_option && !confirm) {
        const templateOptions = generateTemplateOptions(template_type);
        const selectionPrompt = createTemplateSelectionPrompt(templateOptions);
        
        return {
          content: [
            {
              type: 'text',
              text: selectionPrompt,
            },
          ],
        };
      }
      
      // Validate template option
      if (template_option && (template_option < 1 || template_option > 3)) {
        return createErrorResponse('TEMPLATE_NOT_CONFIRMED', 'テンプレートオプションは1-3の範囲で指定してください');
      }
      
      // Show confirmation before creating
      if (!confirm) {
        const templateOptions = generateTemplateOptions(template_type);
        const selectedOption = templateOptions[template_option - 1];
        
        const confirmationText = `📝 **テンプレート作成の確認**

**作成するテンプレート:**
- **名前**: ${name}
- **タイプ**: ${template_type}
- **オプション**: ${selectedOption.name} (${selectedOption.description})
- **保存先**: ${folder || 'Templates/'}

**プレビュー:**
\`\`\`
${selectedOption.content.substring(0, 200)}${selectedOption.content.length > 200 ? '...' : ''}
\`\`\`

本当にこのテンプレートを作成しますか？

✅ **作成する**: create_custom_template(name: "${name}", template_type: "${template_type}", template_option: ${template_option}, folder: "${folder}", confirm: true)
❌ **キャンセル**: 操作をキャンセルします`;

        return {
          content: [
            {
              type: 'text',
              text: confirmationText,
            },
          ],
        };
      }
      
      // Create the template
      try {
        const templateOptions = generateTemplateOptions(template_type);
        const selectedOption = templateOptions[template_option - 1];
        
        const templateDir = path.join(selectedVault, folder || 'Templates');
        const templatePath = path.join(templateDir, `${name}.md`);
        
        // Ensure directory exists
        await fs.mkdir(templateDir, { recursive: true });
        
        // Write template file
        await fs.writeFile(templatePath, selectedOption.content, 'utf-8');
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ **テンプレート作成完了**

**作成されたテンプレート:**
- **名前**: ${name}
- **タイプ**: ${template_type} - ${selectedOption.name}
- **パス**: ${path.relative(selectedVault, templatePath)}

**次のステップ:**
- テンプレートを使用してノート作成: create_from_template(template_name: "${name}")
- テンプレート一覧確認: list_templates()`,
            },
          ],
        };
      } catch (error) {
        return createErrorResponse('INVALID_PATH', `テンプレート作成に失敗しました: ${error}`);
      }
    }

    case 'search_book_by_isbn': {
      if (!bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'Book Search plugin not available.',
            },
          ],
        };
      }
      
      const { isbn, create_note = false, template, folder = 'Books' } = args as any;
      
      // First try exact ISBN search
      let book = await bookSearchPlugin.searchByISBN(isbn);
      
      if (!book) {
        // If ISBN search fails, try title search with the ISBN (sometimes books are listed differently)
        const alternativeResults = await bookSearchPlugin.searchByTitle(isbn);
        
        if (alternativeResults.length > 0) {
          // Show up to 5 alternatives
          const limitedResults = alternativeResults.slice(0, 5);
          let result = `Direct ISBN search failed, but found ${limitedResults.length} possible match(es):\n\n`;
          
          // Store results for easy selection
          lastBookSearchResults = limitedResults;
          
          limitedResults.forEach((b, index) => {
            result += `## 📚 Option ${index + 1}: ${b.title}\n`;
            result += `- **Author**: ${b.author.join(', ')}\n`;
            if (b.isbn && b.isbn !== isbn) result += `- **ISBN**: ${b.isbn}\n`;
            if (b.publishedDate) result += `- **Published**: ${b.publishedDate}\n`;
            if (b.publisher) result += `- **Publisher**: ${b.publisher}\n`;
            if (b.pageCount) result += `- **Pages**: ${b.pageCount}\n`;
            if (b.rating) result += `- **Rating**: ${b.rating}/5\n`;
            result += '\n';
          });
          
          result += `\n💡 **To create a note**: Use 'create_book_note' with option_number: 1-${limitedResults.length}`;
          
          return {
            content: [
              {
                type: 'text',
                text: result,
              },
            ],
          };
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `No book found with ISBN: ${isbn}`,
            },
          ],
        };
      }
      
      let result = `Found book:\n\n${bookSearchPlugin.formatAsMarkdown(book)}`;
      
      if (create_note && selectedVault) {
        const noteTitle = `${book.title} - ${book.author.join(', ')}`;
        const notePath = path.join(selectedVault, folder, `${noteTitle}.md`);
        
        let content: string;
        if (template && templaterPlugin) {
          const templateContent = await templaterPlugin.getTemplate(template);
          if (templateContent) {
            content = bookSearchPlugin.formatAsMarkdown(book, templateContent);
          } else {
            content = bookSearchPlugin.formatAsMarkdown(book);
          }
        } else {
          content = bookSearchPlugin.formatAsMarkdown(book);
        }
        
        // Add metadata
        const metadata = {
          tags: ['book', 'reading'],
          isbn: book.isbn,
          author: book.author,
          rating: book.rating,
          created: new Date().toISOString(),
        };
        
        const fullContent = createFrontmatter(metadata) + content;
        
        await fs.mkdir(path.dirname(notePath), { recursive: true });
        await fs.writeFile(notePath, fullContent, 'utf-8');
        
        result += `\n\nNote created at: ${path.relative(selectedVault, notePath)}`;
      }
      
      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    }

    case 'search_book_by_title': {
      if (!bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'Book Search plugin not available.',
            },
          ],
        };
      }
      
      const { title, author, max_results = 5 } = args as any;
      
      const books = await bookSearchPlugin.searchByTitle(title, author);
      
      if (books.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No books found for: ${title}${author ? ` by ${author}` : ''}`,
            },
          ],
        };
      }
      
      const limitedBooks = books.slice(0, Math.min(max_results, 5));
      
      // Store results for easy selection
      lastBookSearchResults = limitedBooks;
      
      let result = `Found ${books.length} book(s), showing top ${limitedBooks.length}:\n\n`;
      
      limitedBooks.forEach((book, index) => {
        result += `## 📚 Option ${index + 1}: ${book.title}\n`;
        result += `- **Author(s)**: ${book.author.join(', ')}\n`;
        if (book.isbn) result += `- **ISBN**: ${book.isbn}\n`;
        if (book.publishedDate) result += `- **Published**: ${book.publishedDate}\n`;
        if (book.publisher) result += `- **Publisher**: ${book.publisher}\n`;
        if (book.pageCount) result += `- **Pages**: ${book.pageCount}\n`;
        if (book.categories && book.categories.length > 0) {
          result += `- **Categories**: ${book.categories.slice(0, 3).join(', ')}\n`;
        }
        if (book.rating) result += `- **Rating**: ⭐ ${book.rating}/5\n`;
        if (book.description) {
          const shortDesc = book.description.length > 200 
            ? book.description.substring(0, 200) + '...' 
            : book.description;
          result += `- **Description**: ${shortDesc}\n`;
        }
        result += '\n';
      });
      
      result += `---\n\n`;
      result += `💡 **Next Steps:**\n`;
      result += `1. To create a note: Use 'create_book_note' with **option_number: 1-${limitedBooks.length}**\n`;
      result += `   Example: create_book_note(option_number: 1)\n`;
      result += `2. To search by ISBN for more accurate results, use 'search_book_by_isbn'\n`;
      result += `3. To refine your search, try adding the author name or being more specific\n`;
      
      if (books.length > max_results) {
        result += `\n📊 *Showing ${limitedBooks.length} of ${books.length} total results. Adjust max_results parameter to see more.*`;
      }
      
      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    }

    case 'create_book_note': {
      if (!selectedVault || !bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected or Book Search not available.',
            },
          ],
        };
      }
      
      const { book_data, option_number, template, folder = 'Books' } = args as any;
      
      // Check if template is specified and templater is available
      if (templaterPlugin) {
        const templates = await templaterPlugin.listTemplates();
        
        if (template) {
          // Verify specified template exists
          const templateExists = templates.some(t => 
            t.name.toLowerCase() === template.toLowerCase() || 
            t.name.toLowerCase() === `${template.toLowerCase()}.md`
          );
          
          if (!templateExists) {
            const availableTemplates = templates.map(t => t.name).join('\n- ');
            return {
              content: [
                {
                  type: 'text',
                  text: `Template '${template}' not found.\n\nAvailable templates:\n- ${availableTemplates}\n\nPlease use one of the available templates or create the template first.`,
                },
              ],
            };
          }
        } else if (templates.length > 0) {
          // No template specified but templates are available - prompt user to select
          const templateList = templates.map((t, index) => `${index + 1}. ${t.name}`).join('\n');
          return {
            content: [
              {
                type: 'text',
                text: `テンプレートが指定されていません。保管庫内で利用可能なテンプレートから選択してください:\n\n${templateList}\n\nテンプレートを使用する場合は、template パラメータを指定して再実行してください。\n例: create_book_note(option_number: ${option_number || 1}, template: "Book Review")\n\nテンプレートを使用せずにデフォルト形式で作成する場合は、template: "none" を指定してください。`,
              },
            ],
          };
        }
      }
      
      let book: BookMetadata;
      
      // Check if using option_number from last search
      if (option_number && !book_data) {
        if (lastBookSearchResults.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No recent search results. Please search for a book first.',
              },
            ],
          };
        }
        
        const index = option_number - 1;
        if (index < 0 || index >= lastBookSearchResults.length) {
          return {
            content: [
              {
                type: 'text',
                text: `Invalid option number. Please choose between 1 and ${lastBookSearchResults.length}`,
              },
            ],
          };
        }
        
        book = lastBookSearchResults[index];
      } else if (book_data) {
        book = book_data as BookMetadata;
      } else {
        return {
          content: [
            {
              type: 'text',
              text: 'Please provide either book_data or option_number from a previous search.',
            },
          ],
        };
      }
      
      const noteTitle = `${book.title} - ${book.author.join(', ')}`;
      const notePath = path.join(selectedVault, folder, `${noteTitle}.md`);
      
      let content: string = '';
      let useDefaultFormat = true;
      
      if (template && template.toLowerCase() !== 'none' && templaterPlugin) {
        const templateContent = await templaterPlugin.getTemplate(template);
        if (templateContent) {
          // Use template format ONLY - no additional formatting
          content = bookSearchPlugin.formatAsMarkdown(book, templateContent);
          useDefaultFormat = false;
        }
      }
      
      if (useDefaultFormat) {
        // Only use default format if no template is specified, template is "none", or template not found
        if (template && template.toLowerCase() !== 'none') {
          return {
            content: [
              {
                type: 'text',
                text: `Template '${template}' was specified but no template content found. Please create the template first or use 'list_templates' to see available templates.`,
              },
            ],
          };
        }
        content = bookSearchPlugin.formatAsMarkdown(book);
        
        // Add metadata only for default format
        const metadata = {
          tags: ['book', 'reading'],
          isbn: book.isbn,
          author: book.author,
          rating: book.rating,
          created: new Date().toISOString(),
        };
        content = createFrontmatter(metadata) + content;
      }
      
      // Ensure content is defined before use
      if (!content) {
        content = bookSearchPlugin.formatAsMarkdown(book);
      }
      
      const fullContent = content;
      
      await fs.mkdir(path.dirname(notePath), { recursive: true });
      await fs.writeFile(notePath, fullContent, 'utf-8');
      
      return {
        content: [
          {
            type: 'text',
            text: `Book note created${template ? ` using template '${template}'` : ''}!\n\nTitle: ${book.title}\nPath: ${path.relative(selectedVault, notePath)}`,
          },
        ],
      };
    }

    case 'search_books_by_category': {
      if (!bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'Book Search plugin not available.',
            },
          ],
        };
      }
      
      const { category, max_results = 10 } = args as any;
      
      try {
        // Search for books in the specified category using title search (most APIs don't have dedicated category search)
        const books = await bookSearchPlugin.searchByTitle(category);
        
        if (books.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `📚 カテゴリ「${category}」の書籍が見つかりませんでした。\n\n別のカテゴリ名を試すか、より一般的な用語を使用してください。`,
              },
            ],
          };
        }
        
        const limitedBooks = books.slice(0, Math.min(max_results, 10));
        lastBookSearchResults = limitedBooks;
        
        let result = `📚 カテゴリ「${category}」で${books.length}冊の書籍を発見、上位${limitedBooks.length}冊を表示:\n\n`;
        
        limitedBooks.forEach((book, index) => {
          result += `## 📖 選択肢 ${index + 1}: ${book.title}\n`;
          result += `- **著者**: ${book.author.join(', ')}\n`;
          if (book.isbn) result += `- **ISBN**: ${book.isbn}\n`;
          if (book.publishedDate) result += `- **出版年**: ${book.publishedDate}\n`;
          if (book.publisher) result += `- **出版社**: ${book.publisher}\n`;
          if (book.categories && book.categories.length > 0) {
            result += `- **カテゴリ**: ${book.categories.slice(0, 3).join(', ')}\n`;
          }
          if (book.rating) result += `- **評価**: ⭐ ${book.rating}/5\n`;
          result += '\n';
        });
        
        result += `---\n\n💡 **次のステップ:**\n`;
        result += `1. ノート作成: 'create_book_note' に **option_number: 1-${limitedBooks.length}** を指定\n`;
        result += `2. 詳細検索: ISBN検索やより具体的なタイトル検索を試す\n`;
        
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `カテゴリ検索エラー: ${error}`,
            },
          ],
        };
      }
    }

    case 'get_book_recommendations': {
      if (!bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'Book Search plugin not available.',
            },
          ],
        };
      }
      
      const { based_on_book, genre, max_results = 5 } = args as any;
      
      try {
        let books: BookMetadata[] = [];
        let searchTerm = '';
        
        if (based_on_book) {
          // Extract author or similar themes from the book
          searchTerm = `${based_on_book} similar recommendations`;
        } else if (genre) {
          searchTerm = `${genre} bestseller recommendations`;
        } else {
          return {
            content: [
              {
                type: 'text',
                text: '📚 推薦基準を指定してください。\n\n**例:**\n- based_on_book: "ハリー・ポッター" (類似書籍推薦)\n- genre: "SF" (ジャンル別推薦)',
              },
            ],
          };
        }
        
        books = await bookSearchPlugin.searchByTitle(searchTerm);
        
        if (books.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `🔍 「${based_on_book || genre}」に基づく推薦書籍が見つかりませんでした。\n\n別のキーワードを試してください。`,
              },
            ],
          };
        }
        
        const limitedBooks = books.slice(0, Math.min(max_results, 5));
        lastBookSearchResults = limitedBooks;
        
        let result = `🎯 推薦書籍リスト\n`;
        result += based_on_book ? `「${based_on_book}」に基づく推薦:\n\n` : `「${genre}」ジャンルの推薦:\n\n`;
        
        limitedBooks.forEach((book, index) => {
          result += `## 🌟 推薦 ${index + 1}: ${book.title}\n`;
          result += `- **著者**: ${book.author.join(', ')}\n`;
          if (book.publishedDate) result += `- **出版年**: ${book.publishedDate}\n`;
          if (book.rating) result += `- **評価**: ⭐ ${book.rating}/5\n`;
          if (book.description) {
            const shortDesc = book.description.length > 150 ? 
              book.description.substring(0, 150) + '...' : 
              book.description;
            result += `- **概要**: ${shortDesc}\n`;
          }
          result += '\n';
        });
        
        result += `💡 **ノート作成**: create_book_note(option_number: 1-${limitedBooks.length})\n`;
        
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `推薦書籍検索エラー: ${error}`,
            },
          ],
        };
      }
    }

    case 'create_reading_list': {
      if (!selectedVault || !bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected or Book Search not available.',
            },
          ],
        };
      }
      
      const { list_name, theme, books = [], folder = 'Reading Lists' } = args as any;
      
      if (!list_name) {
        return {
          content: [
            {
              type: 'text',
              text: '📋 読書リスト名を指定してください。\n\n**例**: create_reading_list(list_name: "2024年科学技術書", theme: "AI・機械学習")',
            },
          ],
        };
      }
      
      try {
        let content = `# ${list_name}\n\n`;
        content += `**作成日**: ${new Date().toLocaleDateString('ja-JP')}\n`;
        if (theme) content += `**テーマ**: ${theme}\n`;
        content += `**ステータス**: 📚 進行中\n\n`;
        
        content += `## 📖 読書リスト\n\n`;
        
        if (books.length > 0) {
          books.forEach((book: any, index: number) => {
            content += `### ${index + 1}. ${book.title || book}\n`;
            content += `- [ ] 読了\n`;
            if (typeof book === 'object') {
              if (book.author) content += `- **著者**: ${Array.isArray(book.author) ? book.author.join(', ') : book.author}\n`;
              if (book.isbn) content += `- **ISBN**: ${book.isbn}\n`;
              if (book.notes) content += `- **メモ**: ${book.notes}\n`;
            }
            content += `- **読書開始日**: \n`;
            content += `- **読了日**: \n`;
            content += `- **評価**: /5\n`;
            content += `- **感想**: \n\n`;
          });
        } else if (theme) {
          // Auto-populate with theme-based recommendations
          const searchResults = await bookSearchPlugin.searchByTitle(theme);
          const topBooks = searchResults.slice(0, 5);
          
          if (topBooks.length > 0) {
            content += `*以下は「${theme}」テーマの推薦書籍です:*\n\n`;
            topBooks.forEach((book, index) => {
              content += `### ${index + 1}. ${book.title}\n`;
              content += `- [ ] 読了\n`;
              content += `- **著者**: ${book.author.join(', ')}\n`;
              if (book.isbn) content += `- **ISBN**: ${book.isbn}\n`;
              content += `- **読書開始日**: \n`;
              content += `- **読了日**: \n`;
              content += `- **評価**: /5\n`;
              content += `- **感想**: \n\n`;
            });
          }
        } else {
          content += `*書籍を追加してリストを完成させてください*\n\n`;
          content += `### 1. \n`;
          content += `- [ ] 読了\n`;
          content += `- **著者**: \n`;
          content += `- **読書開始日**: \n`;
          content += `- **読了日**: \n`;
          content += `- **評価**: /5\n`;
          content += `- **感想**: \n\n`;
        }
        
        content += `## 📊 進捗状況\n\n`;
        content += `- **総書籍数**: ${books.length || (theme ? 5 : 1)}\n`;
        content += `- **読了数**: 0\n`;
        content += `- **進捗率**: 0%\n\n`;
        
        content += `## 🎯 読書目標\n\n`;
        content += `- **目標完了日**: \n`;
        content += `- **1週間あたりの読書時間**: \n`;
        content += `- **目標**: \n\n`;
        
        content += `## 📝 全体感想・学び\n\n`;
        content += `*読書リスト完了後の総評を記入*\n\n`;
        
        const notePath = path.join(selectedVault, folder, `${list_name}.md`);
        
        // Add frontmatter
        const metadata = {
          tags: ['reading-list', 'books'],
          theme: theme || '',
          created: new Date().toISOString(),
          status: 'in-progress',
          total_books: books.length || (theme ? 5 : 1),
          completed_books: 0,
        };
        
        const fullContent = createFrontmatter(metadata) + content;
        
        await fs.mkdir(path.dirname(notePath), { recursive: true });
        await fs.writeFile(notePath, fullContent, 'utf-8');
        
        return {
          content: [
            {
              type: 'text',
              text: `📋 読書リスト作成完了!\n\n**リスト名**: ${list_name}\n**パス**: ${path.relative(selectedVault, notePath)}\n**書籍数**: ${books.length || (theme ? 5 : 1)}冊\n\n読書リストに書籍を追加したり、読書進捗を更新してください。`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `読書リスト作成エラー: ${error}`,
            },
          ],
        };
      }
    }

    case 'format_book_template': {
      if (!bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'Book Search plugin not available.',
            },
          ],
        };
      }
      
      const { book_data, template_string, variables = {} } = args as any;
      
      if (!book_data || !template_string) {
        return {
          content: [
            {
              type: 'text',
              text: '📝 書籍データとテンプレート文字列が必要です。\n\n**例**:\nformat_book_template(\n  book_data: {...},\n  template_string: "# {{title}}\\n\\n著者: {{author}}\\n評価: {{rating}}/5"\n)',
            },
          ],
        };
      }
      
      try {
        // Process template with custom variables
        let processedTemplate = template_string;
        
        // Add custom variables to template processing
        Object.keys(variables).forEach(key => {
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
          processedTemplate = processedTemplate.replace(regex, variables[key] || '');
        });
        
        const formattedContent = bookSearchPlugin.formatAsMarkdown(book_data, processedTemplate);
        
        return {
          content: [
            {
              type: 'text',
              text: `📄 フォーマット結果:\n\n---\n\n${formattedContent}\n\n---\n\n💡 このコンテンツをノートとして保存する場合は create_book_note を使用してください。`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `テンプレートフォーマットエラー: ${error}`,
            },
          ],
        };
      }
    }

    case 'get_book_details': {
      if (!bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'Book Search plugin not available.',
            },
          ],
        };
      }
      
      const { isbn, title, author } = args as any;
      
      if (!isbn && !title) {
        return {
          content: [
            {
              type: 'text',
              text: '🔍 ISBNまたはタイトルを指定してください。\n\n**例**:\n- get_book_details(isbn: "9784123456789")\n- get_book_details(title: "ハリー・ポッター", author: "J.K.ローリング")',
            },
          ],
        };
      }
      
      try {
        let book: BookMetadata | null = null;
        
        if (isbn) {
          book = await bookSearchPlugin.searchByISBN(isbn);
        } else {
          const books = await bookSearchPlugin.searchByTitle(title, author);
          book = books.length > 0 ? books[0] : null;
        }
        
        if (!book) {
          return {
            content: [
              {
                type: 'text',
                text: `📚 指定された書籍が見つかりませんでした。\n\n検索条件: ${isbn ? `ISBN: ${isbn}` : `タイトル: ${title}${author ? `, 著者: ${author}` : ''}`}`,
              },
            ],
          };
        }
        
        let result = `📖 **書籍詳細情報**\n\n`;
        result += `**タイトル**: ${book.title}\n`;
        result += `**著者**: ${book.author.join(', ')}\n`;
        if (book.isbn) result += `**ISBN**: ${book.isbn}\n`;
        if (book.publisher) result += `**出版社**: ${book.publisher}\n`;
        if (book.publishedDate) result += `**出版年**: ${book.publishedDate}\n`;
        if (book.pageCount) result += `**ページ数**: ${book.pageCount}\n`;
        if (book.language) result += `**言語**: ${book.language}\n`;
        if (book.rating) result += `**評価**: ⭐ ${book.rating}/5\n`;
        if (book.categories && book.categories.length > 0) {
          result += `**カテゴリ**: ${book.categories.join(', ')}\n`;
        }
        result += '\n';
        
        if (book.description) {
          result += `**📝 概要**:\n${book.description}\n\n`;
        }
        
        if (book.thumbnail) {
          result += `**🖼️ カバー画像**: ${book.thumbnail}\n\n`;
        }
        
        result += `---\n\n`;
        result += `💡 **次のアクション**:\n`;
        result += `1. ノート作成: create_book_note(book_data: <この書籍データ>)\n`;
        result += `2. 読書リストに追加: create_reading_list() で使用\n`;
        result += `3. 類似書籍検索: get_book_recommendations(based_on_book: "${book.title}")\n`;
        
        // Store for easy note creation
        lastBookSearchResults = [book];
        
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `書籍詳細取得エラー: ${error}`,
            },
          ],
        };
      }
    }

    case 'search_books_by_author': {
      if (!bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'Book Search plugin not available.',
            },
          ],
        };
      }
      
      const { author, max_results = 10 } = args as any;
      
      if (!author) {
        return {
          content: [
            {
              type: 'text',
              text: '👤 著者名を指定してください。\n\n**例**: search_books_by_author(author: "村上春樹")',
            },
          ],
        };
      }
      
      try {
        const books = await bookSearchPlugin.searchByTitle('', author);
        
        if (books.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `📚 著者「${author}」の書籍が見つかりませんでした。\n\n著者名のスペルや表記を確認してください。`,
              },
            ],
          };
        }
        
        const limitedBooks = books.slice(0, Math.min(max_results, 10));
        lastBookSearchResults = limitedBooks;
        
        let result = `👤 著者「${author}」の作品 ${books.length}冊発見、上位${limitedBooks.length}冊を表示:\n\n`;
        
        limitedBooks.forEach((book, index) => {
          result += `## 📚 作品 ${index + 1}: ${book.title}\n`;
          result += `- **出版年**: ${book.publishedDate || '不明'}\n`;
          if (book.isbn) result += `- **ISBN**: ${book.isbn}\n`;
          if (book.publisher) result += `- **出版社**: ${book.publisher}\n`;
          if (book.pageCount) result += `- **ページ数**: ${book.pageCount}\n`;
          if (book.rating) result += `- **評価**: ⭐ ${book.rating}/5\n`;
          if (book.description) {
            const shortDesc = book.description.length > 200 ? 
              book.description.substring(0, 200) + '...' : 
              book.description;
            result += `- **概要**: ${shortDesc}\n`;
          }
          result += '\n';
        });
        
        result += `---\n\n💡 **次のアクション**:\n`;
        result += `1. ノート作成: create_book_note(option_number: 1-${limitedBooks.length})\n`;
        result += `2. 読書リスト作成: create_reading_list(list_name: "${author}作品集")\n`;
        result += `3. 詳細情報: get_book_details() で個別書籍の詳細を取得\n`;
        
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `著者検索エラー: ${error}`,
            },
          ],
        };
      }
    }

    case 'compare_book_editions': {
      if (!bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'Book Search plugin not available.',
            },
          ],
        };
      }
      
      const { title, author } = args as any;
      
      if (!title) {
        return {
          content: [
            {
              type: 'text',
              text: '📚 比較する書籍のタイトルを指定してください。\n\n**例**: compare_book_editions(title: "1984", author: "George Orwell")',
            },
          ],
        };
      }
      
      try {
        const books = await bookSearchPlugin.searchByTitle(title, author);
        
        if (books.length < 2) {
          return {
            content: [
              {
                type: 'text',
                text: `📖 「${title}」の複数版が見つかりませんでした（${books.length}件）。\n\n単一版の詳細を取得する場合は get_book_details を使用してください。`,
              },
            ],
          };
        }
        
        // Group by similar titles (different editions)
        const editions = books.slice(0, 5); // Limit to 5 editions
        lastBookSearchResults = editions;
        
        let result = `📚 「${title}」版比較 (${editions.length}版):\n\n`;
        
        editions.forEach((book, index) => {
          result += `## 📖 版 ${index + 1}: ${book.title}\n`;
          result += `- **出版社**: ${book.publisher || '不明'}\n`;
          result += `- **出版年**: ${book.publishedDate || '不明'}\n`;
          if (book.isbn) result += `- **ISBN**: ${book.isbn}\n`;
          if (book.pageCount) result += `- **ページ数**: ${book.pageCount}\n`;
          if (book.language) result += `- **言語**: ${book.language}\n`;
          if (book.rating) result += `- **評価**: ⭐ ${book.rating}/5\n`;
          
          // Price comparison would need additional API
          result += `- **特徴**: `;
          if (book.categories && book.categories.length > 0) {
            result += book.categories.slice(0, 2).join(', ');
          } else {
            result += '標準版';
          }
          result += '\n\n';
        });
        
        // Comparison summary
        result += `## 📊 版比較サマリー\n\n`;
        result += `| 項目 | 版1 | 版2${editions.length > 2 ? ' | 版3' : ''}${editions.length > 3 ? ' | 版4' : ''}${editions.length > 4 ? ' | 版5' : ''} |\n`;
        result += `|------|-----|-----${editions.length > 2 ? '|-----' : ''}${editions.length > 3 ? '|-----' : ''}${editions.length > 4 ? '|-----' : ''} |\n`;
        result += `| 出版社 | ${editions[0]?.publisher || '-'} | ${editions[1]?.publisher || '-'}${editions.length > 2 ? ` | ${editions[2]?.publisher || '-'}` : ''}${editions.length > 3 ? ` | ${editions[3]?.publisher || '-'}` : ''}${editions.length > 4 ? ` | ${editions[4]?.publisher || '-'}` : ''} |\n`;
        result += `| 出版年 | ${editions[0]?.publishedDate || '-'} | ${editions[1]?.publishedDate || '-'}${editions.length > 2 ? ` | ${editions[2]?.publishedDate || '-'}` : ''}${editions.length > 3 ? ` | ${editions[3]?.publishedDate || '-'}` : ''}${editions.length > 4 ? ` | ${editions[4]?.publishedDate || '-'}` : ''} |\n`;
        result += `| ページ数 | ${editions[0]?.pageCount || '-'} | ${editions[1]?.pageCount || '-'}${editions.length > 2 ? ` | ${editions[2]?.pageCount || '-'}` : ''}${editions.length > 3 ? ` | ${editions[3]?.pageCount || '-'}` : ''}${editions.length > 4 ? ` | ${editions[4]?.pageCount || '-'}` : ''} |\n`;
        result += `| 評価 | ${editions[0]?.rating || '-'} | ${editions[1]?.rating || '-'}${editions.length > 2 ? ` | ${editions[2]?.rating || '-'}` : ''}${editions.length > 3 ? ` | ${editions[3]?.rating || '-'}` : ''}${editions.length > 4 ? ` | ${editions[4]?.rating || '-'}` : ''} |\n\n`;
        
        result += `💡 **おすすめ選択基準**:\n`;
        result += `1. **最新版**: より新しい出版年を選択\n`;
        result += `2. **評価**: より高い評価の版を選択\n`;
        result += `3. **出版社**: 信頼できる出版社を選択\n\n`;
        
        result += `📝 **ノート作成**: create_book_note(option_number: 1-${editions.length})\n`;
        
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `版比較エラー: ${error}`,
            },
          ],
        };
      }
    }

    case 'get_book_series': {
      if (!bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'Book Search plugin not available.',
            },
          ],
        };
      }
      
      const { series_name, author, max_results = 10 } = args as any;
      
      if (!series_name) {
        return {
          content: [
            {
              type: 'text',
              text: '📚 シリーズ名を指定してください。\n\n**例**: get_book_series(series_name: "ハリー・ポッター", author: "J.K.ローリング")',
            },
          ],
        };
      }
      
      try {
        const books = await bookSearchPlugin.searchByTitle(series_name, author);
        
        if (books.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `📚 シリーズ「${series_name}」が見つかりませんでした。\n\nシリーズ名や著者名を確認してください。`,
              },
            ],
          };
        }
        
        const seriesBooks = books.slice(0, Math.min(max_results, 10));
        lastBookSearchResults = seriesBooks;
        
        let result = `📚 「${series_name}」シリーズ ${books.length}冊発見、上位${seriesBooks.length}冊を表示:\n\n`;
        
        if (author) {
          result += `👤 **著者**: ${author}\n\n`;
        }
        
        seriesBooks.forEach((book, index) => {
          result += `## 📖 第${index + 1}巻: ${book.title}\n`;
          result += `- **著者**: ${book.author.join(', ')}\n`;
          if (book.isbn) result += `- **ISBN**: ${book.isbn}\n`;
          if (book.publishedDate) result += `- **出版年**: ${book.publishedDate}\n`;
          if (book.publisher) result += `- **出版社**: ${book.publisher}\n`;
          if (book.pageCount) result += `- **ページ数**: ${book.pageCount}\n`;
          if (book.rating) result += `- **評価**: ⭐ ${book.rating}/5\n`;
          if (book.description) {
            const shortDesc = book.description.length > 150 ? 
              book.description.substring(0, 150) + '...' : 
              book.description;
            result += `- **概要**: ${shortDesc}\n`;
          }
          result += '\n';
        });
        
        // Series statistics
        const avgRating = seriesBooks
          .filter(book => book.rating)
          .reduce((sum, book) => sum + (book.rating || 0), 0) / 
          seriesBooks.filter(book => book.rating).length;
        
        const totalPages = seriesBooks
          .filter(book => book.pageCount)
          .reduce((sum, book) => sum + (book.pageCount || 0), 0);
        
        result += `## 📊 シリーズ統計\n\n`;
        if (!isNaN(avgRating)) result += `- **平均評価**: ⭐ ${avgRating.toFixed(1)}/5\n`;
        if (totalPages > 0) result += `- **総ページ数**: ${totalPages.toLocaleString()}\n`;
        result += `- **巻数**: ${seriesBooks.length}巻\n`;
        
        const publishYears = seriesBooks
          .map(book => book.publishedDate)
          .filter(date => date)
          .sort();
        if (publishYears.length > 0) {
          result += `- **出版期間**: ${publishYears[0]} - ${publishYears[publishYears.length - 1]}\n`;
        }
        result += '\n';
        
        result += `---\n\n💡 **次のアクション**:\n`;
        result += `1. 個別ノート作成: create_book_note(option_number: 1-${seriesBooks.length})\n`;
        result += `2. シリーズ読書リスト: create_reading_list(list_name: "${series_name}シリーズ")\n`;
        result += `3. 詳細比較: compare_book_editions() で特定巻の版比較\n`;
        
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `シリーズ検索エラー: ${error}`,
            },
          ],
        };
      }
    }

    case 'track_reading_progress': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please use "list_vaults" and then "select_vault" first.',
            },
          ],
        };
      }
      
      const { book_title, current_page, total_pages, reading_notes, reading_session_minutes, target_completion_date } = args as any;
      
      if (!book_title) {
        return {
          content: [
            {
              type: 'text',
              text: '📚 読書進捗を記録する書籍名を指定してください。\n\n**例**: track_reading_progress(book_title: "1984", current_page: 45, total_pages: 328)',
            },
          ],
        };
      }
      
      try {
        const progressDir = path.join(selectedVault, 'Reading Progress');
        await fs.mkdir(progressDir, { recursive: true });
        
        const progressFile = path.join(progressDir, `${book_title.replace(/[/\\?%*:|"<>]/g, '_')}_進捗.md`);
        const today = new Date().toLocaleDateString('ja-JP');
        const now = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        
        let content = '';
        let isNewFile = false;
        
        try {
          content = await fs.readFile(progressFile, 'utf-8');
        } catch {
          // File doesn't exist, create new one
          isNewFile = true;
          content = `# ${book_title} 読書進捗記録\n\n`;
          content += `**開始日**: ${today}\n`;
          content += `**目標完了日**: ${target_completion_date || '未設定'}\n`;
          content += `**総ページ数**: ${total_pages || '不明'}\n\n`;
          content += `## 📊 進捗グラフ\n\n`;
          content += `| 日付 | ページ | 進捗率 | セッション(分) | メモ |\n`;
          content += `|------|--------|--------|----------------|------|\n`;
        }
        
        // Calculate progress
        const progressPercent = total_pages ? 
          Math.round((current_page / total_pages) * 100) : 0;
        
        // Add today's entry
        const newEntry = `| ${today} ${now} | ${current_page || '-'} | ${progressPercent || '-'}% | ${reading_session_minutes || '-'} | ${reading_notes || '-'} |\n`;
        
        if (content.includes('| 日付 |')) {
          // Insert after the table header
          const lines = content.split('\n');
          let insertIndex = -1;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('|------|')) {
              insertIndex = i + 1;
              break;
            }
          }
          
          if (insertIndex !== -1) {
            lines.splice(insertIndex, 0, newEntry.trim());
            content = lines.join('\n');
          } else {
            content += newEntry;
          }
        } else {
          content += newEntry;
        }
        
        // Add reading stats section if new file
        if (isNewFile) {
          content += `\n## 📈 読書統計\n\n`;
          content += `- **現在のページ**: ${current_page || 0}\n`;
          content += `- **進捗率**: ${progressPercent || 0}%\n`;
          content += `- **残りページ数**: ${total_pages ? total_pages - (current_page || 0) : '不明'}\n`;
          if (reading_session_minutes) {
            content += `- **今日の読書時間**: ${reading_session_minutes}分\n`;
          }
          content += `\n## 🎯 読書目標\n\n`;
          content += `- [ ] 毎日読書する\n`;
          content += `- [ ] 週に○ページ進める\n`;
          content += `- [ ] ${target_completion_date || '目標日'}までに完了する\n\n`;
          content += `## 📝 読書メモ・感想\n\n`;
          content += `### ${today}\n`;
          if (reading_notes) {
            content += `${reading_notes}\n\n`;
          } else {
            content += `*今日の読書メモを記入*\n\n`;
          }
        }
        
        // Add frontmatter
        const metadata = {
          tags: ['reading-progress', 'books'],
          book_title,
          current_page: current_page || 0,
          total_pages: total_pages || 0,
          progress_percent: progressPercent,
          last_updated: new Date().toISOString(),
          target_completion_date: target_completion_date || null,
        };
        
        const fullContent = createFrontmatter(metadata) + content;
        
        await fs.writeFile(progressFile, fullContent, 'utf-8');
        
        return {
          content: [
            {
              type: 'text',
              text: `📚 読書進捗記録完了!\n\n**書籍**: ${book_title}\n**現在**: ${current_page || 0}/${total_pages || '?'} ページ\n**進捗率**: ${progressPercent || 0}%\n**ファイル**: ${path.relative(selectedVault, progressFile)}\n\n${isNewFile ? '新しい進捗ファイルを作成しました。' : '進捗を更新しました。'}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `読書進捗記録エラー: ${error}`,
            },
          ],
        };
      }
    }

    case 'create_book_review_template': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please use "list_vaults" and then "select_vault" first.',
            },
          ],
        };
      }
      
      const { template_name = 'Book Review', custom_fields = [] } = args as any;
      
      try {
        const templatesDir = path.join(selectedVault, 'Templates');
        await fs.mkdir(templatesDir, { recursive: true });
        
        const templateFile = path.join(templatesDir, `${template_name}.md`);
        
        let content = `# {{title}}\n\n`;
        content += `**著者**: {{author}}\n`;
        content += `**ISBN**: {{isbn}}\n`;
        content += `**出版社**: {{publisher}}\n`;
        content += `**出版年**: {{publishedDate}}\n`;
        content += `**ページ数**: {{pageCount}}\n`;
        content += `**読書開始日**: {{date}}\n`;
        content += `**読了日**: \n`;
        content += `**私の評価**: /5 ⭐\n`;
        content += `**公式評価**: {{rating}}/5\n\n`;
        
        // Add custom fields if provided
        if (custom_fields.length > 0) {
          content += `## カスタムフィールド\n\n`;
          custom_fields.forEach((field: string) => {
            content += `**${field}**: \n`;
          });
          content += '\n';
        }
        
        content += `## 📖 概要\n\n`;
        content += `{{description}}\n\n`;
        
        content += `## 🎯 読書動機\n\n`;
        content += `*この本を読むことにした理由*\n\n`;
        
        content += `## 📝 重要なポイント・引用\n\n`;
        content += `### 第1章\n`;
        content += `- \n\n`;
        content += `### 第2章\n`;
        content += `- \n\n`;
        
        content += `## 🧠 学んだこと・気づき\n\n`;
        content += `1. **主要な学び**: \n`;
        content += `2. **新しい視点**: \n`;
        content += `3. **実践可能なこと**: \n\n`;
        
        content += `## 💭 感想・評価\n\n`;
        content += `### 良かった点\n`;
        content += `- \n\n`;
        content += `### 改善できる点\n`;
        content += `- \n\n`;
        content += `### 全体評価\n`;
        content += `*5段階評価での詳細コメント*\n\n`;
        
        content += `## 🔗 関連書籍・参考資料\n\n`;
        content += `- [[関連書籍1]]\n`;
        content += `- [[関連書籍2]]\n\n`;
        
        content += `## 📚 次に読みたい本\n\n`;
        content += `*この本から興味を持った次の読書候補*\n\n`;
        
        content += `## 🏷️ タグ\n\n`;
        content += `{{categories}}\n\n`;
        content += `---\n`;
        content += `*作成日: {{today}}*\n`;
        
        await fs.writeFile(templateFile, content, 'utf-8');
        
        return {
          content: [
            {
              type: 'text',
              text: `📝 書籍レビューテンプレート作成完了!\n\n**テンプレート名**: ${template_name}\n**パス**: ${path.relative(selectedVault, templateFile)}\n**カスタムフィールド数**: ${custom_fields.length}\n\n使用方法:\n1. create_book_note(template: "${template_name}")\n2. または create_from_template(template_name: "${template_name}")\n\nこのテンプレートは書籍の詳細情報を自動で埋め込み、構造化されたレビューを作成できます。`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `書籍レビューテンプレート作成エラー: ${error}`,
            },
          ],
        };
      }
    }

    case 'bulk_import_books': {
      if (!selectedVault || !bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected or Book Search not available.',
            },
          ],
        };
      }
      
      const { book_list, folder = 'Books', template, create_reading_list = true } = args as any;
      
      if (!book_list || !Array.isArray(book_list) || book_list.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: '📚 インポートする書籍リストを指定してください。\n\n**例**:\nbulk_import_books(\n  book_list: [\n    {title: "1984", author: "George Orwell"},\n    {isbn: "9784123456789"},\n    {title: "ハリー・ポッター"}\n  ]\n)',
            },
          ],
        };
      }
      
      try {
        let results = {
          successful: 0,
          failed: 0,
          created_notes: [] as string[],
          failed_books: [] as any[],
        };
        
        const importedBooks: BookMetadata[] = [];
        
        for (let i = 0; i < book_list.length; i++) {
          const bookSpec = book_list[i];
          let book: BookMetadata | null = null;
          
          try {
            if (bookSpec.isbn) {
              book = await bookSearchPlugin.searchByISBN(bookSpec.isbn);
            } else if (bookSpec.title) {
              const books = await bookSearchPlugin.searchByTitle(bookSpec.title, bookSpec.author);
              book = books.length > 0 ? books[0] : null;
            }
            
            if (book) {
              // Create note for this book
              const noteTitle = `${book.title} - ${book.author.join(', ')}`;
              const notePath = path.join(selectedVault, folder, `${noteTitle}.md`);
              
              let content: string;
              if (template && templaterPlugin) {
                const templateContent = await templaterPlugin.getTemplate(template);
                content = templateContent ? 
                  bookSearchPlugin.formatAsMarkdown(book, templateContent) :
                  bookSearchPlugin.formatAsMarkdown(book);
              } else {
                content = bookSearchPlugin.formatAsMarkdown(book);
              }
              
              // Add metadata
              const metadata = {
                tags: ['book', 'reading', 'bulk-import'],
                isbn: book.isbn,
                author: book.author,
                rating: book.rating,
                created: new Date().toISOString(),
                import_batch: new Date().toISOString().split('T')[0],
              };
              
              const fullContent = createFrontmatter(metadata) + content;
              
              await fs.mkdir(path.dirname(notePath), { recursive: true });
              await fs.writeFile(notePath, fullContent, 'utf-8');
              
              importedBooks.push(book);
              results.successful++;
              results.created_notes.push(path.relative(selectedVault, notePath));
            } else {
              results.failed++;
              results.failed_books.push(bookSpec);
            }
          } catch (error) {
            results.failed++;
            results.failed_books.push({...bookSpec, error: String(error)});
          }
          
          // Small delay to avoid API rate limiting
          if (i < book_list.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        
        // Create reading list if requested
        let readingListPath = '';
        if (create_reading_list && importedBooks.length > 0) {
          const listName = `一括インポート_${new Date().toLocaleDateString('ja-JP').replace(/\//g, '-')}`;
          const listPath = path.join(selectedVault, 'Reading Lists', `${listName}.md`);
          
          let listContent = `# ${listName}\n\n`;
          listContent += `**作成日**: ${new Date().toLocaleDateString('ja-JP')}\n`;
          listContent += `**インポート数**: ${importedBooks.length}冊\n`;
          listContent += `**ステータス**: 📚 一括インポート完了\n\n`;
          
          listContent += `## 📚 インポートされた書籍\n\n`;
          
          importedBooks.forEach((book, index) => {
            listContent += `### ${index + 1}. ${book.title}\n`;
            listContent += `- [ ] 読了\n`;
            listContent += `- **著者**: ${book.author.join(', ')}\n`;
            if (book.isbn) listContent += `- **ISBN**: ${book.isbn}\n`;
            listContent += `- **ノートリンク**: [[${book.title} - ${book.author.join(', ')}]]\n`;
            listContent += `- **読書開始日**: \n`;
            listContent += `- **読了日**: \n`;
            listContent += `- **評価**: /5\n\n`;
          });
          
          const listMetadata = {
            tags: ['reading-list', 'books', 'bulk-import'],
            created: new Date().toISOString(),
            total_books: importedBooks.length,
            completed_books: 0,
          };
          
          const fullListContent = createFrontmatter(listMetadata) + listContent;
          
          await fs.mkdir(path.dirname(listPath), { recursive: true });
          await fs.writeFile(listPath, fullListContent, 'utf-8');
          
          readingListPath = path.relative(selectedVault, listPath);
        }
        
        let result = `📚 一括書籍インポート完了!\n\n`;
        result += `## 📊 インポート結果\n`;
        result += `- **成功**: ${results.successful}冊\n`;
        result += `- **失敗**: ${results.failed}冊\n`;
        result += `- **成功率**: ${Math.round((results.successful / book_list.length) * 100)}%\n\n`;
        
        if (results.successful > 0) {
          result += `## ✅ 作成されたノート (${results.successful}件)\n`;
          results.created_notes.slice(0, 10).forEach((note, index) => {
            result += `${index + 1}. ${note}\n`;
          });
          if (results.created_notes.length > 10) {
            result += `... および他${results.created_notes.length - 10}件\n`;
          }
          result += '\n';
        }
        
        if (results.failed > 0) {
          result += `## ❌ インポート失敗 (${results.failed}件)\n`;
          results.failed_books.slice(0, 5).forEach((book, index) => {
            result += `${index + 1}. ${JSON.stringify(book)}\n`;
          });
          result += '\n';
        }
        
        if (readingListPath) {
          result += `## 📋 読書リスト作成\n`;
          result += `- **パス**: ${readingListPath}\n`;
          result += `- **書籍数**: ${importedBooks.length}冊\n\n`;
        }
        
        result += `💡 **次のアクション**:\n`;
        result += `1. 作成されたノートを確認・編集\n`;
        result += `2. 読書計画を立案\n`;
        result += `3. 失敗した書籍は手動で再試行\n`;
        
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `一括インポートエラー: ${error}`,
            },
          ],
        };
      }
    }

    case 'create_daily_note': {
      // REQ-001: 厳密な保管庫選択チェック
      const vaultError = requireExplicitVaultSelection();
      if (vaultError) {
        return vaultError;
      }

      if (!dailyNotesPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'Daily Notesプラグインが利用できません。',
            },
          ],
        };
      }
      
      const { date, template, folder, template_variables = {}, confirm = false } = args as any;

      // REQ-002: Folder specification requirement
      if (folder === undefined && !confirm) {
        return {
          content: [
            {
              type: 'text',
              text: `=== 保存先フォルダの指定 ===\nデイリーノートを保存するフォルダを指定してください。\n\n例:\n  - Daily/         (デイリーノート用)\n  - Journal/       (日記用)\n  - Notes/         (一般ノート用)\n  - ""             (ルートフォルダ)\n\n使用方法：create_daily_note(date: "${date || 'today'}", folder: "フォルダパス", confirm: true)`
            },
          ],
        };
      }

      const finalFolder = folder || '';
      
      try {
        // Parse and validate date if provided
        let targetDate = date ? new Date(date) : new Date();
        
        // Validate date
        if (isNaN(targetDate.getTime())) {
          return {
            content: [
              {
                type: 'text',
                text: `📅 無効な日付形式です: "${date}"\n\n**有効な形式:**\n- YYYY-MM-DD (例: "2024-01-15")\n- 自然言語 (例: "today", "tomorrow", "2024-01-15")\n- 空白の場合は今日の日付を使用`,
              },
            ],
          };
        }
        
        // Check if daily note already exists
        const exists = await dailyNotesPlugin.dailyNoteExists(date, folder);
        if (exists && !confirm) {
          const dateStr = targetDate.toLocaleDateString('ja-JP');
          const formattedDate = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
          
          return {
            content: [
              {
                type: 'text',
                text: `📅 デイリーノート既存確認\n\n**対象日付**: ${dateStr} (${formattedDate})\n**フォルダ**: ${folder || 'Daily Notes'}\n\n⚠️ この日付のデイリーノートは既に存在しています。\n\n✅ **作成する（上書き）**: create_daily_note(date: "${date || 'today'}", template: "${template || ''}", folder: "${folder || ''}", confirm: true)\n❌ **キャンセル**: 操作をキャンセルします\n\n💡 **別の日付を試す**: create_daily_note(date: "YYYY-MM-DD")`,
              },
            ],
          };
        }
        
        // Get template content if specified
        let templateContent = '';
        if (template && templaterPlugin) {
          try {
            templateContent = await templaterPlugin.getTemplate(template);
            if (!templateContent) {
              // Template not found, list available templates
              const templates = await templaterPlugin.listTemplates();
              const templateList = templates.length > 0 ? 
                templates.map(t => t.name).join('\n- ') : 
                '(テンプレートが見つかりません)';
              
              return {
                content: [
                  {
                    type: 'text',
                    text: `📝 テンプレート「${template}」が見つかりません。\n\n**利用可能なテンプレート:**\n- ${templateList}\n\n**デフォルトテンプレートで作成**: create_daily_note(date: "${date || 'today'}", folder: "${folder || ''}")`,
                  },
                ],
              };
            }
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: `テンプレート取得エラー: ${error}`,
                },
              ],
            };
          }
        }
        
        // Create the daily note
        const result = await dailyNotesPlugin.createDailyNote(
          date,
          templateContent,
          folder,
          template_variables
        );
        
        if (result.success) {
          const dateStr = targetDate.toLocaleDateString('ja-JP');
          const dayName = targetDate.toLocaleDateString('ja-JP', { weekday: 'long' });
          
          let response = `📅 デイリーノート作成完了!\n\n`;
          response += `**日付**: ${dateStr} (${dayName})\n`;
          response += `**パス**: ${result.path}\n`;
          response += `**フォルダ**: ${folder || 'Daily Notes'}\n`;
          
          if (template) {
            response += `**テンプレート**: ${template}\n`;
          }
          
          if (Object.keys(template_variables).length > 0) {
            response += `**変数**: ${Object.keys(template_variables).length}個\n`;
          }
          
          // Add helpful next steps
          response += `\n💡 **次のアクション:**\n`;
          response += `1. ノートを開いて内容を編集\n`;
          response += `2. 今日のタスクや予定を追加\n`;
          response += `3. 他の日付のデイリーノート作成\n`;
          
          // Show quick access to related dates
          const tomorrow = new Date(targetDate);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const yesterday = new Date(targetDate);
          yesterday.setDate(yesterday.getDate() - 1);
          
          const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
          const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
          
          response += `\n📆 **関連する日付:**\n`;
          response += `- 昨日: create_daily_note(date: "${yesterdayStr}")\n`;
          response += `- 明日: create_daily_note(date: "${tomorrowStr}")\n`;
          
          return {
            content: [
              {
                type: 'text',
                text: response,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: `デイリーノート作成エラー: ${result.error}`,
              },
            ],
          };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `デイリーノート作成エラー: ${error}`,
            },
          ],
        };
      }
    }

    case 'search_notes_by_date_range': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please use "list_vaults" and then "select_vault" first.',
            },
          ],
        };
      }
      
      const { start_date, end_date, date_type = 'created', folder, include_subfolders = true, max_results = 50 } = args as any;
      
      if (!start_date) {
        return {
          content: [
            {
              type: 'text',
              text: '📅 開始日を指定してください。\n\n**例:**\n- search_notes_by_date_range(start_date: "2024-01-01", end_date: "2024-01-31")\n- search_notes_by_date_range(start_date: "2024-01-01", date_type: "modified")\n- search_notes_by_date_range(start_date: "2024-01-01", folder: "Projects")',
            },
          ],
        };
      }
      
      try {
        const startDate = new Date(start_date);
        const endDate = end_date ? new Date(end_date) : new Date();
        
        // Validate dates
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return {
            content: [
              {
                type: 'text',
                text: `📅 無効な日付形式です。\n\n**有効な形式:** YYYY-MM-DD (例: "2024-01-15")\n**開始日:** ${start_date}\n**終了日:** ${end_date || '今日'}`,
              },
            ],
          };
        }
        
        if (startDate > endDate) {
          return {
            content: [
              {
                type: 'text',
                text: '📅 開始日が終了日より後になっています。日付を確認してください。',
              },
            ],
          };
        }
        
        const searchDir = folder ? path.join(selectedVault, folder) : selectedVault;
        const foundNotes: Array<{
          path: string;
          relativePath: string;
          title: string;
          date: Date;
          dateStr: string;
          size: number;
        }> = [];
        
        // Recursive function to scan directories
        async function scanDirectory(dir: string): Promise<void> {
          try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              
              if (entry.isDirectory() && !entry.name.startsWith('.') && include_subfolders) {
                await scanDirectory(fullPath);
              } else if (entry.isFile() && entry.name.endsWith('.md')) {
                try {
                  const stats = await fs.stat(fullPath);
                  const checkDate = date_type === 'modified' ? stats.mtime : stats.birthtime || stats.mtime;
                  
                  // Check if date falls within range
                  if (checkDate >= startDate && checkDate <= endDate) {
                    // Read file to get title
                    let title = path.basename(entry.name, '.md');
                    try {
                      const content = await fs.readFile(fullPath, 'utf-8');
                      const extractedTitle = extractTitleFromContent(content);
                      if (extractedTitle) {
                        title = extractedTitle;
                      }
                    } catch {
                      // Use filename if can't read content
                    }
                    
                    foundNotes.push({
                      path: fullPath,
                      relativePath: path.relative(selectedVault, fullPath),
                      title,
                      date: checkDate,
                      dateStr: checkDate.toLocaleDateString('ja-JP'),
                      size: stats.size,
                    });
                  }
                } catch {
                  // Skip files that can't be accessed
                }
              }
            }
          } catch {
            // Skip directories that can't be accessed
          }
        }
        
        await scanDirectory(searchDir);
        
        // Sort by date (newest first)
        foundNotes.sort((a, b) => b.date.getTime() - a.date.getTime());
        
        // Limit results
        const limitedNotes = foundNotes.slice(0, max_results);
        
        if (foundNotes.length === 0) {
          const dateTypeJa = date_type === 'modified' ? '変更' : '作成';
          return {
            content: [
              {
                type: 'text',
                text: `📅 指定された期間に${dateTypeJa}されたノートが見つかりませんでした。\n\n**検索条件:**\n- 期間: ${startDate.toLocaleDateString('ja-JP')} ～ ${endDate.toLocaleDateString('ja-JP')}\n- 種類: ${dateTypeJa}日時\n- フォルダ: ${folder || '全体'}\n- サブフォルダ含む: ${include_subfolders ? 'はい' : 'いいえ'}`,
              },
            ],
          };
        }
        
        const dateTypeJa = date_type === 'modified' ? '変更' : '作成';
        let result = `📅 日付範囲検索結果 (${foundNotes.length}件)\n\n`;
        result += `**検索条件:**\n`;
        result += `- 期間: ${startDate.toLocaleDateString('ja-JP')} ～ ${endDate.toLocaleDateString('ja-JP')}\n`;
        result += `- 種類: ${dateTypeJa}日時\n`;
        result += `- フォルダ: ${folder || '全体'}\n`;
        result += `- サブフォルダ含む: ${include_subfolders ? 'はい' : 'いいえ'}\n`;
        
        if (foundNotes.length > max_results) {
          result += `- 表示制限: 上位${max_results}件（全${foundNotes.length}件中）\n`;
        }
        
        result += `\n## 📝 検索結果\n\n`;
        
        limitedNotes.forEach((note, index) => {
          result += `### ${index + 1}. ${note.title}\n`;
          result += `- **パス**: ${note.relativePath}\n`;
          result += `- **${dateTypeJa}日**: ${note.dateStr}\n`;
          result += `- **サイズ**: ${(note.size / 1024).toFixed(1)} KB\n`;
          result += `- **リンク**: [[${note.relativePath.replace('.md', '')}]]\n\n`;
        });
        
        // Add statistics
        result += `## 📊 統計情報\n\n`;
        const totalSize = foundNotes.reduce((sum, note) => sum + note.size, 0);
        result += `- **総件数**: ${foundNotes.length}件\n`;
        result += `- **合計サイズ**: ${(totalSize / 1024 / 1024).toFixed(2)} MB\n`;
        result += `- **平均サイズ**: ${(totalSize / foundNotes.length / 1024).toFixed(1)} KB\n`;
        
        // Date distribution
        const dateGroups: { [key: string]: number } = {};
        foundNotes.forEach(note => {
          const dateKey = note.date.toLocaleDateString('ja-JP');
          dateGroups[dateKey] = (dateGroups[dateKey] || 0) + 1;
        });
        
        const topDates = Object.entries(dateGroups)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5);
        
        if (topDates.length > 0) {
          result += `\n**${dateTypeJa}数が多い日:**\n`;
          topDates.forEach(([date, count]) => {
            result += `- ${date}: ${count}件\n`;
          });
        }
        
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `日付範囲検索エラー: ${error}`,
            },
          ],
        };
      }
    }

    case 'find_broken_links': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please use "list_vaults" and then "select_vault" first.',
            },
          ],
        };
      }
      
      const { folder, include_subfolders = true, auto_fix = false, link_types = ['wiki', 'markdown'] } = args as any;
      
      try {
        const searchDir = folder ? path.join(selectedVault, folder) : selectedVault;
        const brokenLinks: Array<{
          sourceFile: string;
          sourceRelativePath: string;
          linkText: string;
          linkTarget: string;
          linkType: 'wiki' | 'markdown';
          lineNumber: number;
          canAutoFix: boolean;
          suggestedFix?: string;
        }> = [];
        
        // Get all markdown files first for reference
        const allMarkdownFiles: Set<string> = new Set();
        
        async function collectMarkdownFiles(dir: string): Promise<void> {
          try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              
              if (entry.isDirectory() && !entry.name.startsWith('.')) {
                await collectMarkdownFiles(fullPath);
              } else if (entry.isFile() && entry.name.endsWith('.md')) {
                // Store relative path without .md extension for wiki links
                const relativePath = path.relative(selectedVault, fullPath).replace('.md', '');
                allMarkdownFiles.add(relativePath);
                // Also store just the filename without extension
                allMarkdownFiles.add(path.basename(fullPath, '.md'));
              }
            }
          } catch {
            // Skip directories that can't be accessed
          }
        }
        
        await collectMarkdownFiles(selectedVault);
        
        // Function to check if a link target exists
        function linkExists(target: string): boolean {
          // Clean the target (remove fragments)
          const cleanTarget = target.split('#')[0];
          
          // Check exact match
          if (allMarkdownFiles.has(cleanTarget)) return true;
          
          // Check if it's a valid file path
          try {
            const fullPath = path.resolve(selectedVault, cleanTarget + '.md');
            return fsSync.existsSync(fullPath);
          } catch {
            return false;
          }
        }
        
        // Function to find similar links (for auto-fix suggestions)
        function findSimilarLinks(target: string): string[] {
          const cleanTarget = target.toLowerCase();
          const similar: string[] = [];
          
          for (const file of allMarkdownFiles) {
            const fileName = file.toLowerCase();
            // Exact match (case-insensitive)
            if (fileName === cleanTarget) {
              similar.push(file);
            }
            // Contains the target
            else if (fileName.includes(cleanTarget) || cleanTarget.includes(fileName)) {
              similar.push(file);
            }
          }
          
          return similar.slice(0, 3); // Return top 3 matches
        }
        
        // Recursive function to scan files for broken links
        async function scanForBrokenLinks(dir: string): Promise<void> {
          try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              
              if (entry.isDirectory() && !entry.name.startsWith('.') && include_subfolders) {
                await scanForBrokenLinks(fullPath);
              } else if (entry.isFile() && entry.name.endsWith('.md')) {
                try {
                  const content = await fs.readFile(fullPath, 'utf-8');
                  const lines = content.split('\n');
                  const relativePath = path.relative(selectedVault, fullPath);
                  
                  lines.forEach((line, lineIndex) => {
                    // Check wiki-style links [[link]] or [[link|alias]]
                    if (link_types.includes('wiki')) {
                      const wikiLinkRegex = /\[\[([^\]|]+)(\|[^\]]+)?\]\]/g;
                      let match;
                      
                      while ((match = wikiLinkRegex.exec(line)) !== null) {
                        const linkTarget = match[1];
                        const fullMatch = match[0];
                        
                        if (!linkExists(linkTarget)) {
                          const similarLinks = findSimilarLinks(linkTarget);
                          
                          brokenLinks.push({
                            sourceFile: fullPath,
                            sourceRelativePath: relativePath,
                            linkText: fullMatch,
                            linkTarget,
                            linkType: 'wiki',
                            lineNumber: lineIndex + 1,
                            canAutoFix: similarLinks.length > 0,
                            suggestedFix: similarLinks.length > 0 ? similarLinks[0] : undefined,
                          });
                        }
                      }
                    }
                    
                    // Check markdown-style links [text](link)
                    if (link_types.includes('markdown')) {
                      const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
                      let match;
                      
                      while ((match = markdownLinkRegex.exec(line)) !== null) {
                        const linkText = match[1];
                        const linkTarget = match[2];
                        const fullMatch = match[0];
                        
                        // Only check local markdown files (not URLs)
                        if (linkTarget.endsWith('.md') && !linkTarget.startsWith('http')) {
                          const cleanTarget = linkTarget.replace('.md', '');
                          if (!linkExists(cleanTarget)) {
                            const similarLinks = findSimilarLinks(cleanTarget);
                            
                            brokenLinks.push({
                              sourceFile: fullPath,
                              sourceRelativePath: relativePath,
                              linkText: fullMatch,
                              linkTarget: cleanTarget,
                              linkType: 'markdown',
                              lineNumber: lineIndex + 1,
                              canAutoFix: similarLinks.length > 0,
                              suggestedFix: similarLinks.length > 0 ? similarLinks[0] : undefined,
                            });
                          }
                        }
                      }
                    }
                  });
                } catch {
                  // Skip files that can't be read
                }
              }
            }
          } catch {
            // Skip directories that can't be accessed
          }
        }
        
        await scanForBrokenLinks(searchDir);
        
        if (brokenLinks.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `✅ 壊れたリンクは見つかりませんでした！\n\n**検索範囲:**\n- フォルダ: ${folder || '全体'}\n- サブフォルダ含む: ${include_subfolders ? 'はい' : 'いいえ'}\n- リンク種類: ${link_types.join(', ')}\n\n保管庫のリンクは正常です。`,
              },
            ],
          };
        }
        
        let result = `🔗 壊れたリンク検出結果 (${brokenLinks.length}件)\n\n`;
        result += `**検索条件:**\n`;
        result += `- フォルダ: ${folder || '全体'}\n`;
        result += `- サブフォルダ含む: ${include_subfolders ? 'はい' : 'いいえ'}\n`;
        result += `- リンク種類: ${link_types.join(', ')}\n\n`;
        
        // Group by source file
        const groupedByFile: { [key: string]: typeof brokenLinks } = {};
        brokenLinks.forEach(link => {
          if (!groupedByFile[link.sourceRelativePath]) {
            groupedByFile[link.sourceRelativePath] = [];
          }
          groupedByFile[link.sourceRelativePath].push(link);
        });
        
        result += `## 🚫 壊れたリンク詳細\n\n`;
        
        Object.entries(groupedByFile).forEach(([filePath, links]) => {
          result += `### 📄 ${filePath} (${links.length}件)\n\n`;
          
          links.forEach((link, index) => {
            result += `**${index + 1}. 行 ${link.lineNumber}**\n`;
            result += `- **リンクテキスト**: \`${link.linkText}\`\n`;
            result += `- **対象**: ${link.linkTarget}\n`;
            result += `- **種類**: ${link.linkType === 'wiki' ? 'Wiki形式' : 'Markdown形式'}\n`;
            
            if (link.canAutoFix && link.suggestedFix) {
              result += `- **修正候補**: ${link.suggestedFix}\n`;
              if (auto_fix) {
                result += `- **自動修正**: 実行予定\n`;
              }
            } else {
              result += `- **修正**: 手動修正が必要\n`;
            }
            result += '\n';
          });
        });
        
        // Auto-fix functionality
        if (auto_fix) {
          let fixedCount = 0;
          const fixableLinks = brokenLinks.filter(link => link.canAutoFix && link.suggestedFix);
          
          for (const link of fixableLinks) {
            try {
              const content = await fs.readFile(link.sourceFile, 'utf-8');
              let newContent = content;
              
              if (link.linkType === 'wiki') {
                // Fix wiki-style link
                const oldPattern = `[[${link.linkTarget}`;
                const newPattern = `[[${link.suggestedFix}`;
                newContent = newContent.replace(oldPattern, newPattern);
              } else {
                // Fix markdown-style link
                const oldPattern = `](${link.linkTarget}.md)`;
                const newPattern = `](${link.suggestedFix}.md)`;
                newContent = newContent.replace(oldPattern, newPattern);
              }
              
              await fs.writeFile(link.sourceFile, newContent, 'utf-8');
              fixedCount++;
            } catch (error) {
              // Skip files that can't be fixed
            }
          }
          
          result += `## 🔧 自動修正結果\n\n`;
          result += `- **修正可能**: ${fixableLinks.length}件\n`;
          result += `- **修正完了**: ${fixedCount}件\n`;
          result += `- **修正失敗**: ${fixableLinks.length - fixedCount}件\n`;
          
          if (fixedCount > 0) {
            result += `\n✅ ${fixedCount}件のリンクを自動修正しました。\n`;
          }
        }
        
        // Statistics
        result += `## 📊 統計情報\n\n`;
        const fileCount = Object.keys(groupedByFile).length;
        const wikiLinks = brokenLinks.filter(l => l.linkType === 'wiki').length;
        const markdownLinks = brokenLinks.filter(l => l.linkType === 'markdown').length;
        const autoFixable = brokenLinks.filter(l => l.canAutoFix).length;
        
        result += `- **影響ファイル数**: ${fileCount}件\n`;
        result += `- **Wikiリンク**: ${wikiLinks}件\n`;
        result += `- **Markdownリンク**: ${markdownLinks}件\n`;
        result += `- **自動修正可能**: ${autoFixable}件\n`;
        result += `- **手動修正必要**: ${brokenLinks.length - autoFixable}件\n`;
        
        if (!auto_fix && autoFixable > 0) {
          result += `\n💡 **自動修正を実行**: find_broken_links(auto_fix: true)\n`;
        }
        
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `壊れたリンク検索エラー: ${error}`,
            },
          ],
        };
      }
    }

    case 'get_notes_by_date_range': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'ボルトが選択されていません。先に "list_vaults" と "select_vault" を実行してください。',
            },
          ],
        };
      }

      const { start_date, end_date, date_field = 'modified', include_content = false, sort_by = 'date', folder_filter } = args as any;

      if (!start_date || !end_date) {
        return {
          content: [
            {
              type: 'text',
              text: '📅 開始日と終了日を指定してください。\n\n**例:**\n- get_notes_by_date_range(start_date: "2024-01-01", end_date: "2024-01-31")\n- get_notes_by_date_range(start_date: "2024-01-01", end_date: "2024-01-31", date_field: "created")',
            },
          ],
        };
      }

      try {
        const startDate = new Date(start_date);
        const endDate = new Date(end_date);
        const searchDir = folder_filter ? path.join(selectedVault, folder_filter) : selectedVault;
        const foundNotes: Array<{
          title: string;
          path: string;
          relativePath: string;
          dateValue: string;
          size: number;
          content?: string;
        }> = [];

        async function scanForNotes(dir: string): Promise<void> {
          try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              
              if (entry.isDirectory() && !entry.name.startsWith('.')) {
                await scanForNotes(fullPath);
              } else if (entry.isFile() && entry.name.endsWith('.md')) {
                try {
                  const stats = await fs.stat(fullPath);
                  let dateToCheck: Date;
                  
                  // Determine which date to check
                  if (date_field === 'created') {
                    dateToCheck = stats.birthtime || stats.ctime;
                  } else if (date_field === 'modified') {
                    dateToCheck = stats.mtime;
                  } else if (date_field === 'filename') {
                    // Try to extract date from filename (YYYY-MM-DD format)
                    const dateMatch = entry.name.match(/(\d{4}-\d{2}-\d{2})/);
                    if (dateMatch) {
                      dateToCheck = new Date(dateMatch[1]);
                    } else {
                      continue; // Skip files without date in filename
                    }
                  } else {
                    dateToCheck = stats.mtime;
                  }
                  
                  // Check if date is within range
                  if (dateToCheck >= startDate && dateToCheck <= endDate) {
                    const relativePath = path.relative(selectedVault, fullPath);
                    const title = path.basename(entry.name, '.md');
                    let content = '';
                    
                    if (include_content) {
                      try {
                        content = await fs.readFile(fullPath, 'utf-8');
                      } catch {
                        content = 'コンテンツの読み取りに失敗しました';
                      }
                    }
                    
                    foundNotes.push({
                      title,
                      path: fullPath,
                      relativePath,
                      dateValue: dateToCheck.toISOString().split('T')[0],
                      size: stats.size,
                      content: include_content ? content : undefined,
                    });
                  }
                } catch {
                  // Skip files that can't be processed
                }
              }
            }
          } catch {
            // Skip directories that can't be accessed
          }
        }

        await scanForNotes(searchDir);

        // Sort results
        foundNotes.sort((a, b) => {
          if (sort_by === 'name') {
            return a.title.localeCompare(b.title);
          } else if (sort_by === 'size') {
            return b.size - a.size;
          } else {
            // Sort by date (newest first)
            return new Date(b.dateValue).getTime() - new Date(a.dateValue).getTime();
          }
        });

        let result = `📅 **日付範囲検索結果** (${start_date} ~ ${end_date})\n\n`;
        result += `🔍 検索条件: ${date_field}日付, ${folder_filter ? `フォルダ: ${folder_filter}` : '全体'}\n`;
        result += `📊 見つかったノート: ${foundNotes.length}個\n\n`;

        if (foundNotes.length === 0) {
          result += '指定された日付範囲でノートが見つかりませんでした。\n\n';
          result += '**ヒント:**\n';
          result += '- 日付範囲を広げてみてください\n';
          result += '- date_field パラメータを変更してみてください (created/modified/filename)\n';
          result += '- folder_filter を削除して全体を検索してみてください';
        } else {
          foundNotes.forEach((note, index) => {
            result += `${index + 1}. **${note.title}**\n`;
            result += `   📅 ${date_field}: ${note.dateValue}\n`;
            result += `   📁 ${note.relativePath}\n`;
            result += `   💾 ${Math.round(note.size / 1024)}KB\n`;
            if (include_content && note.content) {
              const preview = note.content.substring(0, 200);
              result += `   📄 ${preview}${note.content.length > 200 ? '...' : ''}\n`;
            }
            result += '\n';
          });
        }

        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `日付範囲検索エラー: ${error}`,
            },
          ],
        };
      }
    }

    case 'validate_broken_links': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'ボルトが選択されていません。先に "list_vaults" と "select_vault" を実行してください。',
            },
          ],
        };
      }

      const { fix_links = false, scan_folder, link_types = ['wiki', 'markdown'], create_report = true } = args as any;

      try {
        const searchDir = scan_folder ? path.join(selectedVault, scan_folder) : selectedVault;
        const brokenLinks: Array<{
          sourceFile: string;
          sourceRelativePath: string;
          linkText: string;
          linkTarget: string;
          linkType: 'wiki' | 'markdown';
          lineNumber: number;
          canAutoFix: boolean;
          suggestedFix?: string;
          fixed?: boolean;
        }> = [];

        // Get all markdown files for reference
        const allMarkdownFiles: Set<string> = new Set();
        
        async function collectMarkdownFiles(dir: string): Promise<void> {
          try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              
              if (entry.isDirectory() && !entry.name.startsWith('.')) {
                await collectMarkdownFiles(fullPath);
              } else if (entry.isFile() && entry.name.endsWith('.md')) {
                const relativePath = path.relative(selectedVault, fullPath).replace('.md', '');
                allMarkdownFiles.add(relativePath);
                allMarkdownFiles.add(path.basename(fullPath, '.md'));
              }
            }
          } catch {
            // Skip directories that can't be accessed
          }
        }

        await collectMarkdownFiles(selectedVault);

        // Function to check if a link target exists
        function linkExists(target: string): boolean {
          const cleanTarget = target.split('#')[0];
          if (allMarkdownFiles.has(cleanTarget)) return true;
          
          try {
            const fullPath = path.resolve(selectedVault, cleanTarget + '.md');
            return fsSync.existsSync(fullPath);
          } catch {
            return false;
          }
        }

        // Function to find similar links for auto-fix suggestions
        function findSimilarLinks(target: string): string[] {
          const cleanTarget = target.toLowerCase();
          const similar: string[] = [];
          
          for (const file of allMarkdownFiles) {
            const fileName = file.toLowerCase();
            if (fileName.includes(cleanTarget) || cleanTarget.includes(fileName)) {
              similar.push(file);
            }
          }
          
          return similar.slice(0, 3); // Return up to 3 suggestions
        }

        // Scan for broken links
        async function scanForBrokenLinks(dir: string): Promise<void> {
          try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              
              if (entry.isDirectory() && !entry.name.startsWith('.')) {
                await scanForBrokenLinks(fullPath);
              } else if (entry.isFile() && entry.name.endsWith('.md')) {
                try {
                  const content = await fs.readFile(fullPath, 'utf-8');
                  const lines = content.split('\n');
                  const relativePath = path.relative(selectedVault, fullPath);

                  lines.forEach((line, lineNumber) => {
                    // Check wiki links [[...]]
                    if (link_types.includes('wiki')) {
                      const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
                      let match;
                      while ((match = wikiLinkRegex.exec(line)) !== null) {
                        const linkText = match[1];
                        const linkTarget = linkText.split('|')[0]; // Remove display text
                        
                        if (!linkExists(linkTarget)) {
                          const similar = findSimilarLinks(linkTarget);
                          brokenLinks.push({
                            sourceFile: fullPath,
                            sourceRelativePath: relativePath,
                            linkText: match[0],
                            linkTarget,
                            linkType: 'wiki',
                            lineNumber: lineNumber + 1,
                            canAutoFix: similar.length > 0,
                            suggestedFix: similar.length > 0 ? similar[0] : undefined,
                          });
                        }
                      }
                    }

                    // Check markdown links [...](...) 
                    if (link_types.includes('markdown')) {
                      const markdownLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
                      let match;
                      while ((match = markdownLinkRegex.exec(line)) !== null) {
                        const linkTarget = match[2];
                        
                        // Skip external links (http/https)
                        if (linkTarget.startsWith('http')) continue;
                        
                        // Clean the target for checking
                        const cleanTarget = linkTarget.replace('.md', '').split('#')[0];
                        
                        if (!linkExists(cleanTarget)) {
                          const similar = findSimilarLinks(cleanTarget);
                          brokenLinks.push({
                            sourceFile: fullPath,
                            sourceRelativePath: relativePath,
                            linkText: match[0],
                            linkTarget: cleanTarget,
                            linkType: 'markdown',
                            lineNumber: lineNumber + 1,
                            canAutoFix: similar.length > 0,
                            suggestedFix: similar.length > 0 ? similar[0] : undefined,
                          });
                        }
                      }
                    }
                  });
                } catch {
                  // Skip files that can't be read
                }
              }
            }
          } catch {
            // Skip directories that can't be accessed
          }
        }

        await scanForBrokenLinks(searchDir);

        // Auto-fix if requested
        if (fix_links && brokenLinks.length > 0) {
          const fixableLinks = brokenLinks.filter(link => link.canAutoFix && link.suggestedFix);
          
          for (const link of fixableLinks) {
            try {
              const content = await fs.readFile(link.sourceFile, 'utf-8');
              const lines = content.split('\n');
              
              if (link.linkType === 'wiki') {
                const newLinkText = `[[${link.suggestedFix}]]`;
                lines[link.lineNumber - 1] = lines[link.lineNumber - 1].replace(link.linkText, newLinkText);
              } else if (link.linkType === 'markdown') {
                const newLinkText = link.linkText.replace(link.linkTarget, link.suggestedFix);
                lines[link.lineNumber - 1] = lines[link.lineNumber - 1].replace(link.linkText, newLinkText);
              }
              
              await fs.writeFile(link.sourceFile, lines.join('\n'));
              link.fixed = true;
            } catch {
              // Failed to fix this link
            }
          }
        }

        // Generate report
        let result = `🔗 **壊れたリンク検証結果**\n\n`;
        result += `📊 検証範囲: ${scan_folder || '全体'}\n`;
        result += `🔍 検証タイプ: ${link_types.join(', ')}\n`;
        result += `🚫 壊れたリンク: ${brokenLinks.length}個\n\n`;

        if (brokenLinks.length === 0) {
          result += '🎉 壊れたリンクは見つかりませんでした！\n';
        } else {
          const wikiLinks = brokenLinks.filter(l => l.linkType === 'wiki').length;
          const markdownLinks = brokenLinks.filter(l => l.linkType === 'markdown').length;
          const fixableLinks = brokenLinks.filter(l => l.canAutoFix).length;
          const fixedLinks = brokenLinks.filter(l => l.fixed).length;

          result += `📋 **概要:**\n`;
          result += `- Wikiリンク: ${wikiLinks}個\n`;
          result += `- Markdownリンク: ${markdownLinks}個\n`;
          result += `- 自動修正可能: ${fixableLinks}個\n`;
          if (fix_links) {
            result += `- 修正済み: ${fixedLinks}個\n`;
          }
          result += '\n';

          if (create_report) {
            result += `📝 **詳細レポート:**\n\n`;
            brokenLinks.forEach((link, index) => {
              result += `${index + 1}. **${link.sourceRelativePath}** (行${link.lineNumber})\n`;
              result += `   🔗 ${link.linkText}\n`;
              result += `   ❌ 対象: ${link.linkTarget}\n`;
              result += `   📝 タイプ: ${link.linkType}\n`;
              if (link.suggestedFix) {
                result += `   💡 修正案: ${link.suggestedFix}\n`;
              }
              if (link.fixed) {
                result += `   ✅ 修正済み\n`;
              }
              result += '\n';
            });
          }

          if (!fix_links && fixableLinks > 0) {
            result += `\n💡 **自動修正を実行**: validate_broken_links(fix_links: true)\n`;
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `壊れたリンク検証エラー: ${error}`,
            },
          ],
        };
      }
    }

    case 'create_note': {
      // REQ-001: 厳密な保管庫選択チェック
      const vaultError = requireExplicitVaultSelection();
      if (vaultError) {
        return vaultError;
      }
      
      const { title: inputTitle, content, folder, metadata, force_create = false, confirm = false, template_choice, skip_template = false } = args as any;

      // REQ-002: Folder specification requirement
      if (folder === undefined && !confirm) {
        return {
          content: [
            {
              type: 'text',
              text: `=== 保存先フォルダの指定 ===\nファイルを保存するフォルダを指定してください。\n\n例:\n  - Templates/     (テンプレート用)\n  - Meeting/       (議事録用)\n  - Daily/         (デイリーノート用)\n  - Notes/         (一般ノート用)\n  - ""             (ルートフォルダ)\n\n使用方法：create_note(title: "${inputTitle || 'ノートタイトル'}", content: "...", folder: "フォルダパス")`
            },
          ],
        };
      }

      const finalFolder = folder || '';

      // テンプレート選択の必須確認（skip_templateがfalseの場合）
      if (!skip_template && !template_choice && !confirm) {
        // AIによるテンプレート提案
        const suggestedTemplates = generateSuggestedTemplates(inputTitle || '', content || '', finalFolder);
        
        return {
          content: [
            {
              type: 'text',
              text: `📋 テンプレート選択の確認

**ノート情報:**
- タイトル: ${inputTitle || '(未指定)'}
- フォルダ: ${finalFolder || '(ルート)'}
- 内容: ${content ? (content.length > 50 ? content.substring(0, 50) + '...' : content) : '(未指定)'}

AIがコンテンツを分析し、以下のテンプレートを提案します：

**選択肢:**
1. **テンプレートを使用しない** - そのまま作成
2. **${suggestedTemplates[0]?.name || 'おすすめテンプレート1'}** - ${suggestedTemplates[0]?.description || ''}
3. **${suggestedTemplates[1]?.name || 'おすすめテンプレート2'}** - ${suggestedTemplates[1]?.description || ''}
4. **${suggestedTemplates[2]?.name || 'おすすめテンプレート3'}** - ${suggestedTemplates[2]?.description || ''}

**選択方法:**
- テンプレートなし: create_note(title: "${inputTitle || ''}", content: "${content || ''}", folder: "${finalFolder}", skip_template: true, confirm: true)
- テンプレート使用: create_note(title: "${inputTitle || ''}", content: "${content || ''}", folder: "${finalFolder}", template_choice: 2, confirm: true)`
            },
            // テンプレートプレビューを個別のアーティファクトとして表示
            {
              type: 'text',
              text: `**プレビュー1: ${suggestedTemplates[0]?.name || 'テンプレート1'}**
\`\`\`markdown
${suggestedTemplates[0]?.content?.substring(0, 300) || ''}...
\`\`\``
            },
            {
              type: 'text', 
              text: `**プレビュー2: ${suggestedTemplates[1]?.name || 'テンプレート2'}**
\`\`\`markdown
${suggestedTemplates[1]?.content?.substring(0, 300) || ''}...
\`\`\``
            },
            {
              type: 'text',
              text: `**プレビュー3: ${suggestedTemplates[2]?.name || 'テンプレート3'}**
\`\`\`markdown
${suggestedTemplates[2]?.content?.substring(0, 300) || ''}...
\`\`\``
            }
          ],
        };
      }

      // テンプレート選択後の処理
      let finalContent = content || '';
      if (template_choice && template_choice >= 2 && template_choice <= 4) {
        const suggestedTemplates = generateSuggestedTemplates(inputTitle || '', content || '', finalFolder);
        const selectedTemplate = suggestedTemplates[template_choice - 2]; // 2,3,4 -> 0,1,2のインデックス
        
        if (selectedTemplate) {
          finalContent = selectedTemplate.content;
          // 元のコンテンツがある場合は末尾に追加
          if (content) {
            finalContent += '\n\n---\n\n**元の内容:**\n' + content;
          }
        }
      }
      
      // Handle missing title - ask for title or extract from content
      let finalTitle = inputTitle;
      if (!finalTitle) {
        if (!content) {
          return {
            content: [
              {
                type: 'text',
                text: `📝 ノートタイトルが必要です\n\nタイトルまたは内容のいずれかを指定してください：\n\n**オプション1: タイトルを指定**\ncreate_note(title: "ノートタイトル", content: "ノートの内容", folder: "${folder}")\n\n**オプション2: 内容から自動抽出**\ncreate_note(content: "# 見出し1をタイトルとして使用\\n\\n内容...", folder: "${folder}")\n\n**オプション3: 自動生成タイトル**\ncreate_note(title: "${generateDefaultTitle()}", content: "ノートの内容", folder: "${folder}")`,
              },
            ],
          };
        }
        
        // Try to extract title from content
        const extractedTitle = extractTitleFromContent(content);
        if (extractedTitle) {
          finalTitle = extractedTitle;
        } else {
          // Use default generated title
          finalTitle = generateDefaultTitle();
        }
      }
      
      // User confirmation required for note creation
      if (!confirm) {
        const targetPath = path.join(finalFolder, `${finalTitle}.md`);
        const fullTargetPath = path.join(selectedVault, finalFolder, `${finalTitle}.md`);
        
        // Check if folder exists
        let folderStatus = '';
        try {
          const folderPath = path.join(selectedVault, finalFolder);
          if (finalFolder) {
            await fs.access(folderPath);
            folderStatus = '✅ 既存フォルダ';
          } else {
            folderStatus = '📁 ルートフォルダ';
          }
        } catch {
          folderStatus = '🆕 新規フォルダ（作成されます）';
        }
        
        // Check if file already exists
        let fileStatus = '';
        try {
          await fs.access(fullTargetPath);
          fileStatus = '⚠️ **既存ファイルを上書きします**';
        } catch {
          fileStatus = '🆕 新規ファイル';
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `📝 ノート作成の確認\n\n**作成するノート:**\n- タイトル: ${finalTitle}${inputTitle ? '' : ' (自動生成/抽出)'}\n- 相対パス: ${targetPath}\n- 絶対パス: ${fullTargetPath}\n\n**保存先フォルダ詳細:**\n- フォルダ: ${folder || '（ルート）'}\n- 状態: ${folderStatus}\n\n**ファイル状態:**\n- ${fileStatus}\n\n**確認事項:**\n${!folder ? '- ルートフォルダに保存されます\n' : ''}${fileStatus.includes('上書き') ? '- 既存ファイルが上書きされます\n' : ''}${folderStatus.includes('新規') ? '- 新しいフォルダが作成されます\n' : ''}${!inputTitle ? '- タイトルが自動的に決定されました\n' : ''}\n本当にこの場所にノートを作成しますか？\n\n✅ **作成する**: create_note(title: "${finalTitle}", content: "${content || ''}", folder: "${folder}", confirm: true)\n❌ **キャンセル**: 操作をキャンセルします`,
            },
          ],
        };
      }
      
      // Check if templater is available and suggest templates
      if (!force_create && templaterPlugin) {
        const templates = await templaterPlugin.listTemplates();
        
        if (templates.length > 0) {
          const templateList = templates.map((t, index) => `${index + 1}. ${t.name}`).join('\n');
          return {
            content: [
              {
                type: 'text',
                text: `利用可能なテンプレート：\n\n${templateList}\n\nテンプレートを使用しますか？\n- 使用する場合: create_from_template(template_name: "Daily Note", title: "${finalTitle}", folder: "${folder}")\n- 使用しない場合: create_note(title: "${finalTitle}", content: "${content || '内容を入力してください'}", folder: "${folder}", force_create: true, confirm: true)`,
              },
            ],
          };
        }
      }
      
      if (!content && !force_create) {
        return {
          content: [
            {
              type: 'text',
              text: 'ノートの内容（content）が指定されていません。内容を指定してください。',
            },
          ],
        };
      }
      
      const notePath = path.join(selectedVault, folder, `${finalTitle}.md`);
      
      // Create directory if needed
      const dir = path.dirname(notePath);
      await fs.mkdir(dir, { recursive: true });
      
      // Build note content with frontmatter
      let fullContent = '';
      if (metadata && Object.keys(metadata).length > 0) {
        if (!metadata.created) {
          metadata.created = new Date().toISOString();
        }
        fullContent = createFrontmatter(metadata);
      }
      fullContent += finalContent || '';
      
      // Write the note
      await fs.writeFile(notePath, fullContent, 'utf-8');
      
      return {
        content: [
          {
            type: 'text',
            text: `Note created successfully!\n\nPath: ${path.relative(selectedVault, notePath)}`,
          },
        ],
      };
    }

    case 'delete_note': {
      // REQ-001: 厳密な保管庫選択チェック
      const vaultError = requireExplicitVaultSelection();
      if (vaultError) {
        return vaultError;
      }

      const { path: notePath, title, folder = '', confirm = false, trash = true } = args as any;
      
      // Determine the file path
      let targetPath: string;
      let displayPath: string;
      if (notePath) {
        targetPath = path.join(selectedVault, notePath);
        displayPath = notePath;
      } else if (title) {
        const fileName = title.endsWith('.md') ? title : `${title}.md`;
        targetPath = path.join(selectedVault, folder, fileName);
        displayPath = path.join(folder, fileName);
      } else {
        return {
          content: [
            {
              type: 'text',
              text: 'Please provide either "path" or "title" to identify the note to delete.',
            },
          ],
        };
      }

      // User confirmation required for note deletion
      if (!confirm) {
        return {
          content: [
            {
              type: 'text',
              text: `🗑️ ノート削除の確認\n\n削除するノート:\n- パス: ${displayPath}\n- 削除方法: ${trash ? 'ゴミ箱に移動' : '完全削除'}\n\n⚠️ **警告**: この操作は取り消せません。\n\n本当にこのノートを削除しますか？\n\n✅ **削除する**: delete_note(${notePath ? `path: "${notePath}"` : `title: "${title}", folder: "${folder}"`}, confirm: true, trash: ${trash})\n❌ **キャンセル**: 操作をキャンセルします`,
            },
          ],
        };
      }

      // Check if file exists
      try {
        await fs.access(targetPath);
      } catch {
        return {
          content: [
            {
              type: 'text',
              text: `Note not found: ${path.relative(selectedVault, targetPath)}`,
            },
          ],
        };
      }

      // Read the file to show what will be deleted
      const content = await fs.readFile(targetPath, 'utf-8');
      const lines = content.split('\n').slice(0, 5);
      const preview = lines.join('\n') + (content.split('\n').length > 5 ? '\n...' : '');

      if (!confirm) {
        return {
          content: [
            {
              type: 'text',
              text: `⚠️ Confirm deletion of note:\n\nPath: ${path.relative(selectedVault, targetPath)}\n\nPreview:\n${preview}\n\nTo confirm deletion, use the same command with "confirm: true"`,
            },
          ],
        };
      }

      if (trash) {
        // Move to trash folder
        const trashDir = path.join(selectedVault, '.trash');
        await fs.mkdir(trashDir, { recursive: true });
        
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        const trashName = `${path.basename(targetPath, '.md')}_${timestamp}.md`;
        const trashPath = path.join(trashDir, trashName);
        
        await fs.rename(targetPath, trashPath);
        
        return {
          content: [
            {
              type: 'text',
              text: `Note moved to trash successfully!\n\nOriginal: ${path.relative(selectedVault, targetPath)}\nTrash: ${path.relative(selectedVault, trashPath)}`,
            },
          ],
        };
      } else {
        // Permanent deletion
        await fs.unlink(targetPath);
        
        return {
          content: [
            {
              type: 'text',
              text: `Note permanently deleted!\n\nPath: ${path.relative(selectedVault, targetPath)}`,
            },
          ],
        };
      }
    }

    case 'read_note': {
      // REQ-001: 厳密な保管庫選択チェック
      const vaultError = requireExplicitVaultSelection();
      if (vaultError) {
        return vaultError;
      }

      const { path: notePath, title, folder = '' } = args as any;
      
      // Determine the file path
      let targetPath: string;
      if (notePath) {
        targetPath = path.join(selectedVault, notePath);
      } else if (title) {
        const fileName = title.endsWith('.md') ? title : `${title}.md`;
        targetPath = path.join(selectedVault, folder, fileName);
      } else {
        return {
          content: [
            {
              type: 'text',
              text: 'Please provide either "path" or "title" to identify the note to read.',
            },
          ],
        };
      }

      // Read the file
      try {
        const content = await fs.readFile(targetPath, 'utf-8');
        const { metadata, body } = parseFrontmatter(content);
        
        let result = `# Note: ${path.basename(targetPath, '.md')}\n\n`;
        result += `**Path**: ${path.relative(selectedVault, targetPath)}\n\n`;
        
        if (Object.keys(metadata).length > 0) {
          result += `## Metadata\n`;
          for (const [key, value] of Object.entries(metadata)) {
            result += `- **${key}**: ${Array.isArray(value) ? value.join(', ') : value}\n`;
          }
          result += '\n';
        }
        
        result += `## Content\n\n${body}`;
        
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error reading note: ${path.relative(selectedVault, targetPath)}\n\n${error}`,
            },
          ],
        };
      }
    }

    case 'update_note': {
      // REQ-001: 厳密な保管庫選択チェック
      const vaultError = requireExplicitVaultSelection();
      if (vaultError) {
        return vaultError;
      }

      const { path: notePath, title, folder = '', content: newContent, append = false, metadata: newMetadata } = args as any;
      
      // Determine the file path
      let targetPath: string;
      if (notePath) {
        targetPath = path.join(selectedVault, notePath);
      } else if (title) {
        const fileName = title.endsWith('.md') ? title : `${title}.md`;
        targetPath = path.join(selectedVault, folder, fileName);
      } else {
        return {
          content: [
            {
              type: 'text',
              text: 'Please provide either "path" or "title" to identify the note to update.',
            },
          ],
        };
      }

      // Check if file exists
      let existingContent = '';
      let existingMetadata = {};
      
      try {
        existingContent = await fs.readFile(targetPath, 'utf-8');
        const parsed = parseFrontmatter(existingContent);
        existingMetadata = parsed.metadata;
        if (append) {
          existingContent = parsed.body;
        }
      } catch {
        // File doesn't exist, will create new
      }

      // Merge metadata if provided
      const finalMetadata = newMetadata ? { ...existingMetadata, ...newMetadata } : existingMetadata;
      if (!finalMetadata.modified) {
        finalMetadata.modified = new Date().toISOString();
      }

      // Build final content
      let fullContent = '';
      if (Object.keys(finalMetadata).length > 0) {
        fullContent = createFrontmatter(finalMetadata);
      }
      
      if (append && existingContent) {
        fullContent += existingContent + '\n\n' + newContent;
      } else {
        fullContent += newContent;
      }

      // Write the updated note
      await fs.writeFile(targetPath, fullContent, 'utf-8');
      
      return {
        content: [
          {
            type: 'text',
            text: `Note updated successfully!\n\nPath: ${path.relative(selectedVault, targetPath)}\nMode: ${append ? 'Append' : 'Replace'}`,
          },
        ],
      };
    }

    case 'list_notes': {
      // REQ-001: 厳密な保管庫選択チェック
      const vaultError = requireExplicitVaultSelection();
      if (vaultError) {
        return vaultError;
      }

      const { folder = '', recursive = true } = args as any;
      const searchDir = path.join(selectedVault, folder);
      
      // Function to recursively find markdown files
      async function findMarkdownFiles(dir: string, baseDir: string): Promise<string[]> {
        const files: string[] = [];
        
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              if (recursive) {
                const subFiles = await findMarkdownFiles(fullPath, baseDir);
                files.push(...subFiles);
              }
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              files.push(path.relative(baseDir, fullPath));
            }
          }
        } catch (error) {
          // Directory doesn't exist or permission error
        }
        
        return files;
      }

      const notes = await findMarkdownFiles(searchDir, selectedVault);
      
      if (notes.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No notes found in ${folder || 'vault root'}`,
            },
          ],
        };
      }

      // Group by folder
      const grouped: { [key: string]: string[] } = {};
      for (const note of notes) {
        const dir = path.dirname(note);
        const key = dir === '.' ? 'Root' : dir;
        if (!grouped[key]) {
          grouped[key] = [];
        }
        grouped[key].push(path.basename(note, '.md'));
      }

      let result = `Found ${notes.length} note(s) in ${folder || 'vault'}:\n\n`;
      
      for (const [dir, files] of Object.entries(grouped)) {
        result += `📁 **${dir}**\n`;
        for (const file of files.sort()) {
          result += `  📝 ${file}\n`;
        }
        result += '\n';
      }
      
      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    }

    case 'search_notes': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please use "list_vaults" and then "select_vault" first.',
            },
          ],
        };
      }

      const { query, folder = '', tags = [], recursive = true } = args as any;
      const searchDir = path.join(selectedVault, folder);
      
      // Function to recursively find and search markdown files
      async function searchInFiles(dir: string, baseDir: string): Promise<Array<{path: string, matches: Array<{line: number, content: string}>}>> {
        const results: Array<{path: string, matches: Array<{line: number, content: string}>}> = [];
        
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              if (recursive) {
                const subResults = await searchInFiles(fullPath, baseDir);
                results.push(...subResults);
              }
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              try {
                const content = await fs.readFile(fullPath, 'utf-8');
                const { metadata, body } = parseFrontmatter(content);
                
                // Filter by tags if specified
                if (tags.length > 0) {
                  const noteTags = metadata.tags || [];
                  const hasMatchingTag = tags.some(tag => 
                    noteTags.includes(tag) || noteTags.includes(`#${tag}`)
                  );
                  if (!hasMatchingTag) continue;
                }
                
                // Search in content
                const lines = body.split('\n');
                const matches: Array<{line: number, content: string}> = [];
                
                lines.forEach((line, index) => {
                  if (line.toLowerCase().includes(query.toLowerCase())) {
                    matches.push({
                      line: index + 1,
                      content: line.trim()
                    });
                  }
                });
                
                if (matches.length > 0) {
                  results.push({
                    path: path.relative(baseDir, fullPath),
                    matches: matches
                  });
                }
              } catch (error) {
                // Skip files that can't be read
              }
            }
          }
        } catch (error) {
          // Directory doesn't exist or permission error
        }
        
        return results;
      }

      const searchResults = await searchInFiles(searchDir, selectedVault);
      
      if (searchResults.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No matches found for "${query}"${folder ? ` in ${folder}` : ''}${tags.length > 0 ? ` with tags: ${tags.join(', ')}` : ''}`,
            },
          ],
        };
      }

      let result = `Found ${searchResults.length} note(s) matching "${query}"${folder ? ` in ${folder}` : ''}${tags.length > 0 ? ` with tags: ${tags.join(', ')}` : ''}:\n\n`;
      
      for (const note of searchResults) {
        result += `📝 **${note.path}**\n`;
        note.matches.slice(0, 3).forEach(match => {
          result += `   Line ${match.line}: ${match.content}\n`;
        });
        if (note.matches.length > 3) {
          result += `   ... and ${note.matches.length - 3} more matches\n`;
        }
        result += '\n';
      }
      
      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    }

    case 'get_all_tags': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please use "list_vaults" and then "select_vault" first.',
            },
          ],
        };
      }

      // Function to recursively find tags in markdown files
      async function collectTags(dir: string): Promise<Map<string, number>> {
        const tagCounts = new Map<string, number>();
        
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              const subTags = await collectTags(fullPath);
              for (const [tag, count] of subTags) {
                tagCounts.set(tag, (tagCounts.get(tag) || 0) + count);
              }
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              try {
                const content = await fs.readFile(fullPath, 'utf-8');
                const { metadata, body } = parseFrontmatter(content);
                
                // Extract tags from frontmatter
                if (metadata.tags && Array.isArray(metadata.tags)) {
                  for (const tag of metadata.tags) {
                    const cleanTag = tag.replace(/^#/, '');
                    tagCounts.set(cleanTag, (tagCounts.get(cleanTag) || 0) + 1);
                  }
                }
                
                // Extract hashtags from content
                const hashtagRegex = /#([a-zA-Z0-9_-]+)/g;
                let match;
                while ((match = hashtagRegex.exec(body)) !== null) {
                  const tag = match[1];
                  tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
                }
              } catch (error) {
                // Skip files that can't be read
              }
            }
          }
        } catch (error) {
          // Directory doesn't exist or permission error
        }
        
        return tagCounts;
      }

      const allTags = await collectTags(selectedVault);
      
      if (allTags.size === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No tags found in the vault.',
            },
          ],
        };
      }

      // Sort tags by frequency
      const sortedTags = Array.from(allTags.entries()).sort((a, b) => b[1] - a[1]);
      
      let result = `Found ${allTags.size} unique tag(s) in the vault:\n\n`;
      
      for (const [tag, count] of sortedTags) {
        result += `🏷️ **${tag}** (${count} note${count > 1 ? 's' : ''})\n`;
      }
      
      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    }

    case 'search_by_tag': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please use "list_vaults" and then "select_vault" first.',
            },
          ],
        };
      }

      const { tag, folder = '' } = args as any;
      const searchDir = path.join(selectedVault, folder);
      const cleanTag = tag.replace(/^#/, '');
      
      // Function to find notes with specific tag
      async function findNotesByTag(dir: string, baseDir: string): Promise<string[]> {
        const results: string[] = [];
        
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              const subResults = await findNotesByTag(fullPath, baseDir);
              results.push(...subResults);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              try {
                const content = await fs.readFile(fullPath, 'utf-8');
                const { metadata, body } = parseFrontmatter(content);
                
                let hasTag = false;
                
                // Check frontmatter tags
                if (metadata.tags && Array.isArray(metadata.tags)) {
                  hasTag = metadata.tags.some(t => 
                    t === cleanTag || t === `#${cleanTag}` || t.replace(/^#/, '') === cleanTag
                  );
                }
                
                // Check hashtags in content
                if (!hasTag) {
                  const hashtagRegex = new RegExp(`#${cleanTag}\\b`, 'i');
                  hasTag = hashtagRegex.test(body);
                }
                
                if (hasTag) {
                  results.push(path.relative(baseDir, fullPath));
                }
              } catch (error) {
                // Skip files that can't be read
              }
            }
          }
        } catch (error) {
          // Directory doesn't exist or permission error
        }
        
        return results;
      }

      const taggedNotes = await findNotesByTag(searchDir, selectedVault);
      
      if (taggedNotes.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No notes found with tag "${cleanTag}"${folder ? ` in ${folder}` : ''}`,
            },
          ],
        };
      }

      let result = `Found ${taggedNotes.length} note(s) with tag "${cleanTag}"${folder ? ` in ${folder}` : ''}:\n\n`;
      
      for (const notePath of taggedNotes) {
        const dir = path.dirname(notePath);
        const fileName = path.basename(notePath, '.md');
        result += `📝 ${dir === '.' ? fileName : `${dir}/${fileName}`}\n`;
      }
      
      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    }

    case 'add_tag_to_note': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please use "list_vaults" and then "select_vault" first.',
            },
          ],
        };
      }

      const { path: notePath, title, folder = '', tags } = args as any;
      
      // Determine the file path
      let targetPath: string;
      if (notePath) {
        targetPath = path.join(selectedVault, notePath);
      } else if (title) {
        const fileName = title.endsWith('.md') ? title : `${title}.md`;
        targetPath = path.join(selectedVault, folder, fileName);
      } else {
        return {
          content: [
            {
              type: 'text',
              text: 'Please provide either "path" or "title" to identify the note.',
            },
          ],
        };
      }

      // Read the existing file
      try {
        const content = await fs.readFile(targetPath, 'utf-8');
        const { metadata, body } = parseFrontmatter(content);
        
        // Add tags to metadata
        const existingTags = metadata.tags || [];
        const newTags = [...existingTags];
        
        for (const tag of tags) {
          const cleanTag = tag.replace(/^#/, '');
          if (!newTags.includes(cleanTag) && !newTags.includes(`#${cleanTag}`)) {
            newTags.push(cleanTag);
          }
        }
        
        metadata.tags = newTags;
        metadata.modified = new Date().toISOString();
        
        // Rebuild content with updated metadata
        const newContent = createFrontmatter(metadata) + body;
        
        // Write the updated file
        await fs.writeFile(targetPath, newContent, 'utf-8');
        
        return {
          content: [
            {
              type: 'text',
              text: `Tags added successfully!\n\nNote: ${path.relative(selectedVault, targetPath)}\nAdded tags: ${tags.join(', ')}\nAll tags: ${newTags.join(', ')}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Could not read note at ${path.relative(selectedVault, targetPath)}\n\n${error}`,
            },
          ],
        };
      }
    }

    case 'move_note': {
      // REQ-001: 厳密な保管庫選択チェック
      const vaultError = requireExplicitVaultSelection();
      if (vaultError) {
        return vaultError;
      }

      const { source_path: sourcePath, destination_path: destinationPath, force = false, confirm = false } = args as any;

      if (!sourcePath || !destinationPath) {
        return {
          content: [
            {
              type: 'text',
              text: `📄 ノート移動機能\n\n**必要なパラメータ:**\n- source_path: 移動元のファイルパス\n- destination_path: 移動先のファイルパス\n\n**使用例:**\nmove_note(source_path: "ノート.md", destination_path: "Archive/ノート.md")\n\n**オプション:**\n- force: true で上書き確認をスキップ\n- confirm: true で実際の移動を実行`,
            },
          ],
        };
      }

      // 確認プロセス
      if (!confirm) {
        const sourceFullPath = path.resolve(selectedVault, sourcePath);
        const destFullPath = path.resolve(selectedVault, destinationPath);

        // ファイル存在確認
        let sourceStatus = '';
        let destStatus = '';
        
        try {
          if (fsSync.existsSync(sourceFullPath)) {
            sourceStatus = '✅ 存在';
          } else {
            sourceStatus = '❌ 存在しません';
          }
        } catch {
          sourceStatus = '❌ アクセスできません';
        }

        try {
          if (fsSync.existsSync(destFullPath)) {
            destStatus = '⚠️ 既存ファイルを上書きします';
          } else {
            destStatus = '🆕 新規ファイル';
          }
        } catch {
          destStatus = '🆕 新規ファイル';
        }

        return {
          content: [
            {
              type: 'text',
              text: `📄 ノート移動の確認\n\n**移動元:**\n- パス: ${sourcePath}\n- 状態: ${sourceStatus}\n\n**移動先:**\n- パス: ${destinationPath}\n- 状態: ${destStatus}\n\n${sourceStatus.includes('❌') ? '⚠️ 移動元ファイルが存在しません\n' : ''}${destStatus.includes('上書き') ? '⚠️ 移動先に同名ファイルが存在します\n' : ''}\n✅ **実行する**: move_note(source_path: "${sourcePath}", destination_path: "${destinationPath}", confirm: true)\n❌ **キャンセル**: 操作をキャンセルします`,
            },
          ],
        };
      }

      try {
        const sourceFullPath = path.resolve(selectedVault, sourcePath);
        const destFullPath = path.resolve(selectedVault, destinationPath);

        // 安全性チェック: ファイルがvault内にあるか確認
        if (!sourceFullPath.startsWith(selectedVault) || !destFullPath.startsWith(selectedVault)) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: File paths must be within the selected vault.',
              },
            ],
          };
        }

        // ソースファイルが存在するか確認
        if (!fsSync.existsSync(sourceFullPath)) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: Source file does not exist: ${sourcePath}`,
              },
            ],
          };
        }

        // 拡張子が.mdでない場合は警告
        if (!sourcePath.endsWith('.md')) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Only markdown files (.md) can be moved.',
              },
            ],
        };
        }

        // 移動先ディレクトリが存在しない場合は作成
        const destDir = path.dirname(destFullPath);
        if (!fsSync.existsSync(destDir)) {
          fsSync.mkdirSync(destDir, { recursive: true });
        }

        // 競合チェック
        if (fsSync.existsSync(destFullPath) && !force) {
          return {
            content: [
              {
                type: 'text',
                text: `移動先にファイルが既に存在します: ${destinationPath}\n\n上書きする場合は force パラメータを true に設定してください。`,
              },
            ],
          };
        }

        // ファイル移動を実行
        fsSync.renameSync(sourceFullPath, destFullPath);

        // Obsidianリンクを更新
        const linksUpdated = await updateObsidianLinks(selectedVault, sourcePath, destinationPath);

        return {
          content: [
            {
              type: 'text',
              text: `✅ ノートを正常に移動しました:\n${sourcePath} → ${destinationPath}\n\n📝 更新されたリンク数: ${linksUpdated}`,
            },
          ],
        };

      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error moving note: ${error}`,
            },
          ],
        };
      }
    }

    case 'bulk_move_notes': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please select a vault first using select_vault.',
            },
          ],
        };
      }

      const sourcePattern = args?.source_pattern as string;
      const destinationFolder = args?.destination_folder as string;
      const force = args?.force as boolean || false;
      const dryRun = args?.dry_run as boolean || false;

      if (!sourcePattern || !destinationFolder) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Both source_pattern and destination_folder are required.',
            },
          ],
        };
      }

      try {
        const destFolderPath = path.resolve(selectedVault, destinationFolder);

        // 移動先フォルダがvault内にあるか確認
        if (!destFolderPath.startsWith(selectedVault)) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Destination folder must be within the selected vault.',
              },
            ],
          };
        }

        // パターンにマッチするファイルを検索
        const glob = require('glob');
        const pattern = path.resolve(selectedVault, sourcePattern);
        const matchingFiles = glob.sync(pattern, { nodir: true })
          .filter((file: string) => file.endsWith('.md'))
          .filter((file: string) => file.startsWith(selectedVault));

        if (matchingFiles.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `パターンにマッチするマークダウンファイルが見つかりません: ${sourcePattern}`,
              },
            ],
          };
        }

        // 競合チェック
        const conflicts: string[] = [];
        const moves: Array<{ source: string, dest: string }> = [];

        for (const sourceFile of matchingFiles) {
          const fileName = path.basename(sourceFile);
          const destFile = path.join(destFolderPath, fileName);
          const sourcePath = path.relative(selectedVault, sourceFile);
          const destPath = path.relative(selectedVault, destFile);

          moves.push({ source: sourcePath, dest: destPath });

          if (fsSync.existsSync(destFile) && !force) {
            conflicts.push(`${sourcePath} → ${destPath}`);
          }
        }

        if (conflicts.length > 0 && !force) {
          return {
            content: [
              {
                type: 'text',
                text: `以下のファイルで競合が発生しています:\n\n${conflicts.join('\n')}\n\n上書きする場合は force パラメータを true に設定してください。`,
              },
            ],
          };
        }

        // ドライランモード
        if (dryRun) {
          const moveList = moves.map(m => `${m.source} → ${m.dest}`).join('\n');
          return {
            content: [
              {
                type: 'text',
                text: `🔍 ドライラン結果 (${moves.length}個のファイル):\n\n${moveList}\n\n実際に移動するには dry_run を false に設定してください。`,
              },
            ],
          };
        }

        // 移動先フォルダを作成
        if (!fsSync.existsSync(destFolderPath)) {
          fsSync.mkdirSync(destFolderPath, { recursive: true });
        }

        // ファイルを一括移動
        let totalLinksUpdated = 0;
        const movedFiles: string[] = [];

        for (const move of moves) {
          const sourceFullPath = path.resolve(selectedVault, move.source);
          const destFullPath = path.resolve(selectedVault, move.dest);

          fsSync.renameSync(sourceFullPath, destFullPath);
          movedFiles.push(`${move.source} → ${move.dest}`);

          // リンクを更新
          const linksUpdated = await updateObsidianLinks(selectedVault, move.source, move.dest);
          totalLinksUpdated += linksUpdated;
        }

        return {
          content: [
            {
              type: 'text',
              text: `✅ ${movedFiles.length}個のノートを正常に移動しました:\n\n${movedFiles.join('\n')}\n\n📝 更新されたリンク数: ${totalLinksUpdated}`,
            },
          ],
        };

      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error during bulk move: ${error}`,
            },
          ],
        };
      }
    }

    case 'move_folder': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please select a vault first using select_vault.',
            },
          ],
        };
      }

      const sourceFolderPath = args?.source_folder_path as string;
      const destinationFolderPath = args?.destination_folder_path as string;
      const force = args?.force as boolean || false;
      const dryRun = args?.dry_run as boolean || false;

      if (!sourceFolderPath || !destinationFolderPath) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Both source_folder_path and destination_folder_path are required.',
            },
          ],
        };
      }

      try {
        const sourceFullPath = path.resolve(selectedVault, sourceFolderPath);
        const destFullPath = path.resolve(selectedVault, destinationFolderPath);

        // 安全性チェック
        if (!sourceFullPath.startsWith(selectedVault) || !destFullPath.startsWith(selectedVault)) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Folder paths must be within the selected vault.',
              },
            ],
        };
        }

        // ソースフォルダが存在するか確認
        if (!fsSync.existsSync(sourceFullPath) || !fsSync.lstatSync(sourceFullPath).isDirectory()) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: Source folder does not exist: ${sourceFolderPath}`,
              },
            ],
        };
        }

        // 自己参照チェック
        if (destFullPath.startsWith(sourceFullPath + path.sep) || destFullPath === sourceFullPath) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Cannot move folder into itself or its subdirectory.',
              },
            ],
        };
        }

        // 競合チェック
        if (fsSync.existsSync(destFullPath) && !force) {
          return {
            content: [
              {
                type: 'text',
                text: `移動先フォルダが既に存在します: ${destinationFolderPath}\n\nマージする場合は force パラメータを true に設定してください。`,
              },
            ],
        };
        }

        // フォルダ内のマークダウンファイルを収集
        function collectMarkdownFiles(dir: string, basePath: string): Array<{ source: string, dest: string }> {
          const files: Array<{ source: string, dest: string }> = [];
          const entries = fsSync.readdirSync(dir);

          for (const entry of entries) {
            const fullPath = path.join(dir, entry);
            const stat = fsSync.lstatSync(fullPath);

            if (stat.isDirectory()) {
              const subFiles = collectMarkdownFiles(fullPath, basePath);
              files.push(...subFiles);
            } else if (entry.endsWith('.md')) {
              const relativePath = path.relative(selectedVault, fullPath);
              const newPath = relativePath.replace(sourceFolderPath, destinationFolderPath);
              files.push({ source: relativePath, dest: newPath });
            }
          }

          return files;
        }

        const markdownFiles = collectMarkdownFiles(sourceFullPath, selectedVault);

        // ドライランモード
        if (dryRun) {
          const filesList = markdownFiles.map(f => `  ${f.source} → ${f.dest}`).join('\n');
          return {
            content: [
              {
                type: 'text',
                text: `🔍 フォルダ移動のドライラン結果:\n\nフォルダ: ${sourceFolderPath} → ${destinationFolderPath}\n\nマークダウンファイル (${markdownFiles.length}個):\n${filesList}\n\n実際に移動するには dry_run を false に設定してください。`,
              },
            ],
          };
        }

        // フォルダ移動を実行
        if (fsSync.existsSync(destFullPath)) {
          // マージの場合: ファイルを個別に移動
          const destParent = path.dirname(destFullPath);
          if (!fsSync.existsSync(destParent)) {
            fsSync.mkdirSync(destParent, { recursive: true });
          }

          function moveDirectory(src: string, dest: string): void {
            if (!fsSync.existsSync(dest)) {
              fsSync.mkdirSync(dest, { recursive: true });
            }

            const entries = fsSync.readdirSync(src);
            for (const entry of entries) {
              const srcPath = path.join(src, entry);
              const destPath = path.join(dest, entry);
              const stat = fsSync.lstatSync(srcPath);

              if (stat.isDirectory()) {
                moveDirectory(srcPath, destPath);
              } else {
                fsSync.renameSync(srcPath, destPath);
              }
            }

            // 元のディレクトリを削除
            if (fsSync.readdirSync(src).length === 0) {
              fsSync.rmdirSync(src);
            }
          }

          moveDirectory(sourceFullPath, destFullPath);
        } else {
          // 新しい場所への移動
          const destParent = path.dirname(destFullPath);
          if (!fsSync.existsSync(destParent)) {
            fsSync.mkdirSync(destParent, { recursive: true });
          }
          fsSync.renameSync(sourceFullPath, destFullPath);
        }

        // マークダウンファイルのリンクを更新
        let totalLinksUpdated = 0;
        for (const file of markdownFiles) {
          const linksUpdated = await updateObsidianLinks(selectedVault, file.source, file.dest);
          totalLinksUpdated += linksUpdated;
        }

        return {
          content: [
            {
              type: 'text',
              text: `✅ フォルダを正常に移動しました:\n${sourceFolderPath} → ${destinationFolderPath}\n\n📁 マークダウンファイル数: ${markdownFiles.length}\n📝 更新されたリンク数: ${totalLinksUpdated}`,
            },
          ],
        };

      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error moving folder: ${error}`,
            },
          ],
        };
      }
    }

    // Kanban Plugin Tools
    case 'create_kanban_board': {
      if (!selectedVault || !kanbanPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected or Kanban plugin not initialized.',
            },
          ],
        };
      }

      const { board_name, lane_names = ['To Do', 'Doing', 'Done'], folder = '' } = args as any;
      
      try {
        const boardPath = await kanbanPlugin.createKanbanBoard(board_name, lane_names, folder);
        
        return {
          content: [
            {
              type: 'text',
              text: `Kanban board created successfully!

Board: ${board_name}
Path: ${boardPath}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error creating Kanban board: ${error}`,
            },
          ],
        };
      }
    }

    case 'add_kanban_card': {
      if (!selectedVault || !kanbanPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'ボールトが選択されていないか、Kanbanプラグインが初期化されていません。',
            },
          ],
        };
      }

      const { board_path, lane_title, title, content = '', assignee, tags = [], due_date, check_items = [] } = args as any;
      
      try {
        const cardData = {
          title,
          content,
          assignee,
          tags,
          dueDate: due_date,
          checkItems: check_items,
        };

        const card = await kanbanPlugin.addKanbanCard(board_path, lane_title, cardData);
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ Kanbanカードが正常に追加されました！

**カード詳細:**
- ID: ${card.id}
- タイトル: ${card.title}
- レーン: ${lane_title}
- 作成日: ${card.createdDate}
${card.assignee ? `- 担当者: ${card.assignee}` : ''}
${card.dueDate ? `- 期限: ${card.dueDate}` : ''}
${card.tags && card.tags.length > 0 ? `- タグ: ${card.tags.join(', ')}` : ''}

ボードパス: ${board_path}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Kanbanカードの追加に失敗しました: ${error}`,
            },
          ],
        };
      }
    }

    case 'move_kanban_card': {
      if (!selectedVault || !kanbanPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'ボールトが選択されていないか、Kanbanプラグインが初期化されていません。',
            },
          ],
        };
      }

      const { board_path, card_id, target_lane_title, position } = args as any;
      
      try {
        const success = await kanbanPlugin.moveKanbanCard(board_path, card_id, target_lane_title, position);
        
        if (success) {
          return {
            content: [
              {
                type: 'text',
                text: `✅ Kanbanカードが正常に移動されました！

**移動詳細:**
- カードID: ${card_id}
- 移動先レーン: ${target_lane_title}
${position !== undefined ? `- 位置: ${position}` : '- 位置: レーンの最後尾'}

ボードパス: ${board_path}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Kanbanカードの移動に失敗しました。カードIDまたはレーンが見つかりません。`,
              },
            ],
          };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Kanbanカードの移動に失敗しました: ${error}`,
            },
          ],
        };
      }
    }

    case 'update_kanban_card': {
      if (!selectedVault || !kanbanPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'ボールトが選択されていないか、Kanbanプラグインが初期化されていません。',
            },
          ],
        };
      }

      const { board_path, card_id, title, content, assignee, tags, due_date, check_items } = args as any;
      
      try {
        const updates: any = {};
        if (title !== undefined) updates.title = title;
        if (content !== undefined) updates.content = content;
        if (assignee !== undefined) updates.assignee = assignee;
        if (tags !== undefined) updates.tags = tags;
        if (due_date !== undefined) updates.dueDate = due_date;
        if (check_items !== undefined) updates.checkItems = check_items;

        const success = await kanbanPlugin.updateKanbanCard(board_path, card_id, updates);
        
        if (success) {
          const updatedFields = Object.keys(updates);
          return {
            content: [
              {
                type: 'text',
                text: `✅ Kanbanカードが正常に更新されました！

**更新詳細:**
- カードID: ${card_id}
- 更新されたフィールド: ${updatedFields.join(', ')}

ボードパス: ${board_path}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Kanbanカードの更新に失敗しました。カードIDが見つかりません。`,
              },
            ],
          };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Kanbanカードの更新に失敗しました: ${error}`,
            },
          ],
        };
      }
    }

    case 'list_kanban_boards': {
      if (!selectedVault || !kanbanPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'ボールトが選択されていないか、Kanbanプラグインが初期化されていません。',
            },
          ],
        };
      }
      
      try {
        const boards = await kanbanPlugin.listKanbanBoards();
        
        if (boards.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `📋 Kanbanボード一覧

ボールト内にKanbanボードが見つかりませんでした。

**新しいKanbanボードを作成するには:**
create_kanban_board(board_name: "マイボード", lane_names: ["To Do", "Doing", "Done"])`,
              },
            ],
          };
        }

        const boardList = boards.map((board, index) => 
          `${index + 1}. **${board.name}**
   - パス: ${board.path}
   - レーン数: ${board.laneCount}
   - カード数: ${board.cardCount}`
        ).join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `📋 Kanbanボード一覧 (${boards.length}個のボードが見つかりました)

${boardList}

**ボード操作:**
- ボード詳細を見る: get_kanban_board(board_path: "path/to/board.md")
- カードを追加: add_kanban_card(board_path: "path", lane_title: "To Do", title: "新しいタスク")`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Kanbanボード一覧の取得に失敗しました: ${error}`,
            },
          ],
        };
      }
    }

    case 'get_kanban_board': {
      if (!selectedVault || !kanbanPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'ボールトが選択されていないか、Kanbanプラグインが初期化されていません。',
            },
          ],
        };
      }

      const { board_path } = args as any;
      
      try {
        const boardData = await kanbanPlugin.getKanbanBoard(board_path);
        const { board, name, path, stats } = boardData;

        const laneInfo = board.lanes.map((lane, index) => 
          `**${index + 1}. ${lane.title}** (${lane.cards.length}枚)${lane.cards.length > 0 ? '\n' + lane.cards.map((card, cardIndex) => 
            `   ${cardIndex + 1}. ${card.title}${card.assignee ? ` [@${card.assignee}]` : ''}${card.dueDate ? ` 📅${card.dueDate}` : ''}${card.tags && card.tags.length > 0 ? ` #${card.tags.join(' #')}` : ''}`
          ).join('\n') : ''}`
        ).join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `📋 Kanbanボード: ${name}

**基本情報:**
- パス: ${path}
- 総カード数: ${stats.totalCards}枚
- アーカイブ済み: ${stats.archivedCards}枚

**レーン構成:**
${laneInfo}

**利用可能な操作:**
- カード追加: add_kanban_card(board_path: "${board_path}", lane_title: "レーン名", title: "タイトル")
- カード移動: move_kanban_card(board_path: "${board_path}", card_id: "カードID", target_lane_title: "移動先レーン")
- カード更新: update_kanban_card(board_path: "${board_path}", card_id: "カードID", title: "新しいタイトル")`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Kanbanボード情報の取得に失敗しました: ${error}`,
            },
          ],
        };
      }
    }

    case 'delete_kanban_card': {
      if (!selectedVault || !kanbanPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'ボールトが選択されていないか、Kanbanプラグインが初期化されていません。',
            },
          ],
        };
      }

      const { board_path, card_id } = args as any;
      
      try {
        const success = await kanbanPlugin.deleteKanbanCard(board_path, card_id);
        
        if (success) {
          return {
            content: [
              {
                type: 'text',
                text: `✅ Kanbanカードが正常に削除されました！

**削除詳細:**
- カードID: ${card_id}
- ボードパス: ${board_path}

⚠️ **注意:** この操作は取り消すことができません。
アーカイブが必要な場合は archive_kanban_card() を使用してください。`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Kanbanカードの削除に失敗しました。指定されたカードIDが見つかりません。`,
              },
            ],
          };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Kanbanカードの削除に失敗しました: ${error}`,
            },
          ],
        };
      }
    }

    case 'archive_kanban_card': {
      if (!selectedVault || !kanbanPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'ボールトが選択されていないか、Kanbanプラグインが初期化されていません。',
            },
          ],
        };
      }

      const { board_path, card_id } = args as any;
      
      try {
        const success = await kanbanPlugin.archiveKanbanCard(board_path, card_id);
        
        if (success) {
          return {
            content: [
              {
                type: 'text',
                text: `📦 Kanbanカードが正常にアーカイブされました！

**アーカイブ詳細:**
- カードID: ${card_id}
- ボードパス: ${board_path}

ℹ️ **アーカイブされたカードについて:**
- カードはレーンから削除され、ボードのアーカイブセクションに移動されました
- アーカイブされたカードはボード情報で確認できます
- 必要に応じて後で参照することができます

**アーカイブを確認するには:**
get_kanban_board(board_path: "${board_path}")`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Kanbanカードのアーカイブに失敗しました。指定されたカードIDが見つかりません。`,
              },
            ],
          };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Kanbanカードのアーカイブに失敗しました: ${error}`,
            },
          ],
        };
      }
    }

    case 'get_backlinks': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected.',
            },
          ],
        };
      }

      const { note_name } = args as any;
      
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        
        const backlinks: string[] = [];
        
        // Scan all markdown files in vault for links to the target note
        async function scanDirectory(dirPath: string) {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              await scanDirectory(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              const content = await fs.readFile(fullPath, 'utf-8');
              
              // Check for wiki-style links [[note_name]] or markdown links [text](note_name.md)
              const wikiLinks = content.match(/\[\[([^\]]+)\]\]/g) || [];
              const mdLinks = content.match(/\[([^\]]+)\]\(([^)]+)\.md\)/g) || [];
              
              const hasWikiLink = wikiLinks.some(link => 
                link.slice(2, -2).trim() === note_name
              );
              const hasMdLink = mdLinks.some(link => 
                link.includes(`(${note_name}.md)`)
              );
              
              if (hasWikiLink || hasMdLink) {
                const relativePath = path.relative(selectedVault, fullPath);
                backlinks.push(relativePath);
              }
            }
          }
        }
        
        await scanDirectory(selectedVault);
        
        return {
          content: [
            {
              type: 'text',
              text: `Backlinks for "${note_name}":\n\n${backlinks.length === 0 ? 'No backlinks found.' : backlinks.map(link => `- ${link}`).join('\n')}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error finding backlinks: ${error}`,
            },
          ],
        };
      }
    }

    case 'get_note_info': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected.',
            },
          ],
        };
      }

      const { note_path } = args as any;
      
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        
        const fullPath = path.join(selectedVault, note_path);
        const content = await fs.readFile(fullPath, 'utf-8');
        const stats = await fs.stat(fullPath);
        
        // Extract frontmatter
        let frontmatter = {};
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (frontmatterMatch) {
          try {
            const yaml = await import('js-yaml');
            frontmatter = yaml.load(frontmatterMatch[1]) as any;
          } catch {}
        }
        
        // Extract links
        const wikiLinks = content.match(/\[\[([^\]]+)\]\]/g) || [];
        const mdLinks = content.match(/\[([^\]]+)\]\(([^)]+)\.md\)/g) || [];
        
        // Extract tags
        const tags = content.match(/#[\w-]+/g) || [];
        
        // Count words
        const wordCount = content.replace(/---[\s\S]*?---/, '').trim().split(/\s+/).length;
        
        return {
          content: [
            {
              type: 'text',
              text: `Note Information: ${note_path}\n\n` +
                   `Created: ${stats.birthtime.toISOString()}\n` +
                   `Modified: ${stats.mtime.toISOString()}\n` +
                   `Size: ${stats.size} bytes\n` +
                   `Word Count: ${wordCount}\n` +
                   `Tags: ${tags.length === 0 ? 'None' : tags.join(', ')}\n` +
                   `Wiki Links: ${wikiLinks.length}\n` +
                   `Markdown Links: ${mdLinks.length}\n` +
                   `Frontmatter: ${Object.keys(frontmatter).length > 0 ? JSON.stringify(frontmatter, null, 2) : 'None'}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error getting note info: ${error}`,
            },
          ],
        };
      }
    }

    case 'create_folder': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected.',
            },
          ],
        };
      }

      const { folder_path, confirm = false } = args as any;
      
      // User confirmation required for folder creation
      if (!confirm) {
        const path = await import('path');
        const fs = await import('fs/promises');
        
        const fullFolderPath = path.join(selectedVault, folder_path);
        
        // Check if folder already exists
        let folderStatus = '';
        try {
          await fs.access(fullFolderPath);
          folderStatus = '⚠️ **フォルダが既に存在します**';
        } catch {
          folderStatus = '🆕 新規フォルダ';
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `📁 フォルダ作成の確認\n\n` +
                   `**作成するフォルダ:**\n` +
                   `- フォルダパス: ${folder_path}\n` +
                   `- 絶対パス: ${fullFolderPath}\n\n` +
                   `**フォルダ状態:**\n` +
                   `- ${folderStatus}\n\n` +
                   `本当にこのフォルダを作成しますか？\n\n` +
                   `✅ **作成する**: create_folder(folder_path: "${folder_path}", confirm: true)\n` +
                   `❌ **キャンセル**: 操作をキャンセルします`,
            },
          ],
        };
      }

      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        
        const fullFolderPath = path.join(selectedVault, folder_path);
        await fs.mkdir(fullFolderPath, { recursive: true });
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ Folder created successfully!\n\nPath: ${fullFolderPath}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error creating folder: ${error}`,
            },
          ],
        };
      }
    }

    // Vault Analytics Functions
    case 'analyze_vault_structure': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected.',
            },
          ],
        };
      }

      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        
        let totalFiles = 0;
        let totalFolders = 0;
        let totalSize = 0;
        const folderStats: { [key: string]: { files: number; size: number } } = {};
        
        async function analyzeDirectory(dirPath: string, relativePath: string = '') {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            const currentRelPath = relativePath ? path.join(relativePath, entry.name) : entry.name;
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              totalFolders++;
              folderStats[currentRelPath] = { files: 0, size: 0 };
              await analyzeDirectory(fullPath, currentRelPath);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              totalFiles++;
              const stats = await fs.stat(fullPath);
              totalSize += stats.size;
              
              const folderKey = relativePath || 'root';
              if (!folderStats[folderKey]) {
                folderStats[folderKey] = { files: 0, size: 0 };
              }
              folderStats[folderKey].files++;
              folderStats[folderKey].size += stats.size;
            }
          }
        }
        
        await analyzeDirectory(selectedVault);
        
        const folderReport = Object.entries(folderStats)
          .sort((a, b) => b[1].files - a[1].files)
          .map(([folder, stats]) => 
            `📁 ${folder}: ${stats.files} files (${(stats.size / 1024).toFixed(1)} KB)`
          ).join('\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `📊 Vault Structure Analysis\n\n` +
                   `**Overview:**\n` +
                   `- Total Notes: ${totalFiles}\n` +
                   `- Total Folders: ${totalFolders}\n` +
                   `- Total Size: ${(totalSize / 1024).toFixed(1)} KB\n\n` +
                   `**Folder Breakdown:**\n${folderReport}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error analyzing vault structure: ${error}`,
            },
          ],
        };
      }
    }

    case 'get_writing_stats': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected.',
            },
          ],
        };
      }

      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        
        let totalWords = 0;
        let totalChars = 0;
        let totalNotes = 0;
        const dailyStats: { [date: string]: { words: number; notes: number } } = {};
        
        async function analyzeWritingStats(dirPath: string) {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              await analyzeWritingStats(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              const content = await fs.readFile(fullPath, 'utf-8');
              const stats = await fs.stat(fullPath);
              
              // Remove frontmatter for word count
              const cleanContent = content.replace(/^---[\s\S]*?---/m, '').trim();
              const words = cleanContent.split(/\s+/).length;
              const chars = cleanContent.length;
              
              totalWords += words;
              totalChars += chars;
              totalNotes++;
              
              // Track daily stats by modification date
              const date = stats.mtime.toISOString().split('T')[0];
              if (!dailyStats[date]) {
                dailyStats[date] = { words: 0, notes: 0 };
              }
              dailyStats[date].words += words;
              dailyStats[date].notes++;
            }
          }
        }
        
        await analyzeWritingStats(selectedVault);
        
        const avgWordsPerNote = totalNotes > 0 ? Math.round(totalWords / totalNotes) : 0;
        const recentDays = Object.entries(dailyStats)
          .sort((a, b) => b[0].localeCompare(a[0]))
          .slice(0, 7)
          .map(([date, stats]) => 
            `${date}: ${stats.words} words (${stats.notes} notes)`
          ).join('\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `📝 Writing Statistics\n\n` +
                   `**Overall Stats:**\n` +
                   `- Total Notes: ${totalNotes}\n` +
                   `- Total Words: ${totalWords.toLocaleString()}\n` +
                   `- Total Characters: ${totalChars.toLocaleString()}\n` +
                   `- Average Words per Note: ${avgWordsPerNote}\n\n` +
                   `**Recent Activity (Last 7 Days):**\n${recentDays}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error getting writing stats: ${error}`,
            },
          ],
        };
      }
    }

    case 'find_orphan_notes': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected.',
            },
          ],
        };
      }

      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        
        const allNotes: string[] = [];
        const linkedNotes = new Set<string>();
        
        // First pass: collect all notes
        async function collectNotes(dirPath: string) {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              await collectNotes(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              const relativePath = path.relative(selectedVault, fullPath);
              allNotes.push(relativePath);
            }
          }
        }
        
        // Second pass: find all links
        async function findLinks(dirPath: string) {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              await findLinks(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              const content = await fs.readFile(fullPath, 'utf-8');
              
              // Find wiki-style links [[note_name]]
              const wikiLinks = content.match(/\[\[([^\]]+)\]\]/g) || [];
              wikiLinks.forEach(link => {
                const noteName = link.slice(2, -2).trim();
                // Try to match with actual files
                const matchingNote = allNotes.find(note => 
                  path.basename(note, '.md') === noteName || note === noteName
                );
                if (matchingNote) {
                  linkedNotes.add(matchingNote);
                }
              });
              
              // Find markdown links [text](file.md)
              const mdLinks = content.match(/\[([^\]]+)\]\(([^)]+)\.md\)/g) || [];
              mdLinks.forEach(link => {
                const match = link.match(/\[([^\]]+)\]\(([^)]+)\.md\)/);
                if (match) {
                  const linkedFile = match[2] + '.md';
                  const matchingNote = allNotes.find(note => note === linkedFile);
                  if (matchingNote) {
                    linkedNotes.add(matchingNote);
                  }
                }
              });
            }
          }
        }
        
        await collectNotes(selectedVault);
        await findLinks(selectedVault);
        
        const orphanNotes = allNotes.filter(note => !linkedNotes.has(note));
        
        return {
          content: [
            {
              type: 'text',
              text: `🔍 Orphan Notes Analysis\n\n` +
                   `**Summary:**\n` +
                   `- Total Notes: ${allNotes.length}\n` +
                   `- Linked Notes: ${linkedNotes.size}\n` +
                   `- Orphan Notes: ${orphanNotes.length}\n\n` +
                   `**Orphan Notes:**\n${orphanNotes.length === 0 ? 'No orphan notes found!' : orphanNotes.map(note => `- ${note}`).join('\n')}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error finding orphan notes: ${error}`,
            },
          ],
        };
      }
    }

    case 'get_link_graph': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected.',
            },
          ],
        };
      }

      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        
        const linkGraph: { [note: string]: string[] } = {};
        const allNotes: string[] = [];
        
        // First pass: collect all notes
        async function collectNotes(dirPath: string) {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              await collectNotes(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              const relativePath = path.relative(selectedVault, fullPath);
              allNotes.push(relativePath);
              linkGraph[relativePath] = [];
            }
          }
        }
        
        // Second pass: build link graph
        async function buildLinkGraph(dirPath: string) {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              await buildLinkGraph(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              const relativePath = path.relative(selectedVault, fullPath);
              const content = await fs.readFile(fullPath, 'utf-8');
              
              // Find all links from this note
              const wikiLinks = content.match(/\[\[([^\]]+)\]\]/g) || [];
              const mdLinks = content.match(/\[([^\]]+)\]\(([^)]+)\.md\)/g) || [];
              
              wikiLinks.forEach(link => {
                const noteName = link.slice(2, -2).trim();
                const matchingNote = allNotes.find(note => 
                  path.basename(note, '.md') === noteName || note === noteName
                );
                if (matchingNote && matchingNote !== relativePath) {
                  linkGraph[relativePath].push(matchingNote);
                }
              });
              
              mdLinks.forEach(link => {
                const match = link.match(/\[([^\]]+)\]\(([^)]+)\.md\)/);
                if (match) {
                  const linkedFile = match[2] + '.md';
                  const matchingNote = allNotes.find(note => note === linkedFile);
                  if (matchingNote && matchingNote !== relativePath) {
                    linkGraph[relativePath].push(matchingNote);
                  }
                }
              });
            }
          }
        }
        
        await collectNotes(selectedVault);
        await buildLinkGraph(selectedVault);
        
        // Calculate some graph metrics
        const totalLinks = Object.values(linkGraph).reduce((sum, links) => sum + links.length, 0);
        const avgLinksPerNote = allNotes.length > 0 ? (totalLinks / allNotes.length).toFixed(1) : '0';
        
        const topConnectedNotes = Object.entries(linkGraph)
          .filter(([_, links]) => links.length > 0)
          .sort((a, b) => b[1].length - a[1].length)
          .slice(0, 10)
          .map(([note, links]) => `${note}: ${links.length} links`)
          .join('\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `🕸️ Link Graph Analysis\n\n` +
                   `**Graph Metrics:**\n` +
                   `- Total Notes: ${allNotes.length}\n` +
                   `- Total Links: ${totalLinks}\n` +
                   `- Average Links per Note: ${avgLinksPerNote}\n\n` +
                   `**Most Connected Notes:**\n${topConnectedNotes || 'No connected notes found.'}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error generating link graph: ${error}`,
            },
          ],
        };
      }
    }

    // AI Analysis Functions
    case 'summarize_note': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected.',
            },
          ],
        };
      }

      const { note_path } = args as any;
      
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        
        const fullPath = path.join(selectedVault, note_path);
        const content = await fs.readFile(fullPath, 'utf-8');
        
        // Remove frontmatter for analysis
        const cleanContent = content.replace(/^---[\s\S]*?---/m, '').trim();
        
        if (!cleanContent) {
          return {
            content: [
              {
                type: 'text',
                text: 'Note is empty or contains only frontmatter.',
              },
            ],
          };
        }
        
        // Simple extractive summarization
        const sentences = cleanContent.split(/[.!?]+/).filter(s => s.trim().length > 20);
        const paragraphs = cleanContent.split(/\n\s*\n/).filter(p => p.trim().length > 0);
        
        // Extract headers
        const headers = cleanContent.match(/^#{1,6}\s+(.+)$/gm) || [];
        
        // Key statistics
        const wordCount = cleanContent.split(/\s+/).length;
        const charCount = cleanContent.length;
        
        // Simple keyword extraction
        const words = cleanContent.toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .split(/\s+/)
          .filter(word => word.length > 3 && !['that', 'this', 'with', 'from', 'they', 'have', 'will', 'been', 'were', 'said', 'each', 'which', 'their', 'time', 'more', 'very', 'when', 'come', 'here', 'just', 'like', 'long', 'make', 'many', 'over', 'such', 'take', 'than', 'them', 'well', 'what', 'where', 'year'].includes(word));
        
        const wordFreq: { [key: string]: number } = {};
        words.forEach(word => {
          wordFreq[word] = (wordFreq[word] || 0) + 1;
        });
        
        const topKeywords = Object.entries(wordFreq)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([word, freq]) => `${word} (${freq})`)
          .join(', ');
        
        // Extract first few sentences as summary
        const summary = sentences.slice(0, 3).join('. ') + '.';
        
        return {
          content: [
            {
              type: 'text',
              text: `📄 Note Summary: ${note_path}\n\n` +
                   `**Quick Summary:**\n${summary}\n\n` +
                   `**Statistics:**\n` +
                   `- Word Count: ${wordCount}\n` +
                   `- Character Count: ${charCount}\n` +
                   `- Paragraphs: ${paragraphs.length}\n` +
                   `- Headers: ${headers.length}\n\n` +
                   `**Structure:**\n${headers.length > 0 ? headers.map(h => `- ${h}`).join('\n') : 'No headers found'}\n\n` +
                   `**Top Keywords:**\n${topKeywords || 'No keywords found'}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error summarizing note: ${error}`,
            },
          ],
        };
      }
    }

    case 'generate_note_outline': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected.',
            },
          ],
        };
      }

      const { note_path } = args as any;
      
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        
        const fullPath = path.join(selectedVault, note_path);
        const content = await fs.readFile(fullPath, 'utf-8');
        
        // Remove frontmatter for analysis
        const cleanContent = content.replace(/^---[\s\S]*?---/m, '').trim();
        
        if (!cleanContent) {
          return {
            content: [
              {
                type: 'text',
                text: 'Note is empty or contains only frontmatter.',
              },
            ],
          };
        }
        
        // Extract existing headers with hierarchy
        const headerMatches = [...cleanContent.matchAll(/^(#{1,6})\s+(.+)$/gm)];
        const headers = headerMatches.map(match => ({
          level: match[1].length,
          text: match[2].trim(),
          line: content.substring(0, match.index).split('\n').length
        }));
        
        if (headers.length === 0) {
          // Generate outline from paragraphs if no headers exist
          const paragraphs = cleanContent.split(/\n\s*\n/).filter(p => p.trim().length > 0);
          const outline = paragraphs.slice(0, 10).map((para, index) => {
            const firstSentence = para.split(/[.!?]/)[0].trim();
            return `${index + 1}. ${firstSentence.length > 80 ? firstSentence.substring(0, 80) + '...' : firstSentence}`;
          }).join('\n');
          
          return {
            content: [
              {
                type: 'text',
                text: `📋 Generated Outline: ${note_path}\n\n` +
                     `**Auto-Generated from Content:**\n${outline}\n\n` +
                     `**Recommendation:** Consider adding headers to improve document structure.`,
              },
            ],
          };
        }
        
        // Create hierarchical outline from existing headers
        const outline = headers.map(header => {
          const indent = '  '.repeat(header.level - 1);
          return `${indent}- ${header.text} (Line ${header.line})`;
        }).join('\n');
        
        // Analyze outline structure
        const levelCounts = headers.reduce((acc, h) => {
          acc[h.level] = (acc[h.level] || 0) + 1;
          return acc;
        }, {} as { [level: number]: number });
        
        const structureAnalysis = Object.entries(levelCounts)
          .map(([level, count]) => `H${level}: ${count}`)
          .join(', ');
        
        return {
          content: [
            {
              type: 'text',
              text: `📋 Note Outline: ${note_path}\n\n` +
                   `**Document Structure:**\n${outline}\n\n` +
                   `**Header Analysis:**\n` +
                   `- Total Headers: ${headers.length}\n` +
                   `- Distribution: ${structureAnalysis}\n` +
                   `- Deepest Level: H${Math.max(...headers.map(h => h.level))}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error generating outline: ${error}`,
            },
          ],
        };
      }
    }

    case 'suggest_tags': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected.',
            },
          ],
        };
      }

      const { note_path } = args as any;
      
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        
        const fullPath = path.join(selectedVault, note_path);
        const content = await fs.readFile(fullPath, 'utf-8');
        
        // Extract existing tags
        const existingTags = content.match(/#[\w-]+/g) || [];
        const existingTagsSet = new Set(existingTags.map(tag => tag.slice(1)));
        
        // Remove frontmatter and existing tags for analysis
        const cleanContent = content
          .replace(/^---[\s\S]*?---/m, '')
          .replace(/#[\w-]+/g, '')
          .trim();
        
        if (!cleanContent) {
          return {
            content: [
              {
                type: 'text',
              text: `Existing tags: ${existingTags.join(', ') || 'None'}\n\nNote is empty or contains only frontmatter and tags.`,
            },
          ],
        };
      }
      
      // Extract potential tags from content
      const words = cleanContent.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && word.length < 20);
      
      // Count word frequency
      const wordFreq: { [key: string]: number } = {};
      words.forEach(word => {
        if (!['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who', 'boy', 'did', 'she', 'use', 'way', 'way', 'who', 'oil', 'sit', 'set', 'run', 'eat', 'far', 'sea', 'eye', 'ask', 'try'].includes(word)) {
          wordFreq[word] = (wordFreq[word] || 0) + 1;
        }
      });
      
      // Extract headers as potential tags
      const headers = cleanContent.match(/^#{1,6}\s+(.+)$/gm) || [];
      const headerWords = headers.flatMap(header => 
        header.replace(/^#+\s+/, '').toLowerCase().split(/\s+/)
      ).filter(word => word.length > 2);
      
      headerWords.forEach(word => {
        wordFreq[word] = (wordFreq[word] || 0) + 2; // Headers get extra weight
      });
      
      // Get top candidates
      const candidates = Object.entries(wordFreq)
        .filter(([word, freq]) => freq >= 2 && !existingTagsSet.has(word))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);
      
      // Categorize suggestions
      const topicWords = candidates.filter(([word]) => 
        ['project', 'work', 'study', 'research', 'meeting', 'plan', 'idea', 'note', 'draft', 'review'].some(topic => word.includes(topic))
      );
      
      const actionWords = candidates.filter(([word]) => 
        ['todo', 'task', 'action', 'follow', 'check', 'update', 'create', 'build', 'design', 'analyze'].some(action => word.includes(action))
      );
      
      const generalWords = candidates.filter(([word]) => 
        !topicWords.some(([tw]) => tw === word) && !actionWords.some(([aw]) => aw === word)
      );
      
      const suggestions = [
        ...topicWords.slice(0, 5),
        ...actionWords.slice(0, 3),
        ...generalWords.slice(0, 7)
      ].slice(0, 10);
      
      // Scan vault for similar tags
      let vaultTags: string[] = [];
      try {
        async function scanForTags(dirPath: string) {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          
          for (const entry of entries) {
            const entryPath = path.join(dirPath, entry.name);
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              await scanForTags(entryPath);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              const fileContent = await fs.readFile(entryPath, 'utf-8');
              const fileTags = fileContent.match(/#[\w-]+/g) || [];
              vaultTags.push(...fileTags.map(tag => tag.slice(1)));
            }
          }
        }
        
        await scanForTags(selectedVault);
        vaultTags = [...new Set(vaultTags)]; // Remove duplicates
      } catch (error) {
        // Continue without vault tags if scan fails
      }
      
      // Find similar existing tags
      const similarTags = suggestions.flatMap(([word]) =>
        vaultTags.filter(tag => 
          tag.includes(word) || word.includes(tag) || 
          (tag.length > 3 && word.length > 3 && 
           (tag.substring(0, 3) === word.substring(0, 3) || 
            tag.substring(-3) === word.substring(-3)))
        )
      ).slice(0, 5);
      
      return {
        content: [
          {
            type: 'text',
            text: `🏷️ Tag Suggestions for: ${note_path}\n\n` +
                 `**Current Tags:**\n${existingTags.join(', ') || 'None'}\n\n` +
                 `**Suggested New Tags:**\n${suggestions.map(([word, freq]) => `#${word} (${freq} occurrences)`).join('\n')}\n\n` +
                 `**Similar Existing Tags in Vault:**\n${similarTags.length > 0 ? similarTags.map(tag => `#${tag}`).join(', ') : 'None found'}\n\n` +
                 `**Total Tags in Vault:** ${vaultTags.length}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error suggesting tags: ${error}`,
          },
        ],
      };
    }
  }

    // Additional Book Search Functions
    case 'search_book_by_author': {
      if (!bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'Book Search plugin not available.',
            },
          ],
        };
      }

      const { author } = args as any;
      
      try {
        const results = await bookSearchPlugin.searchByAuthor(author);
        lastBookSearchResults = results;
        
        if (results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `📚 著者検索結果: "${author}"

該当する書籍が見つかりませんでした。

**検索のヒント:**
- 著者名の一部でも検索できます
- 英語名と日本語名の両方を試してみてください
- スペルを確認してください`,
              },
            ],
          };
        }

        const resultList = results.map((book, index) => 
          `**${index + 1}. ${book.title}** by ${book.author.join(', ')}\n` +
          `   出版年: ${book.publishedDate || 'N/A'}\n` +
          `   ${book.description ? book.description.substring(0, 150) + '...' : 'No description available'}\n`
        ).join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `📚 著者検索結果: "${author}" (${results.length}件)

${resultList}

**書籍ノート作成:**
create_book_note(option_number: X) でノートを作成できます`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ 著者検索でエラーが発生しました: ${error}`,
            },
          ],
        };
      }
    }

    case 'search_book_by_genre': {
      if (!bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'Book Search plugin not available.',
            },
          ],
        };
      }

      const { genre } = args as any;
      
      try {
        const results = await bookSearchPlugin.searchByGenre(genre);
        lastBookSearchResults = results;
        
        if (results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `📚 ジャンル検索結果: "${genre}"

該当する書籍が見つかりませんでした。

**人気のジャンル:**
- Fiction, Science Fiction, Mystery, Romance
- Biography, History, Science, Technology
- Business, Self-Help, Philosophy, Psychology`,
              },
            ],
          };
        }

        const resultList = results.map((book, index) => 
          `**${index + 1}. ${book.title}** by ${book.author.join(', ')}\n` +
          `   ジャンル: ${book.categories?.slice(0, 3).join(', ') || 'N/A'}\n` +
          `   出版年: ${book.publishedDate || 'N/A'}\n`
        ).join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `📚 ジャンル検索結果: "${genre}" (${results.length}件)

${resultList}

**書籍ノート作成:**
create_book_note(option_number: X) でノートを作成できます`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ ジャンル検索でエラーが発生しました: ${error}`,
            },
          ],
        };
      }
    }

    case 'get_book_recommendations': {
      if (!bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'Book Search plugin not available.',
            },
          ],
        };
      }

      const { seed_title, seed_author } = args as any;
      
      try {
        const results = await bookSearchPlugin.getBookRecommendations(seed_title, seed_author);
        lastBookSearchResults = results;
        
        if (results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `🎯 書籍推薦

推薦書籍が見つかりませんでした。

**推薦を得るためのヒント:**
- 好きな本のタイトルを指定してください
- 好きな著者名を指定してください
- 人気のある本や著者を試してみてください`,
              },
            ],
          };
        }

        const seedInfo = seed_title || seed_author ? 
          `基準: ${seed_title ? `"${seed_title}"` : ''} ${seed_author ? `by ${seed_author}` : ''}` :
          '人気書籍からの推薦';

        const recommendationList = results.map((book, index) => 
          `**${index + 1}. ${book.title}** by ${book.author.join(', ')}\n` +
          `   評価: ${book.rating ? `${book.rating}/5` : 'N/A'}\n` +
          `   ${book.description ? book.description.substring(0, 120) + '...' : 'No description'}\n`
        ).join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `🎯 書籍推薦 (${results.length}件)
${seedInfo}

${recommendationList}

**次のアクション:**
- create_book_note(option_number: X) でノート作成
- add_book_to_reading_list(option_number: X) で読書リストに追加`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ 書籍推薦でエラーが発生しました: ${error}`,
            },
          ],
        };
      }
    }

    case 'create_reading_list': {
      if (!selectedVault || !bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'ボールトが選択されていないか、Book Searchプラグインが利用できません。',
            },
          ],
        };
      }
      
      try {
        const readingList = await bookSearchPlugin.createReadingList();
        
        if (readingList.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `📖 読書リスト

読書リストが作成されました（現在は空です）。

**読書リストの使い方:**
1. 書籍を検索: search_book_by_title(), search_book_by_author()
2. リストに追加: add_book_to_reading_list(option_number: X)
3. 読書進捗を確認: get_reading_progress()

保存場所: Books/reading-list.json`,
              },
            ],
          };
        }

        const statusCounts = {
          'want-to-read': readingList.filter(item => item.status === 'want-to-read').length,
          'currently-reading': readingList.filter(item => item.status === 'currently-reading').length,
          'read': readingList.filter(item => item.status === 'read').length,
        };

        return {
          content: [
            {
              type: 'text',
              text: `📖 読書リスト (${readingList.length}冊)

**ステータス別:**
- 📚 読みたい本: ${statusCounts['want-to-read']}冊
- 📖 現在読書中: ${statusCounts['currently-reading']}冊  
- ✅ 読了: ${statusCounts['read']}冊

**詳細確認:**
- get_reading_progress() で詳細統計
- search_personal_library("キーワード") でライブラリ検索`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ 読書リストの作成に失敗しました: ${error}`,
            },
          ],
        };
      }
    }

    case 'add_book_to_reading_list': {
      if (!selectedVault || !bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'ボールトが選択されていないか、Book Searchプラグインが利用できません。',
            },
          ],
        };
      }

      const { book_data, option_number, status = 'want-to-read', priority = 'medium', reading_goal } = args as any;
      
      let book: BookMetadata;
      
      // Check if using option_number from last search
      if (option_number && !book_data) {
        if (lastBookSearchResults.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: '最近の検索結果がありません。まず書籍を検索してください。',
              },
            ],
          };
        }
        
        const index = option_number - 1;
        if (index < 0 || index >= lastBookSearchResults.length) {
          return {
            content: [
              {
                type: 'text',
                text: `無効な選択番号です。1から${lastBookSearchResults.length}までの番号を選択してください。`,
              },
            ],
          };
        }
        
        book = lastBookSearchResults[index];
      } else if (book_data) {
        book = book_data as BookMetadata;
      } else {
        return {
          content: [
            {
              type: 'text',
              text: 'book_dataまたは検索結果のoption_numberを指定してください。',
            },
          ],
        };
      }
      
      try {
        const addedItem = await bookSearchPlugin.addBookToReadingList(book, status, priority, reading_goal);
        
        const statusEmoji: {[key: string]: string} = {
          'want-to-read': '📚',
          'currently-reading': '📖',
          'read': '✅'
        };

        return {
          content: [
            {
              type: 'text',
              text: `${statusEmoji[status]} 読書リストに追加されました！

**書籍情報:**
- タイトル: ${book.title}
- 著者: ${book.author.join(', ')}
- ステータス: ${status}
- 優先度: ${priority}
${reading_goal ? `- 読書目標: ${reading_goal}` : ''}

**書籍ID:** ${addedItem.id}

**次のアクション:**
- get_reading_progress() で進捗確認
- mark_book_as_read("${addedItem.id}") で読了マーク`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ 読書リストへの追加に失敗しました: ${error}`,
            },
          ],
        };
      }
    }

    case 'mark_book_as_read': {
      if (!selectedVault || !bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'ボールトが選択されていないか、Book Searchプラグインが利用できません。',
            },
          ],
        };
      }

      const { book_id, personal_rating, personal_notes } = args as any;
      
      try {
        const success = await bookSearchPlugin.markBookAsRead(book_id, personal_rating, personal_notes);
        
        if (success) {
          return {
            content: [
              {
                type: 'text',
                text: `✅ 書籍を読了にマークしました！

**更新内容:**
- ステータス: 読了
- 読了日: ${new Date().toLocaleDateString('ja-JP')}
${personal_rating ? `- 評価: ${personal_rating}/5⭐` : ''}
${personal_notes ? `- メモ: ${personal_notes}` : ''}

**統計確認:**
get_reading_progress() で読書統計を確認できます`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: '指定された書籍IDが読書リストに見つかりませんでした。',
              },
            ],
          };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ 読了マークに失敗しました: ${error}`,
            },
          ],
        };
      }
    }

    case 'get_reading_progress': {
      if (!selectedVault || !bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'ボールトが選択されていないか、Book Searchプラグインが利用できません。',
            },
          ],
        };
      }
      
      try {
        const progress = await bookSearchPlugin.getReadingProgress();
        
        const currentlyReadingList = progress.currentlyReading.length > 0 ? 
          progress.currentlyReading.map(item => 
            `- ${item.book.title} by ${item.book.author.join(', ')}`
          ).join('\n') : '現在読んでいる本はありません';

        const monthlyStatsEntries = Object.entries(progress.readingStats.monthlyStats)
          .filter(([_, count]) => count > 0)
          .slice(-6);
        const monthlyStatsText = monthlyStatsEntries.length > 0 ?
          monthlyStatsEntries.map(([month, count]) => `  ${month}: ${count}冊`).join('\n') :
          '  今年の読書記録がありません';

        return {
          content: [
            {
              type: 'text',
              text: `📊 読書進捗統計

**📚 総合統計:**
- 総書籍数: ${progress.totalBooks}冊
- 読みたい本: ${progress.wantToRead}冊
- 現在読書中: ${progress.currentlyReading.length}冊
- 読了: ${progress.completedBooks.length}冊
- 今年読了: ${progress.completedThisYear}冊

**⭐ 評価統計:**
- 平均評価: ${progress.averageRating.toFixed(1)}/5
- 総読書ページ数: ${progress.readingStats.totalPages.toLocaleString()}ページ
- 1冊あたり平均: ${Math.round(progress.readingStats.averagePages)}ページ

**📖 現在読書中:**
${currentlyReadingList}

**📈 月別読書実績:**
${monthlyStatsText}

**詳細確認:**
- export_reading_data("markdown") で詳細レポート
- search_personal_library("キーワード") でライブラリ検索`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ 読書進捗の取得に失敗しました: ${error}`,
            },
          ],
        };
      }
    }

    case 'rate_book': {
      if (!selectedVault || !bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'ボールトが選択されていないか、Book Searchプラグインが利用できません。',
            },
          ],
        };
      }

      const { book_id, rating, notes } = args as any;
      
      try {
        const success = await bookSearchPlugin.rateBook(book_id, rating, notes);
        
        if (success) {
          const stars = '⭐'.repeat(rating);
          return {
            content: [
              {
                type: 'text',
                text: `⭐ 書籍評価を更新しました！

**評価:** ${rating}/5 ${stars}
${notes ? `**メモ:** ${notes}` : ''}

**統計確認:**
get_reading_progress() で評価統計を確認できます`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: '指定された書籍IDが読書リストに見つかりませんでした。',
              },
            ],
          };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ 書籍評価に失敗しました: ${error}`,
            },
          ],
        };
      }
    }

    case 'add_book_notes': {
      if (!selectedVault || !bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'ボールトが選択されていないか、Book Searchプラグインが利用できません。',
            },
          ],
        };
      }

      const { book_id, notes } = args as any;
      
      try {
        const success = await bookSearchPlugin.addBookNotes(book_id, notes);
        
        if (success) {
          return {
            content: [
              {
                type: 'text',
                text: `📝 書籍メモを更新しました！

**追加されたメモ:**
${notes}

**ライブラリ検索:**
search_personal_library("キーワード") でメモ内容も検索対象になります`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: '指定された書籍IDが読書リストに見つかりませんでした。',
              },
            ],
          };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ 書籍メモの追加に失敗しました: ${error}`,
            },
          ],
        };
      }
    }

    case 'search_personal_library': {
      if (!selectedVault || !bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'ボールトが選択されていないか、Book Searchプラグインが利用できません。',
            },
          ],
        };
      }

      const { query } = args as any;
      
      try {
        const results = await bookSearchPlugin.searchPersonalLibrary(query);
        
        if (results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `🔍 ライブラリ検索結果: "${query}"

該当する書籍が見つかりませんでした。

**検索対象:**
- 書籍タイトル
- 著者名  
- ジャンル・カテゴリ
- 個人メモ

**ヒント:**
- 部分的なキーワードでも検索できます
- create_reading_list() で読書リストを確認`,
              },
            ],
          };
        }

        const resultList = results.map((item, index) => {
          const statusEmoji = {
            'want-to-read': '📚',
            'currently-reading': '📖',
            'read': '✅'
          };
          
          return `${statusEmoji[item.status]} **${index + 1}. ${item.book.title}**
   著者: ${item.book.author.join(', ')}
   ステータス: ${item.status}
   ${item.personalRating ? `評価: ${item.personalRating}/5⭐` : ''}
   ${item.personalNotes ? `メモ: ${item.personalNotes.substring(0, 100)}...` : ''}
   ID: ${item.id}\n`;
        }).join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `🔍 ライブラリ検索結果: "${query}" (${results.length}件)

${resultList}

**操作:**
- rate_book("book_id", rating) で評価
- mark_book_as_read("book_id") で読了マーク
- add_book_notes("book_id", "メモ") でメモ追加`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ ライブラリ検索に失敗しました: ${error}`,
            },
          ],
        };
      }
    }

    case 'export_reading_data': {
      if (!selectedVault || !bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'ボールトが選択されていないか、Book Searchプラグインが利用できません。',
            },
          ],
        };
      }

      const { format = 'json' } = args as any;
      
      try {
        const exportedData = await bookSearchPlugin.exportReadingData(format);
        
        const formatInfo: {[key: string]: {name: string, ext: string, desc: string}} = {
          json: { name: 'JSON', ext: 'json', desc: '構造化データとして保存' },
          csv: { name: 'CSV', ext: 'csv', desc: 'Excel等で開ける表形式' },
          markdown: { name: 'Markdown', ext: 'md', desc: 'Obsidianで読める形式' }
        };

        const info = formatInfo[format];
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `reading-data-export-${timestamp}.${info.ext}`;

        return {
          content: [
            {
              type: 'text',
              text: `📤 読書データエクスポート完了

**形式:** ${info.name} (${info.desc})
**推奨ファイル名:** ${filename}

**エクスポートされたデータ:**
${format === 'markdown' ? exportedData : `データサイズ: ${exportedData.length}文字\n\n以下のデータをファイルに保存してください:\n\n${exportedData.substring(0, 500)}${exportedData.length > 500 ? '...\n\n[データが長いため省略されています]' : ''}`}

**他の形式での出力:**
- export_reading_data("json") - JSON形式
- export_reading_data("csv") - CSV形式  
- export_reading_data("markdown") - Markdown形式`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ 読書データのエクスポートに失敗しました: ${error}`,
            },
          ],
        };
      }
    }

    // Tasks Plugin Functions
    case 'create_task': {
      if (!selectedVault || !tasksPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected or Tasks plugin not initialized.',
            },
          ],
        };
      }

      const { description, priority, scheduled_date, start_date, due_date, tags, project, file_path } = args as any;
      
      try {
        const taskData: Partial<TaskMetadata> = {
          description: description || 'New Task',
          status: 'incomplete' as const,
          priority: priority as TaskMetadata['priority'],
          scheduledDate: scheduled_date,
          startDate: start_date,
          dueDate: due_date,
          tags: tags || [],
          project,
        };
        
        const createdTask = await tasksPlugin.createTask(taskData, file_path);
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ Task created successfully!\n\n` +
                   `**Task Details:**\n` +
                   `- Description: ${createdTask.description}\n` +
                   `- Status: ${createdTask.status}\n` +
                   `- Priority: ${createdTask.priority || 'None'}\n` +
                   `- Created: ${createdTask.createdDate || 'Today'}\n` +
                   `- Due Date: ${createdTask.dueDate || 'None'}\n` +
                   `- Tags: ${createdTask.tags?.join(', ') || 'None'}\n` +
                   `- File: ${createdTask.filePath || 'Tasks.md'}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error creating task: ${error}`,
            },
          ],
        };
      }
    }

    case 'list_tasks': {
      if (!selectedVault || !tasksPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected or Tasks plugin not initialized.',
            },
          ],
        };
      }

      const { status_filter, priority_filter, project_filter, tag_filter, due_after, due_before } = args as any;
      
      try {
        const filters: TaskFilters = {};
        if (status_filter) filters.status = Array.isArray(status_filter) ? status_filter : [status_filter];
        if (priority_filter) filters.priority = Array.isArray(priority_filter) ? priority_filter : [priority_filter];
        if (project_filter) filters.project = project_filter;
        if (tag_filter) filters.tag = Array.isArray(tag_filter) ? tag_filter : [tag_filter];
        if (due_after) filters.dueAfter = due_after;
        if (due_before) filters.dueBefore = due_before;
        
        const tasks = await tasksPlugin.listTasks(filters);
        
        if (tasks.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'タスクが見つかりませんでした。',
              },
            ],
          };
        }
        
        const taskList = tasks.map(task => {
          const statusIcon = task.status === 'complete' ? '✅' : 
                           task.status === 'cancelled' ? '❌' : 
                           task.status === 'in-progress' ? '🔄' : '⏸️';
          
          const priorityIcon = task.priority === 'highest' ? '🔺' : 
                             task.priority === 'high' ? '⏫' : 
                             task.priority === 'medium' ? '🔼' : 
                             task.priority === 'low' ? '🔽' : 
                             task.priority === 'lowest' ? '⏬' : '';
          
          return `${statusIcon} **${task.description}** ${priorityIcon}\n` +
                 `   📁 ${task.filePath || 'Unknown'}\n` +
                 `   ${task.dueDate ? `📅 Due: ${task.dueDate}` : ''}${task.project ? ` 📋 ${task.project}` : ''}\n` +
                 `   ${task.tags?.length ? `🏷️ ${task.tags.join(', ')}` : ''}`;
        }).join('\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `📋 タスク一覧 (${tasks.length}件)\n\n${taskList}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error listing tasks: ${error}`,
            },
          ],
        };
      }
    }

    case 'update_task_status': {
      if (!selectedVault || !tasksPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected or Tasks plugin not initialized.',
            },
          ],
        };
      }

      const { file_path, task_line, new_status } = args as any;
      
      try {
        const success = await tasksPlugin.updateTaskStatus(file_path, parseInt(task_line), new_status);
        
        if (success) {
          return {
            content: [
              {
                type: 'text',
                text: `✅ タスクステータスを更新しました！\n\n` +
                     `📁 File: ${file_path}\n` +
                     `📋 Line: ${task_line}\n` +
                     `🔄 Status: ${new_status}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: 'タスクステータスの更新に失敗しました。',
              },
            ],
          };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error updating task status: ${error}`,
            },
          ],
        };
      }
    }

    case 'get_task_stats': {
      if (!selectedVault || !tasksPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected or Tasks plugin not initialized.',
            },
          ],
        };
      }

      try {
        const stats = await tasksPlugin.getTaskStats();
        
        return {
          content: [
            {
              type: 'text',
              text: `📊 タスク統計\n\n` +
                   `**概要:**\n` +
                   `- 総タスク数: ${stats.total}\n` +
                   `- 未完了: ${stats.incomplete} (${stats.total > 0 ? Math.round(stats.incomplete / stats.total * 100) : 0}%)\n` +
                   `- 完了: ${stats.complete} (${stats.total > 0 ? Math.round(stats.complete / stats.total * 100) : 0}%)\n` +
                   `- キャンセル: ${stats.cancelled}\n\n` +
                   `**期限関連:**\n` +
                   `- 期限切れ: ${stats.overdue} ⚠️\n` +
                   `- 今日期限: ${stats.dueToday} 📅\n` +
                   `- 明日期限: ${stats.dueTomorrow} 📅`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error getting task stats: ${error}`,
            },
          ],
        };
      }
    }

    case 'get_overdue_tasks': {
      if (!selectedVault || !tasksPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected or Tasks plugin not initialized.',
            },
          ],
        };
      }

      try {
        const overdueTasks = await tasksPlugin.getOverdueTasks();
        
        if (overdueTasks.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: '🎉 期限切れタスクはありません！',
              },
            ],
          };
        }
        
        const taskList = overdueTasks.map(task => {
          const daysOverdue = task.dueDate ? 
            Math.floor((new Date().getTime() - new Date(task.dueDate).getTime()) / (1000 * 60 * 60 * 24)) : 0;
          
          const priorityIcon = task.priority === 'highest' ? '🔺' : 
                             task.priority === 'high' ? '⏫' : 
                             task.priority === 'medium' ? '🔼' : 
                             task.priority === 'low' ? '🔽' : 
                             task.priority === 'lowest' ? '⏬' : '';
          
          return `⚠️ **${task.description}** ${priorityIcon}\n` +
                 `   📅 Due: ${task.dueDate} (${daysOverdue}日経過)\n` +
                 `   📁 ${task.filePath || 'Unknown'}\n` +
                 `   ${task.project ? `📋 ${task.project}` : ''}${task.tags?.length ? ` 🏷️ ${task.tags.join(', ')}` : ''}`;
        }).join('\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `⚠️ 期限切れタスク (${overdueTasks.length}件)\n\n${taskList}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error getting overdue tasks: ${error}`,
            },
          ],
        };
      }
    }

    case 'get_tasks_by_project': {
      if (!selectedVault || !tasksPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected or Tasks plugin not initialized.',
            },
          ],
        };
      }

      try {
        const tasksByProject = await tasksPlugin.getTasksByProject();
        const projectNames = Object.keys(tasksByProject);
        
        if (projectNames.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'タスクが見つかりませんでした。',
              },
            ],
          };
        }
        
        let result = '📁 プロジェクト別タスク:\n\n';
        
        projectNames.forEach(project => {
          const tasks = tasksByProject[project];
          const completedCount = tasks.filter(t => t.status === 'complete').length;
          const totalCount = tasks.length;
          const completionRate = totalCount > 0 ? Math.round(completedCount / totalCount * 100) : 0;
          
          result += `## ${project} (${totalCount}件, ${completionRate}% 完了)\n`;
          
          tasks.forEach(task => {
            const statusIcon = task.status === 'complete' ? '✅' : 
                             task.status === 'cancelled' ? '❌' : 
                             task.status === 'in-progress' ? '🔄' : '⏸️';
            
            const priorityIcon = task.priority === 'highest' ? '🔺' : 
                               task.priority === 'high' ? '⏫' : 
                               task.priority === 'medium' ? '🔼' : 
                               task.priority === 'low' ? '🔽' : 
                               task.priority === 'lowest' ? '⏬' : '';
            
            result += `  ${statusIcon} ${task.description} ${priorityIcon}`;
            if (task.dueDate) result += ` 📅 ${task.dueDate}`;
            result += '\n';
          });
          result += '\n';
        });
        
        return {
          content: [
            {
              type: 'text',
              text: result.trim(),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error getting tasks by project: ${error}`,
            },
          ],
        };
      }
    }

    // Note Analysis Functions
    case 'get_note_statistics': {
      if (!selectedVault) {
        throw new Error('No vault selected');
      }
      
      const { path: notePath, title, folder = '' } = args as any;
      let targetPath: string;
      
      if (notePath) {
        targetPath = path.join(selectedVault, notePath);
      } else if (title) {
        const fileName = title.endsWith('.md') ? title : `${title}.md`;
        targetPath = path.join(selectedVault, folder, fileName);
      } else {
        throw new Error('Please provide either "path" or "title"');
      }
      
      const content = await fs.readFile(targetPath, 'utf-8');
      const { metadata, body } = parseFrontmatter(content);
      
      const words = body.split(/\s+/).filter(word => word.length > 0);
      const characters = body.length;
      const charactersNoSpaces = body.replace(/\s/g, '').length;
      const sentences = body.split(/[.!?]+/).filter(s => s.trim().length > 0);
      const paragraphs = body.split(/\n\s*\n/).filter(p => p.trim().length > 0);
      const readingTime = Math.ceil(words.length / 200); // 200 words per minute
      const headings = (body.match(/^#+\s+.+$/gm) || []).length;
      const links = (body.match(/\[\[([^\]]+)\]\]/g) || []).length;
      const tags = (body.match(/#[a-zA-Z0-9_-]+/g) || []).length;
      
      return {
        content: [
          {
            type: 'text',
            text: `# Note Statistics: ${path.basename(targetPath, '.md')}

## Basic Statistics
- **Word count**: ${words.length}
- **Character count**: ${characters}
- **Characters (no spaces)**: ${charactersNoSpaces}
- **Sentence count**: ${sentences.length}
- **Paragraph count**: ${paragraphs.length}
- **Reading time**: ${readingTime} minutes

## Structure
- **Headings**: ${headings}
- **Internal links**: ${links}
- **Tags**: ${tags}

## File Information
- **Path**: ${path.relative(selectedVault, targetPath)}
- **Size**: ${(content.length / 1024).toFixed(2)} KB
${Object.keys(metadata).length > 0 ? `- **Metadata fields**: ${Object.keys(metadata).length}` : ''}`,
          },
        ],
      };
    }

    case 'analyze_note_structure': {
      if (!selectedVault) {
        throw new Error('No vault selected');
      }
      
      const { path: notePath, title, folder = '' } = args as any;
      let targetPath: string;
      
      if (notePath) {
        targetPath = path.join(selectedVault, notePath);
      } else if (title) {
        const fileName = title.endsWith('.md') ? title : `${title}.md`;
        targetPath = path.join(selectedVault, folder, fileName);
      } else {
        throw new Error('Please provide either "path" or "title"');
      }
      
      const content = await fs.readFile(targetPath, 'utf-8');
      const { body } = parseFrontmatter(content);
      
      // Analyze headings hierarchy
      const headings = [];
      const headingMatches = body.matchAll(/^(#+)\s+(.+)$/gm);
      for (const match of headingMatches) {
        headings.push({
          level: match[1].length,
          text: match[2],
          line: content.substring(0, match.index).split('\n').length
        });
      }
      
      // Analyze links
      const internalLinks = [];
      const linkMatches = body.matchAll(/\[\[([^\]]+)\]\]/g);
      for (const match of linkMatches) {
        internalLinks.push(match[1]);
      }
      
      const externalLinks = [];
      const extLinkMatches = body.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
      for (const match of extLinkMatches) {
        externalLinks.push({ text: match[1], url: match[2] });
      }
      
      // Content distribution
      const lines = body.split('\n');
      const nonEmptyLines = lines.filter(line => line.trim().length > 0);
      const codeBlocks = (body.match(/```[\s\S]*?```/g) || []).length;
      const listItems = lines.filter(line => /^\s*[-*+]\s/.test(line)).length;
      
      return {
        content: [
          {
            type: 'text',
            text: `# Note Structure Analysis: ${path.basename(targetPath, '.md')}

## Heading Hierarchy
${headings.length > 0 ? headings.map(h => `${'  '.repeat(h.level - 1)}- Level ${h.level}: ${h.text} (Line ${h.line})`).join('\n') : 'No headings found'}

## Links Analysis
- **Internal links**: ${internalLinks.length} (${[...new Set(internalLinks)].length} unique)
- **External links**: ${externalLinks.length}

${internalLinks.length > 0 ? `### Internal Links:\n${[...new Set(internalLinks)].map(link => `- [[${link}]]`).join('\n')}` : ''}

${externalLinks.length > 0 ? `### External Links:\n${externalLinks.map(link => `- [${link.text}](${link.url})`).join('\n')}` : ''}

## Content Distribution
- **Total lines**: ${lines.length}
- **Non-empty lines**: ${nonEmptyLines.length} (${((nonEmptyLines.length / lines.length) * 100).toFixed(1)}%)
- **Code blocks**: ${codeBlocks}
- **List items**: ${listItems}

## Structural Health
- **Heading consistency**: ${headings.length > 0 ? 'Good' : 'No structure'}
- **Link density**: ${((internalLinks.length + externalLinks.length) / nonEmptyLines.length * 100).toFixed(1)} links per 100 lines`,
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start the server
async function main() {
  // サーバー起動時に保管庫選択状態をクリア（自動選択を防止）
  clearVaultSelection();
  console.error('ObsidianMCP Enhanced Server starting - vault selection cleared...');
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ObsidianMCP Enhanced Server running - ready for explicit vault selection');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});

export { server };
