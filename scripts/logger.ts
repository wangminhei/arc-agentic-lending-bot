/**
 * logger.ts
 * Logger đơn giản với timestamp và prefix
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const COLORS = {
  debug: "\x1b[36m",  // cyan
  info:  "\x1b[32m",  // green
  warn:  "\x1b[33m",  // yellow
  error: "\x1b[31m",  // red
  reset: "\x1b[0m",
  dim:   "\x1b[2m",
  bold:  "\x1b[1m",
};

export class Logger {
  private prefix: string;
  private minLevel: LogLevel;

  constructor(prefix: string, level?: LogLevel) {
    this.prefix = prefix;
    this.minLevel = (process.env.LOG_LEVEL as LogLevel) || level || "info";
  }

  private log(level: LogLevel, message: string): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;

    const ts = new Date().toISOString().replace("T", " ").substring(0, 19);
    const color = COLORS[level];
    const label = level.toUpperCase().padEnd(5);

    console.log(
      `${COLORS.dim}[${ts}]${COLORS.reset} ${color}${label}${COLORS.reset} ${COLORS.dim}[${this.prefix}]${COLORS.reset} ${message}`
    );
  }

  debug(msg: string) { this.log("debug", msg); }
  info(msg: string)  { this.log("info", msg); }
  warn(msg: string)  { this.log("warn", msg); }
  error(msg: string) { this.log("error", msg); }

  section(title: string): void {
    const line = "─".repeat(50);
    console.log(`\n${COLORS.bold}${line}${COLORS.reset}`);
    console.log(`${COLORS.bold}  ${title}${COLORS.reset}`);
    console.log(`${COLORS.bold}${line}${COLORS.reset}`);
  }

  success(msg: string): void {
    console.log(`  ${COLORS.info}✓${COLORS.reset} ${msg}`);
  }

  fail(msg: string): void {
    console.log(`  ${COLORS.error}✗${COLORS.reset} ${msg}`);
  }
}
