import { Tag } from '../../types/obsidian.types';

export class TagModel implements Tag {
  name: string;
  count: number;
  nested: boolean;
  parent?: string;
  children?: TagModel[];

  constructor(data: Partial<Tag>) {
    this.name = data.name || '';
    this.count = data.count || 0;
    this.nested = data.nested || false;
    this.parent = data.parent;
    this.children = [];
  }

  static fromString(tagString: string): TagModel {
    const parts = tagString.replace(/^#/, '').split('/');
    const isNested = parts.length > 1;
    
    return new TagModel({
      name: tagString,
      count: 1,
      nested: isNested,
      parent: isNested ? parts.slice(0, -1).join('/') : undefined,
    });
  }

  isChildOf(parentTag: string): boolean {
    return this.nested && this.name.startsWith(`${parentTag}/`);
  }

  getLevel(): number {
    if (!this.nested) return 0;
    return this.name.split('/').length - 1;
  }

  getLeafName(): string {
    if (!this.nested) return this.name;
    const parts = this.name.split('/');
    return parts[parts.length - 1];
  }

  addChild(child: TagModel): void {
    if (!this.children) {
      this.children = [];
    }
    if (child.isChildOf(this.name)) {
      this.children.push(child);
    }
  }

  toHierarchy(tags: TagModel[]): TagModel {
    const children = tags.filter(tag => tag.isChildOf(this.name));
    
    for (const child of children) {
      const directChild = child.parent === this.name;
      if (directChild) {
        this.addChild(child.toHierarchy(tags));
      }
    }
    
    return this;
  }
}