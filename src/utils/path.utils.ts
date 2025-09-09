import * as path from 'path';
import * as os from 'os';

export class PathUtils {
  static expandHome(filePath: string): string {
    if (filePath.startsWith('~/')) {
      return path.join(os.homedir(), filePath.slice(2));
    }
    return filePath;
  }

  static getRelativePath(from: string, to: string): string {
    return path.relative(from, to);
  }

  static ensureExtension(filePath: string, extension: string): string {
    if (!filePath.endsWith(extension)) {
      return filePath + extension;
    }
    return filePath;
  }

  static removeExtension(filePath: string): string {
    const ext = path.extname(filePath);
    if (ext) {
      return filePath.slice(0, -ext.length);
    }
    return filePath;
  }

  static sanitizeFileName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  static isAbsolute(filePath: string): boolean {
    return path.isAbsolute(this.expandHome(filePath));
  }

  static join(...paths: string[]): string {
    return path.join(...paths.map(p => this.expandHome(p)));
  }

  static dirname(filePath: string): string {
    return path.dirname(this.expandHome(filePath));
  }

  static basename(filePath: string, ext?: string): string {
    return path.basename(this.expandHome(filePath), ext);
  }

  static normalize(filePath: string): string {
    return path.normalize(this.expandHome(filePath));
  }

  static isMarkdownFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.md' || ext === '.markdown';
  }

  static getNoteName(filePath: string): string {
    const base = this.basename(filePath);
    return this.removeExtension(base);
  }
}