import { Note, FrontMatter, Tag, Link } from '../../types/obsidian.types';

export class NoteModel implements Note {
  path: string;
  title: string;
  content: string;
  metadata: FrontMatter;
  tags: Tag[];
  links: Link[];
  createdAt: Date;
  modifiedAt: Date;

  constructor(data: Partial<Note>) {
    this.path = data.path || '';
    this.title = data.title || '';
    this.content = data.content || '';
    this.metadata = data.metadata || {};
    this.tags = data.tags || [];
    this.links = data.links || [];
    this.createdAt = data.createdAt || new Date();
    this.modifiedAt = data.modifiedAt || new Date();
  }

  static fromMarkdown(path: string, content: string): NoteModel {
    const { metadata, body, tags, links } = this.parseMarkdown(content);
    const title = this.extractTitle(path, body);
    
    return new NoteModel({
      path,
      title,
      content: body,
      metadata,
      tags,
      links,
      createdAt: new Date(),
      modifiedAt: new Date(),
    });
  }

  private static parseMarkdown(content: string): {
    metadata: FrontMatter;
    body: string;
    tags: Tag[];
    links: Link[];
  } {
    let metadata: FrontMatter = {};
    let body = content;
    
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    if (frontmatterMatch) {
      metadata = this.parseFrontMatter(frontmatterMatch[1]);
      body = content.slice(frontmatterMatch[0].length);
    }
    
    const tags = this.extractTags(body);
    const links = this.extractLinks(body);
    
    return { metadata, body, tags, links };
  }

  private static parseFrontMatter(yaml: string): FrontMatter {
    const metadata: FrontMatter = {};
    const lines = yaml.split('\n');
    
    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.*)$/);
      if (match) {
        const [, key, value] = match;
        metadata[key] = this.parseYamlValue(value);
      }
    }
    
    return metadata;
  }

  private static parseYamlValue(value: string): any {
    if (value.startsWith('[') && value.endsWith(']')) {
      return value.slice(1, -1).split(',').map(v => v.trim());
    }
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
    return value;
  }

  private static extractTags(content: string): Tag[] {
    const tagPattern = /#(\S+)/g;
    const tags: Tag[] = [];
    const tagCounts = new Map<string, number>();
    
    let match;
    while ((match = tagPattern.exec(content)) !== null) {
      const tagName = match[1];
      tagCounts.set(tagName, (tagCounts.get(tagName) || 0) + 1);
    }
    
    for (const [name, count] of tagCounts) {
      tags.push({
        name,
        count,
        nested: name.includes('/'),
        parent: name.includes('/') ? name.split('/')[0] : undefined,
      });
    }
    
    return tags;
  }

  private static extractLinks(content: string): Link[] {
    const links: Link[] = [];
    const wikiLinkPattern = /\[\[([^\]]+)\]\]/g;
    const mdLinkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
    
    let match;
    while ((match = wikiLinkPattern.exec(content)) !== null) {
      links.push({
        type: 'wiki',
        target: match[1],
        display: match[1].split('|')[0],
      });
    }
    
    while ((match = mdLinkPattern.exec(content)) !== null) {
      links.push({
        type: 'markdown',
        target: match[2],
        display: match[1],
      });
    }
    
    return links;
  }

  private static extractTitle(path: string, content: string): string {
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match) {
      return h1Match[1];
    }
    
    const filename = path.split('/').pop() || '';
    return filename.replace('.md', '');
  }

  toMarkdown(): string {
    let markdown = '';
    
    if (Object.keys(this.metadata).length > 0) {
      markdown += '---\n';
      for (const [key, value] of Object.entries(this.metadata)) {
        markdown += `${key}: ${this.formatYamlValue(value)}\n`;
      }
      markdown += '---\n\n';
    }
    
    markdown += this.content;
    
    return markdown;
  }

  private formatYamlValue(value: any): string {
    if (Array.isArray(value)) {
      return `[${value.join(', ')}]`;
    }
    return String(value);
  }
}