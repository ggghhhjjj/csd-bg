import { readFileSync, existsSync } from "node:fs";

import type { Database } from "sql.js";

import { initSqlJsRuntime } from "./runtime.js";

export interface DateRecord {
  id: number;
  date: string;
  url: string;
}

export interface IssuerRecord {
  isin: string;
  issuer_name: string;
  latest_date: string;
  free_float: number;
}

export interface DailyMetricRow {
  date: string;
  isin: string;
  issuer_name: string;
  total_shares: number;
  free_float: number;
  shareholders: number;
}

export interface IssuerTrendPoint {
  date: string;
  free_float: number;
  total_shares: number;
  shareholders: number;
}

export class SqlJsBrowser {
  private db: Database | null = null;

  async open(dbPath: string): Promise<void> {
    await this.close();
    if (!existsSync(dbPath)) {
      throw new Error(`Database not found: ${dbPath}`);
    }

    const sqlJs = await initSqlJsRuntime();
    const fileBuffer = readFileSync(dbPath);
    this.db = new sqlJs.Database(fileBuffer);
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private requireDb(): Database {
    if (!this.db) {
      throw new Error("Database is not open");
    }
    return this.db;
  }

  listDates(): DateRecord[] {
    const db = this.requireDb();
    const result = db.exec(
      "SELECT id, date, url FROM free_float ORDER BY date DESC LIMIT 500",
    );
    if (!result.length) {
      return [];
    }

    const [{ columns, values }] = result;
    return values.map((row) => ({
      id: Number(row[columns.indexOf("id")]),
      date: String(row[columns.indexOf("date")]),
      url: String(row[columns.indexOf("url")]),
    }));
  }

  listIssuers(): IssuerRecord[] {
    const db = this.requireDb();
    const result = db.exec(`
      SELECT si.isin, i.name AS issuer_name, ff.date AS latest_date, sid.free_float
      FROM stock_issue si
      INNER JOIN stock_issue_daily sid ON sid.stock_issue_id = si.id
      INNER JOIN issuer i ON i.stock_issue_id = si.id AND i.free_float_id = sid.free_float_id
      INNER JOIN free_float ff ON ff.id = sid.free_float_id
      ORDER BY ff.date DESC, si.isin ASC
      LIMIT 1000
    `);

    if (!result.length) {
      return [];
    }

    const [{ columns, values }] = result;
    const seen = new Set<string>();
    const issuers: IssuerRecord[] = [];

    for (const row of values) {
      const isin = String(row[columns.indexOf("isin")]);
      if (seen.has(isin)) {
        continue;
      }
      seen.add(isin);
      issuers.push({
        isin,
        issuer_name: String(row[columns.indexOf("issuer_name")]),
        latest_date: String(row[columns.indexOf("latest_date")]),
        free_float: Number(row[columns.indexOf("free_float")]),
      });
    }

    return issuers;
  }

  queryDailyMetrics(limit = 200): DailyMetricRow[] {
    const db = this.requireDb();
    const result = db.exec(`
      SELECT ff.date, si.isin, i.name AS issuer_name,
             sid.total_shares, sid.free_float, sid.shareholders
      FROM stock_issue_daily sid
      INNER JOIN stock_issue si ON si.id = sid.stock_issue_id
      INNER JOIN issuer i ON i.stock_issue_id = sid.stock_issue_id
        AND i.free_float_id = sid.free_float_id
      INNER JOIN free_float ff ON ff.id = sid.free_float_id
      ORDER BY ff.date DESC, si.isin ASC
      LIMIT ${limit}
    `);

    if (!result.length) {
      return [];
    }

    const [{ columns, values }] = result;
    return values.map((row) => ({
      date: String(row[columns.indexOf("date")]),
      isin: String(row[columns.indexOf("isin")]),
      issuer_name: String(row[columns.indexOf("issuer_name")]),
      total_shares: Number(row[columns.indexOf("total_shares")]),
      free_float: Number(row[columns.indexOf("free_float")]),
      shareholders: Number(row[columns.indexOf("shareholders")]),
    }));
  }

  queryIssuerTrend(isin: string): IssuerTrendPoint[] {
    const db = this.requireDb();
    const stmt = db.prepare(`
      SELECT ff.date, sid.free_float, sid.total_shares, sid.shareholders
      FROM stock_issue_daily sid
      INNER JOIN stock_issue si ON si.id = sid.stock_issue_id
      INNER JOIN free_float ff ON ff.id = sid.free_float_id
      WHERE si.isin = ?
      ORDER BY ff.date ASC
    `);
    stmt.bind([isin]);

    const points: IssuerTrendPoint[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, string | number>;
      points.push({
        date: String(row.date),
        free_float: Number(row.free_float),
        total_shares: Number(row.total_shares),
        shareholders: Number(row.shareholders),
      });
    }
    stmt.free();
    return points;
  }
}
