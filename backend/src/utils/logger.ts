/**
 * Simple logging utility
 * Can be replaced with Winston or Pino in production
 */

enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG'
}

class Logger {
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private formatMessage(level: LogLevel, message: string): string {
    return `[${this.getTimestamp()}] [${level}] ${message}`;
  }

  /**
   * Log informational messages
   */
  info(message: string): void {
    console.log(this.formatMessage(LogLevel.INFO, message));
  }

  /**
   * Log warning messages
   */
  warn(message: string): void {
    console.warn(this.formatMessage(LogLevel.WARN, message));
  }

  /**
   * Log error messages
   */
  error(message: string): void {
    console.error(this.formatMessage(LogLevel.ERROR, message));
  }

  /**
   * Log debug messages (only in development)
   */
  debug(message: string): void {
    if (process.env.NODE_ENV === 'development') {
      console.debug(this.formatMessage(LogLevel.DEBUG, message));
    }
  }

  /**
   * Log with custom data object
   */
  logWithData(level: LogLevel, message: string, data: any): void {
    const formattedMessage = this.formatMessage(level, message);
    console.log(formattedMessage, data);
  }
}

// Export singleton instance
export const logger = new Logger();
