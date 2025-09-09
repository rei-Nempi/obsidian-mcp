export interface Note {
  path: string;
  title: string;
  content: string;
  metadata: FrontMatter;
  tags: Tag[];
  links: Link[];
  createdAt: Date;
  modifiedAt: Date;
}

export interface FrontMatter {
  [key: string]: any;
}

export interface Tag {
  name: string;
  count: number;
  nested: boolean;
  parent?: string;
}

export interface Link {
  type: 'wiki' | 'markdown';
  target: string;
  display: string;
}

export interface Vault {
  path: string;
  name: string;
  config: VaultConfig;
  stats: VaultStats;
}

export interface VaultConfig {
  dailyNotes: {
    enabled: boolean;
    folder: string;
    format: string;
    template: string;
  };
  templates: {
    folder: string;
    defaultTags: string[];
  };
  defaultFolder?: string;
  fileExtensions?: string[];
  excludeFolders?: string[];
}

export interface VaultStats {
  totalNotes: number;
  totalTags: number;
  totalLinks: number;
  totalFolders: number;
  lastModified: Date;
}

export interface CreateNoteParams {
  title: string;
  content: string;
  folder?: string;
  tags?: string[];
  metadata?: FrontMatter;
}

export type UpdateMode = 'replace' | 'append';

export interface ListOptions {
  recursive?: boolean;
  tags?: string[];
  afterDate?: Date;
  beforeDate?: Date;
  sortBy?: 'title' | 'modified' | 'created';
  sortOrder?: 'asc' | 'desc';
}

export interface SearchOptions {
  caseSensitive?: boolean;
  regex?: boolean;
  wholeWord?: boolean;
  includeContent?: boolean;
  includeTags?: boolean;
  includeTitle?: boolean;
}

export interface SearchResult {
  note: Note;
  matches: string[];
  score: number;
}

export interface TagStats {
  totalTags: number;
  tags: Array<{
    name: string;
    count: number;
    nested: boolean;
  }>;
}

export interface AppConfig {
  version: string;
  vaults: {
    primary: {
      path: string;
      name: string;
      dailyNotes: {
        enabled: boolean;
        folder: string;
        format: string;
        template: string;
      };
      templates: {
        folder: string;
        defaultTags: string[];
      };
    };
    [key: string]: any;
  };
  plugins?: {
    [key: string]: {
      enabled: boolean;
      [key: string]: any;
    };
  };
  preferences?: {
    autoIndex?: boolean;
    cacheEnabled?: boolean;
    cacheTTL?: number;
    logLevel?: string;
    maxFileSize?: number;
  };
}