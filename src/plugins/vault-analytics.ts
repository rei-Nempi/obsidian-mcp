import * as fs from 'fs/promises';
import * as path from 'path';

export interface FolderStats {
  name: string;
  path: string;
  noteCount: number;
  subfolderCount: number;
  totalSize: number; // in bytes
  depth: number;
  subfolders: FolderStats[];
}

export interface WritingStats {
  totalNotes: number;
  totalWords: number;
  totalCharacters: number;
  averageWordsPerNote: number;
  averageCharactersPerNote: number;
  notesCreatedToday: number;
  notesCreatedThisWeek: number;
  notesCreatedThisMonth: number;
  mostActiveDay: string;
  writingFrequency: {
    date: string;
    noteCount: number;
    wordCount: number;
  }[];
  longestNote: {
    title: string;
    path: string;
    wordCount: number;
  } | null;
  shortestNote: {
    title: string;
    path: string;
    wordCount: number;
  } | null;
}

export interface OrphanNote {
  title: string;
  path: string;
  size: number;
  created: string;
  modified: string;
  hasOutgoingLinks: boolean;
  hasIncomingLinks: boolean;
}

export interface LinkGraphNode {
  id: string;
  title: string;
  path: string;
  type: 'note' | 'folder';
  size: number; // word count for notes, note count for folders
  tags: string[];
}

export interface LinkGraphEdge {
  source: string;
  target: string;
  weight: number; // number of links between nodes
  type: 'wikilink' | 'markdown' | 'tag';
}

export interface LinkGraph {
  nodes: LinkGraphNode[];
  edges: LinkGraphEdge[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    averageConnections: number;
    mostConnectedNote: {
      title: string;
      path: string;
      connections: number;
    } | null;
    clusters: {
      name: string;
      nodes: string[];
      centralNode: string;
    }[];
  };
}

export class VaultAnalyticsPlugin {
  private vaultPath: string;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
  }

  /**
   * Analyze vault folder structure
   */
  async analyzeVaultStructure(): Promise<FolderStats> {
    return await this.analyzeFolderRecursive(this.vaultPath, 0);
  }

  /**
   * Get comprehensive writing statistics
   */
  async getWritingStats(): Promise<WritingStats> {
    const notes = await this.getAllMarkdownFiles();
    const today = new Date().toISOString().split('T')[0];
    const thisWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const thisMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    let totalWords = 0;
    let totalCharacters = 0;
    let notesCreatedToday = 0;
    let notesCreatedThisWeek = 0;
    let notesCreatedThisMonth = 0;
    let longestNote: WritingStats['longestNote'] = null;
    let shortestNote: WritingStats['shortestNote'] = null;
    
    const dailyStats = new Map<string, { noteCount: number; wordCount: number }>();

    for (const notePath of notes) {
      try {
        const content = await fs.readFile(notePath, 'utf-8');
        const stats = await fs.stat(notePath);
        const createdDate = stats.birthtime.toISOString().split('T')[0];
        
        // Remove frontmatter for accurate word counting
        const bodyContent = this.extractBodyContent(content);
        const wordCount = this.countWords(bodyContent);
        const charCount = bodyContent.length;
        
        totalWords += wordCount;
        totalCharacters += charCount;
        
        // Track creation dates
        if (createdDate >= today) notesCreatedToday++;
        if (createdDate >= thisWeek) notesCreatedThisWeek++;
        if (createdDate >= thisMonth) notesCreatedThisMonth++;
        
        // Daily statistics
        const dayStats = dailyStats.get(createdDate) || { noteCount: 0, wordCount: 0 };
        dayStats.noteCount++;
        dayStats.wordCount += wordCount;
        dailyStats.set(createdDate, dayStats);
        
        // Track longest and shortest notes
        const noteTitle = path.basename(notePath, '.md');
        const relativePath = path.relative(this.vaultPath, notePath);
        
        if (!longestNote || wordCount > longestNote.wordCount) {
          longestNote = { title: noteTitle, path: relativePath, wordCount };
        }
        
        if (!shortestNote || wordCount < shortestNote.wordCount) {
          shortestNote = { title: noteTitle, path: relativePath, wordCount };
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }
    
    // Find most active day
    let mostActiveDay = '';
    let maxActivity = 0;
    dailyStats.forEach((stats, date) => {
      if (stats.noteCount > maxActivity) {
        maxActivity = stats.noteCount;
        mostActiveDay = date;
      }
    });
    
    // Create writing frequency array
    const writingFrequency = Array.from(dailyStats.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30); // Last 30 days
    
    return {
      totalNotes: notes.length,
      totalWords,
      totalCharacters,
      averageWordsPerNote: notes.length > 0 ? Math.round(totalWords / notes.length) : 0,
      averageCharactersPerNote: notes.length > 0 ? Math.round(totalCharacters / notes.length) : 0,
      notesCreatedToday,
      notesCreatedThisWeek,
      notesCreatedThisMonth,
      mostActiveDay,
      writingFrequency,
      longestNote,
      shortestNote,
    };
  }

  /**
   * Find orphan notes (notes with no incoming or outgoing links)
   */
  async findOrphanNotes(): Promise<OrphanNote[]> {
    const notes = await this.getAllMarkdownFiles();
    const linkMap = await this.buildLinkMap();
    const orphans: OrphanNote[] = [];

    for (const notePath of notes) {
      try {
        const relativePath = path.relative(this.vaultPath, notePath);
        const noteId = this.pathToId(relativePath);
        const stats = await fs.stat(notePath);
        
        const hasOutgoingLinks = linkMap.outgoing.has(noteId) && linkMap.outgoing.get(noteId)!.size > 0;
        const hasIncomingLinks = linkMap.incoming.has(noteId) && linkMap.incoming.get(noteId)!.size > 0;
        
        if (!hasOutgoingLinks && !hasIncomingLinks) {
          orphans.push({
            title: path.basename(notePath, '.md'),
            path: relativePath,
            size: stats.size,
            created: stats.birthtime.toISOString(),
            modified: stats.mtime.toISOString(),
            hasOutgoingLinks,
            hasIncomingLinks,
          });
        }
      } catch (error) {
        // Skip files that can't be accessed
      }
    }

    return orphans.sort((a, b) => b.size - a.size);
  }

  /**
   * Generate link graph data for visualization
   */
  async getLinkGraph(): Promise<LinkGraph> {
    const notes = await this.getAllMarkdownFiles();
    const linkMap = await this.buildLinkMap();
    const nodes: LinkGraphNode[] = [];
    const edges: LinkGraphEdge[] = [];
    const edgeMap = new Map<string, number>();

    // Create nodes
    for (const notePath of notes) {
      try {
        const relativePath = path.relative(this.vaultPath, notePath);
        const noteId = this.pathToId(relativePath);
        const content = await fs.readFile(notePath, 'utf-8');
        const bodyContent = this.extractBodyContent(content);
        const wordCount = this.countWords(bodyContent);
        const tags = this.extractTags(content);

        nodes.push({
          id: noteId,
          title: path.basename(notePath, '.md'),
          path: relativePath,
          type: 'note',
          size: wordCount,
          tags,
        });
      } catch (error) {
        // Skip files that can't be read
      }
    }

    // Create edges from outgoing links
    linkMap.outgoing.forEach((targets, sourceId) => {
      targets.forEach((targetId) => {
        const edgeKey = `${sourceId}->${targetId}`;
        const currentWeight = edgeMap.get(edgeKey) || 0;
        edgeMap.set(edgeKey, currentWeight + 1);
      });
    });

    // Convert edge map to edges array
    edgeMap.forEach((weight, edgeKey) => {
      const [source, target] = edgeKey.split('->');
      if (nodes.find(n => n.id === source) && nodes.find(n => n.id === target)) {
        edges.push({
          source,
          target,
          weight,
          type: 'wikilink', // Simplified for now
        });
      }
    });

    // Calculate statistics
    const connectionCounts = new Map<string, number>();
    edges.forEach(edge => {
      connectionCounts.set(edge.source, (connectionCounts.get(edge.source) || 0) + 1);
      connectionCounts.set(edge.target, (connectionCounts.get(edge.target) || 0) + 1);
    });

    let mostConnectedNote: LinkGraph['stats']['mostConnectedNote'] = null;
    let maxConnections = 0;
    connectionCounts.forEach((connections, nodeId) => {
      if (connections > maxConnections) {
        maxConnections = connections;
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
          mostConnectedNote = {
            title: node.title,
            path: node.path,
            connections,
          };
        }
      }
    });

    // Simple clustering based on shared tags
    const clusters = this.identifyClusters(nodes, edges);

    return {
      nodes,
      edges,
      stats: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        averageConnections: nodes.length > 0 ? edges.length * 2 / nodes.length : 0,
        mostConnectedNote,
        clusters,
      },
    };
  }

  // Private helper methods

  private async analyzeFolderRecursive(folderPath: string, depth: number): Promise<FolderStats> {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const stats: FolderStats = {
      name: path.basename(folderPath),
      path: path.relative(this.vaultPath, folderPath),
      noteCount: 0,
      subfolderCount: 0,
      totalSize: 0,
      depth,
      subfolders: [],
    };

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue; // Skip hidden files/folders

      const fullPath = path.join(folderPath, entry.name);

      if (entry.isDirectory()) {
        stats.subfolderCount++;
        const subfolder = await this.analyzeFolderRecursive(fullPath, depth + 1);
        stats.subfolders.push(subfolder);
        stats.noteCount += subfolder.noteCount;
        stats.totalSize += subfolder.totalSize;
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        stats.noteCount++;
        try {
          const fileStat = await fs.stat(fullPath);
          stats.totalSize += fileStat.size;
        } catch (error) {
          // Skip files that can't be accessed
        }
      }
    }

    return stats;
  }

  private async getAllMarkdownFiles(): Promise<string[]> {
    const files: string[] = [];
    
    async function scanDirectory(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.md')) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        // Skip directories that can't be accessed
      }
    }

    await scanDirectory(this.vaultPath);
    return files;
  }

  private extractBodyContent(content: string): string {
    // Remove frontmatter
    const frontmatterRegex = /^---\n[\s\S]*?\n---\n/;
    return content.replace(frontmatterRegex, '').trim();
  }

  private countWords(text: string): number {
    // Remove markdown syntax and count words
    const cleanText = text
      .replace(/!\[.*?\]\(.*?\)/g, '') // Images
      .replace(/\[.*?\]\(.*?\)/g, '') // Links
      .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
      .replace(/\*(.*?)\*/g, '$1') // Italic
      .replace(/`(.*?)`/g, '$1') // Inline code
      .replace(/```[\s\S]*?```/g, '') // Code blocks
      .replace(/#{1,6}\s/g, '') // Headers
      .replace(/^\s*[-*+]\s/gm, '') // Lists
      .replace(/^\s*\d+\.\s/gm, '') // Numbered lists
      .trim();

    if (!cleanText) return 0;
    return cleanText.split(/\s+/).length;
  }

  private extractTags(content: string): string[] {
    const tags: string[] = [];
    
    // Extract from frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const yamlContent = frontmatterMatch[1];
      const tagMatch = yamlContent.match(/tags:\s*\[(.*?)\]/);
      if (tagMatch) {
        const yamlTags = tagMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''));
        tags.push(...yamlTags);
      }
    }
    
    // Extract inline tags
    const inlineTagMatches = content.match(/#[\w-]+/g);
    if (inlineTagMatches) {
      const inlineTags = inlineTagMatches.map(tag => tag.substring(1));
      tags.push(...inlineTags);
    }
    
    return [...new Set(tags)]; // Remove duplicates
  }

  private async buildLinkMap(): Promise<{
    outgoing: Map<string, Set<string>>;
    incoming: Map<string, Set<string>>;
  }> {
    const outgoing = new Map<string, Set<string>>();
    const incoming = new Map<string, Set<string>>();
    const notes = await this.getAllMarkdownFiles();

    for (const notePath of notes) {
      try {
        const relativePath = path.relative(this.vaultPath, notePath);
        const sourceId = this.pathToId(relativePath);
        const content = await fs.readFile(notePath, 'utf-8');
        
        // Find all wiki-style links [[note]]
        const wikiLinkMatches = content.match(/\[\[([^\]]+)\]\]/g);
        if (wikiLinkMatches) {
          for (const match of wikiLinkMatches) {
            const linkText = match.slice(2, -2); // Remove [[ ]]
            const [noteName] = linkText.split('|'); // Handle aliases
            const targetId = this.pathToId(noteName.trim());
            
            if (!outgoing.has(sourceId)) outgoing.set(sourceId, new Set());
            if (!incoming.has(targetId)) incoming.set(targetId, new Set());
            
            outgoing.get(sourceId)!.add(targetId);
            incoming.get(targetId)!.add(sourceId);
          }
        }
        
        // Find markdown-style links [text](note.md)
        const markdownLinkMatches = content.match(/\[([^\]]+)\]\(([^)]+\.md)\)/g);
        if (markdownLinkMatches) {
          for (const match of markdownLinkMatches) {
            const linkMatch = match.match(/\[([^\]]+)\]\(([^)]+\.md)\)/);
            if (linkMatch) {
              const targetPath = linkMatch[2];
              const targetId = this.pathToId(targetPath);
              
              if (!outgoing.has(sourceId)) outgoing.set(sourceId, new Set());
              if (!incoming.has(targetId)) incoming.set(targetId, new Set());
              
              outgoing.get(sourceId)!.add(targetId);
              incoming.get(targetId)!.add(sourceId);
            }
          }
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }

    return { outgoing, incoming };
  }

  private pathToId(filePath: string): string {
    // Convert file path to a consistent ID
    return filePath.replace(/\.md$/, '').replace(/[\/\\]/g, '_');
  }

  private identifyClusters(nodes: LinkGraphNode[], edges: LinkGraphEdge[]): LinkGraph['stats']['clusters'] {
    // Simple clustering based on shared tags
    const tagClusters = new Map<string, Set<string>>();
    
    nodes.forEach(node => {
      node.tags.forEach(tag => {
        if (!tagClusters.has(tag)) tagClusters.set(tag, new Set());
        tagClusters.get(tag)!.add(node.id);
      });
    });

    const clusters: LinkGraph['stats']['clusters'] = [];
    tagClusters.forEach((nodeIds, tag) => {
      if (nodeIds.size >= 3) { // Only clusters with 3+ nodes
        const nodeArray = Array.from(nodeIds);
        // Find most connected node as central node
        let centralNode = nodeArray[0];
        let maxConnections = 0;
        
        nodeArray.forEach(nodeId => {
          const connections = edges.filter(e => e.source === nodeId || e.target === nodeId).length;
          if (connections > maxConnections) {
            maxConnections = connections;
            centralNode = nodeId;
          }
        });
        
        clusters.push({
          name: `#${tag}`,
          nodes: nodeArray,
          centralNode,
        });
      }
    });

    return clusters.sort((a, b) => b.nodes.length - a.nodes.length);
  }
}