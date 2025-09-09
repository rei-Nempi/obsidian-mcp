export class Validator {
  static validateNoteTitle(title: string): void {
    if (!title || title.trim() === '') {
      throw new ValidationError('Note title cannot be empty');
    }
    
    const invalidChars = /[<>:"/\\|?*]/g;
    if (invalidChars.test(title)) {
      throw new ValidationError(`Invalid characters in title: ${title}`);
    }
    
    if (title.length > 255) {
      throw new ValidationError('Title too long (max 255 characters)');
    }
    
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1'];
    const upperTitle = title.toUpperCase();
    if (reservedNames.includes(upperTitle)) {
      throw new ValidationError(`Reserved filename: ${title}`);
    }
  }

  static sanitizeContent(content: string): string {
    return content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .trim();
  }

  static validatePath(path: string, vaultPath: string): void {
    const normalizedPath = this.normalizePath(path);
    const normalizedVault = this.normalizePath(vaultPath);
    
    if (!normalizedPath.startsWith(normalizedVault)) {
      throw new SecurityError('Path is outside vault boundary');
    }
    
    if (normalizedPath.includes('..')) {
      throw new SecurityError('Path traversal detected');
    }
  }

  static normalizePath(path: string): string {
    return path.replace(/\\/g, '/').replace(/\/+/g, '/');
  }

  static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static isValidTag(tag: string): boolean {
    if (!tag || tag.trim() === '') {
      return false;
    }
    
    const validTagRegex = /^#?[a-zA-Z0-9_\-\/]+$/;
    return validTagRegex.test(tag);
  }

  static normalizeTag(tag: string): string {
    let normalized = tag.trim();
    
    if (!normalized.startsWith('#')) {
      normalized = '#' + normalized;
    }
    
    normalized = normalized.replace(/\s+/g, '-');
    normalized = normalized.toLowerCase();
    
    return normalized;
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}