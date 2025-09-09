export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4,
}

export class Logger {
  private context: string;
  private static level: LogLevel = LogLevel.INFO;

  constructor(context: string) {
    this.context = context;
  }

  static setLevel(level: string): void {
    const levelMap: Record<string, LogLevel> = {
      error: LogLevel.ERROR,
      warn: LogLevel.WARN,
      info: LogLevel.INFO,
      debug: LogLevel.DEBUG,
      trace: LogLevel.TRACE,
    };
    
    Logger.level = levelMap[level.toLowerCase()] || LogLevel.INFO;
  }

  error(message: string, error?: any): void {
    if (Logger.level >= LogLevel.ERROR) {
      console.error(`[ERROR] [${this.context}] ${message}`, error || '');
    }
  }

  warn(message: string, data?: any): void {
    if (Logger.level >= LogLevel.WARN) {
      console.warn(`[WARN] [${this.context}] ${message}`, data || '');
    }
  }

  info(message: string, data?: any): void {
    if (Logger.level >= LogLevel.INFO) {
      console.log(`[INFO] [${this.context}] ${message}`, data || '');
    }
  }

  debug(message: string, data?: any): void {
    if (Logger.level >= LogLevel.DEBUG) {
      console.log(`[DEBUG] [${this.context}] ${message}`, data || '');
    }
  }

  trace(message: string, data?: any): void {
    if (Logger.level >= LogLevel.TRACE) {
      console.log(`[TRACE] [${this.context}] ${message}`, data || '');
    }
  }
}