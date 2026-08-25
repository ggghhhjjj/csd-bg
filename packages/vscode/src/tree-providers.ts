import {
  EventEmitter,
  TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
} from "vscode";

import type { DateRecord, IssuerRecord, SqlJsBrowser } from "./db-browser.js";

export class DatesTreeProvider implements TreeDataProvider<DateTreeItem> {
  private readonly emitter = new EventEmitter<void>();

  constructor(private readonly getBrowser: () => SqlJsBrowser | null) {}

  refresh(): void {
    this.emitter.fire();
  }

  get onDidChangeTreeData() {
    return this.emitter.event;
  }

  getTreeItem(element: DateTreeItem): TreeItem {
    return element;
  }

  getChildren(): DateTreeItem[] {
    const browser = this.getBrowser();
    if (!browser) {
      return [new DateTreeItem("(open a workspace and run pipeline first)", "", "")];
    }

    try {
      return browser.listDates().map((record) => new DateTreeItem(record.date, record.url, record.date));
    } catch {
      return [new DateTreeItem("(database unavailable)", "", "")];
    }
  }
}

class DateTreeItem extends TreeItem {
  constructor(label: string, url: string, date: string) {
    super(label, TreeItemCollapsibleState.None);
    this.description = url ? "PDF" : undefined;
    this.tooltip = url || date;
  }
}

export class IssuersTreeProvider implements TreeDataProvider<IssuerTreeItem> {
  private readonly emitter = new EventEmitter<void>();

  constructor(private readonly getBrowser: () => SqlJsBrowser | null) {}

  refresh(): void {
    this.emitter.fire();
  }

  get onDidChangeTreeData() {
    return this.emitter.event;
  }

  getTreeItem(element: IssuerTreeItem): TreeItem {
    return element;
  }

  getChildren(): IssuerTreeItem[] {
    const browser = this.getBrowser();
    if (!browser) {
      return [new IssuerTreeItem("(no issuers yet)", "", 0)];
    }

    try {
      return browser.listIssuers().map(
        (record) =>
          new IssuerTreeItem(
            `${record.isin} — ${record.issuer_name}`,
            record.isin,
            record.free_float,
          ),
      );
    } catch {
      return [new IssuerTreeItem("(database unavailable)", "", 0)];
    }
  }
}

class IssuerTreeItem extends TreeItem {
  constructor(label: string, readonly isin: string, freeFloat: number) {
    super(label, TreeItemCollapsibleState.None);
    this.description = freeFloat ? `free float: ${freeFloat.toLocaleString()}` : undefined;
    this.contextValue = "issuer";
  }
}

export type { DateRecord, IssuerRecord };
