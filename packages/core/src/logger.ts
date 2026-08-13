import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { Logger } from "./types.js";

export type LogLevel = "ERROR" | "WARN" | "INFO" | "DEBUG";

const LOG_RANK: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const VALID_LEVELS = new Set<string>(Object.keys(LOG_RANK));

export function parseLogLevel(raw: string | undefined, fallback: LogLevel = "INFO"): LogLevel {
  const normalized = raw?.trim().toUpperCase();
  if (!normalized) {
    return fallback;
  }
  if (!VALID_LEVELS.has(normalized)) {
    throw new Error(
      `Invalid log level ${JSON.stringify(raw)}. Valid values: ERROR, WARN, INFO, DEBUG`,
    );
  }
  return normalized as LogLevel;
}

export function resolveLogLevel(
  cliLevel: string | undefined,
  envLevel: string | undefined,
): LogLevel {
  if (cliLevel !== undefined && cliLevel !== "") {
    return parseLogLevel(cliLevel);
  }
  if (envLevel !== undefined && envLevel !== "") {
    return parseLogLevel(envLevel);
  }
  return "INFO";
}

export function isVerboseLogLevel(level: LogLevel): boolean {
  return level === "DEBUG";
}

function formatLine(level: LogLevel, message: string): string {
  return `${new Date().toISOString()} - csd-bg - ${level} - ${message}`;
}

export interface CreateLoggerOptions {
  logPath?: string;
  level?: LogLevel;
  /** When set, receives every emitted line instead of console.log/warn/error. */
  onLine?: (line: string, level: LogLevel) => void;
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const configuredLevel = options.level ?? "INFO";
  const { logPath, onLine } = options;

  const writeToFile = (line: string) => {
    if (!logPath) {
      return;
    }
    try {
      mkdirSync(dirname(logPath), { recursive: true });
      appendFileSync(logPath, `${line}\n`, "utf-8");
    } catch {
      // Keep stdout-only logging when file logging fails.
    }
  };

  const emit = (level: LogLevel, message: string, args: unknown[]) => {
    if (LOG_RANK[level] < LOG_RANK[configuredLevel]) {
      return;
    }

    const text = `${message} ${args.map(String).join(" ")}`.trim();
    const line = formatLine(level, text);

    if (onLine) {
      onLine(line, level);
    } else {
      switch (level) {
        case "ERROR":
          console.error(line);
          break;
        case "WARN":
          console.warn(line);
          break;
        default:
          console.log(line);
      }
    }

    writeToFile(line);
  };

  return {
    debug: (message, ...args) => emit("DEBUG", message, args),
    info: (message, ...args) => emit("INFO", message, args),
    warn: (message, ...args) => emit("WARN", message, args),
    error: (message, ...args) => emit("ERROR", message, args),
  };
}
