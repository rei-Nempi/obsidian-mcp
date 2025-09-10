import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Kanban card interface
 */
export interface KanbanCard {
  id: string;
  title: string;
  content?: string;
  metadata?: {
    [key: string]: any;
  };
  createdDate?: string;
  assignee?: string;
  tags?: string[];
  dueDate?: string;
  checkItems?: Array<{
    id: string;
    text: string;
    checked: boolean;
  }>;
}

/**
 * Kanban lane (column) interface
 */
export interface KanbanLane {
  id: string;
  title: string;
  cards: KanbanCard[];
  collapsed?: boolean;
  color?: string;
  sorted?: boolean;
}

/**
 * Kanban board interface
 */
export interface KanbanBoard {
  lanes: KanbanLane[];
  settings?: {
    'lane-width': number;
    'hide-tags': boolean;
    'hide-dates': boolean;
    'show-checkboxes': boolean;
    'show-card-count': boolean;
    'tag-colors': { [tag: string]: string };
    'date-colors': { [date: string]: string };
  };
  archive?: KanbanCard[];
}

/**
 * Card creation data interface
 */
export interface CardCreateData {
  title: string;
  content?: string;
  assignee?: string;
  tags?: string[];
  dueDate?: string;
  checkItems?: string[];
}

/**
 * Plugin for Obsidian Kanban integration
 * Works with the Kanban plugin format for board management
 */
export class KanbanPlugin {
  private vaultPath: string;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
  }

  /**
   * Create a new Kanban board
   */
  async createKanbanBoard(
    boardName: string,
    laneNames: string[] = ['To Do', 'Doing', 'Done'],
    filePath?: string
  ): Promise<string> {
    const targetPath = filePath || path.join(this.vaultPath, `${boardName}.md`);
    
    // Create initial lanes with unique IDs
    const lanes: KanbanLane[] = laneNames.map((name, index) => ({
      id: this.generateId(),
      title: name,
      cards: [],
      collapsed: false,
    }));

    const board: KanbanBoard = {
      lanes,
      settings: {
        'lane-width': 272,
        'hide-tags': false,
        'hide-dates': false,
        'show-checkboxes': false,
        'show-card-count': false,
        'tag-colors': {},
        'date-colors': {},
      },
      archive: [],
    };

    const content = this.serializeBoard(board);

    try {
      await fs.writeFile(targetPath, content);
      return targetPath;
    } catch (error) {
      throw new Error(`Failed to create Kanban board: ${error}`);
    }
  }

  /**
   * Add a card to a Kanban board
   */
  async addKanbanCard(
    boardPath: string,
    laneTitle: string,
    cardData: CardCreateData
  ): Promise<KanbanCard> {
    try {
      const board = await this.loadBoard(boardPath);
      const lane = board.lanes.find(l => l.title === laneTitle);
      
      if (!lane) {
        throw new Error(`Lane "${laneTitle}" not found`);
      }

      const card: KanbanCard = {
        id: this.generateId(),
        title: cardData.title,
        content: cardData.content,
        createdDate: new Date().toISOString().split('T')[0],
        assignee: cardData.assignee,
        tags: cardData.tags || [],
        dueDate: cardData.dueDate,
        checkItems: cardData.checkItems?.map(text => ({
          id: this.generateId(),
          text,
          checked: false,
        })) || [],
      };

      lane.cards.push(card);
      await this.saveBoard(boardPath, board);
      
      return card;
    } catch (error) {
      throw new Error(`Failed to add card: ${error}`);
    }
  }

  /**
   * Move a card between lanes
   */
  async moveKanbanCard(
    boardPath: string,
    cardId: string,
    targetLaneTitle: string,
    position?: number
  ): Promise<boolean> {
    try {
      const board = await this.loadBoard(boardPath);
      
      // Find the card and its current lane
      let card: KanbanCard | undefined;
      let sourceLane: KanbanLane | undefined;
      
      for (const lane of board.lanes) {
        const cardIndex = lane.cards.findIndex(c => c.id === cardId);
        if (cardIndex !== -1) {
          card = lane.cards[cardIndex];
          sourceLane = lane;
          lane.cards.splice(cardIndex, 1);
          break;
        }
      }
      
      if (!card || !sourceLane) {
        throw new Error(`Card with ID "${cardId}" not found`);
      }
      
      // Find target lane
      const targetLane = board.lanes.find(l => l.title === targetLaneTitle);
      if (!targetLane) {
        throw new Error(`Target lane "${targetLaneTitle}" not found`);
      }
      
      // Insert card at specified position or at the end
      if (position !== undefined && position >= 0 && position <= targetLane.cards.length) {
        targetLane.cards.splice(position, 0, card);
      } else {
        targetLane.cards.push(card);
      }
      
      await this.saveBoard(boardPath, board);
      return true;
    } catch (error) {
      throw new Error(`Failed to move card: ${error}`);
    }
  }

  /**
   * Update a Kanban card
   */
  async updateKanbanCard(
    boardPath: string,
    cardId: string,
    updates: Partial<CardCreateData>
  ): Promise<boolean> {
    try {
      const board = await this.loadBoard(boardPath);
      
      // Find the card
      let card: KanbanCard | undefined;
      for (const lane of board.lanes) {
        card = lane.cards.find(c => c.id === cardId);
        if (card) break;
      }
      
      if (!card) {
        throw new Error(`Card with ID "${cardId}" not found`);
      }
      
      // Update card properties
      if (updates.title !== undefined) card.title = updates.title;
      if (updates.content !== undefined) card.content = updates.content;
      if (updates.assignee !== undefined) card.assignee = updates.assignee;
      if (updates.tags !== undefined) card.tags = updates.tags;
      if (updates.dueDate !== undefined) card.dueDate = updates.dueDate;
      if (updates.checkItems !== undefined) {
        card.checkItems = updates.checkItems.map(text => ({
          id: this.generateId(),
          text,
          checked: false,
        }));
      }
      
      await this.saveBoard(boardPath, board);
      return true;
    } catch (error) {
      throw new Error(`Failed to update card: ${error}`);
    }
  }

  /**
   * List all Kanban boards in the vault
   */
  async listKanbanBoards(): Promise<Array<{ name: string; path: string; laneCount: number; cardCount: number }>> {
    const boards: Array<{ name: string; path: string; laneCount: number; cardCount: number }> = [];
    
    try {
      await this.scanDirectoryForBoards(this.vaultPath, boards);
      return boards.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      throw new Error(`Failed to list Kanban boards: ${error}`);
    }
  }

  /**
   * Get a specific Kanban board with all its data
   */
  async getKanbanBoard(boardPath: string): Promise<{
    board: KanbanBoard;
    name: string;
    path: string;
    stats: {
      totalCards: number;
      cardsByLane: { [laneTitle: string]: number };
      archivedCards: number;
    };
  }> {
    try {
      const board = await this.loadBoard(boardPath);
      const name = path.basename(boardPath, '.md');
      
      const stats = {
        totalCards: board.lanes.reduce((sum, lane) => sum + lane.cards.length, 0),
        cardsByLane: board.lanes.reduce((acc, lane) => {
          acc[lane.title] = lane.cards.length;
          return acc;
        }, {} as { [laneTitle: string]: number }),
        archivedCards: board.archive?.length || 0,
      };
      
      return { board, name, path: boardPath, stats };
    } catch (error) {
      throw new Error(`Failed to get Kanban board: ${error}`);
    }
  }

  /**
   * Delete a card from a Kanban board
   */
  async deleteKanbanCard(boardPath: string, cardId: string): Promise<boolean> {
    try {
      const board = await this.loadBoard(boardPath);
      
      // Find and remove the card
      for (const lane of board.lanes) {
        const cardIndex = lane.cards.findIndex(c => c.id === cardId);
        if (cardIndex !== -1) {
          lane.cards.splice(cardIndex, 1);
          await this.saveBoard(boardPath, board);
          return true;
        }
      }
      
      throw new Error(`Card with ID "${cardId}" not found`);
    } catch (error) {
      throw new Error(`Failed to delete card: ${error}`);
    }
  }

  /**
   * Archive a card (move to archive)
   */
  async archiveKanbanCard(boardPath: string, cardId: string): Promise<boolean> {
    try {
      const board = await this.loadBoard(boardPath);
      
      // Find and remove the card from lanes
      let card: KanbanCard | undefined;
      for (const lane of board.lanes) {
        const cardIndex = lane.cards.findIndex(c => c.id === cardId);
        if (cardIndex !== -1) {
          card = lane.cards.splice(cardIndex, 1)[0];
          break;
        }
      }
      
      if (!card) {
        throw new Error(`Card with ID "${cardId}" not found`);
      }
      
      // Add to archive
      if (!board.archive) board.archive = [];
      board.archive.push(card);
      
      await this.saveBoard(boardPath, board);
      return true;
    } catch (error) {
      throw new Error(`Failed to archive card: ${error}`);
    }
  }

  /**
   * Load a Kanban board from file
   */
  private async loadBoard(boardPath: string): Promise<KanbanBoard> {
    try {
      const content = await fs.readFile(boardPath, 'utf-8');
      return this.parseBoard(content);
    } catch (error) {
      throw new Error(`Failed to load board from ${boardPath}: ${error}`);
    }
  }

  /**
   * Save a Kanban board to file
   */
  private async saveBoard(boardPath: string, board: KanbanBoard): Promise<void> {
    try {
      const content = this.serializeBoard(board);
      await fs.writeFile(boardPath, content);
    } catch (error) {
      throw new Error(`Failed to save board to ${boardPath}: ${error}`);
    }
  }

  /**
   * Parse Kanban board from markdown content
   */
  private parseBoard(content: string): KanbanBoard {
    try {
      // Look for Kanban data in the markdown
      const kanbanDataMatch = content.match(/```kanban-plugin-data\n([\s\S]*?)\n```/);
      
      if (kanbanDataMatch) {
        return JSON.parse(kanbanDataMatch[1]);
      }
      
      // If no JSON data found, create a basic board structure
      return {
        lanes: [
          { id: this.generateId(), title: 'To Do', cards: [] },
          { id: this.generateId(), title: 'Doing', cards: [] },
          { id: this.generateId(), title: 'Done', cards: [] },
        ],
        settings: {
          'lane-width': 272,
          'hide-tags': false,
          'hide-dates': false,
          'show-checkboxes': false,
          'show-card-count': false,
          'tag-colors': {},
          'date-colors': {},
        },
        archive: [],
      };
    } catch (error) {
      throw new Error(`Failed to parse board data: ${error}`);
    }
  }

  /**
   * Serialize Kanban board to markdown content
   */
  private serializeBoard(board: KanbanBoard): string {
    const jsonData = JSON.stringify(board, null, 2);
    
    return `---\nkanban-plugin: basic\n---\n\n# Kanban Board\n\n\`\`\`kanban-plugin-data\n${jsonData}\n\`\`\`\n`;
  }

  /**
   * Generate a unique ID for cards and lanes
   */
  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  /**
   * Recursively scan directory for Kanban boards
   */
  private async scanDirectoryForBoards(
    dirPath: string,
    boards: Array<{ name: string; path: string; laneCount: number; cardCount: number }>
  ): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await this.scanDirectoryForBoards(fullPath, boards);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          await this.checkIfKanbanBoard(fullPath, boards);
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }
  }

  /**
   * Check if a markdown file is a Kanban board
   */
  private async checkIfKanbanBoard(
    filePath: string,
    boards: Array<{ name: string; path: string; laneCount: number; cardCount: number }>
  ): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Check if file contains Kanban plugin data or frontmatter
      if (content.includes('kanban-plugin') || content.includes('```kanban-plugin-data')) {
        const board = this.parseBoard(content);
        const name = path.basename(filePath, '.md');
        const laneCount = board.lanes.length;
        const cardCount = board.lanes.reduce((sum, lane) => sum + lane.cards.length, 0);
        
        boards.push({ name, path: filePath, laneCount, cardCount });
      }
    } catch (error) {
      // Skip files that can't be read
    }
  }
}