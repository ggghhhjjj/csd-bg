/** Tabular clipboard export: column headers plus one string cell per column per row. */
export type TabularExportData = {
  headers: string[];
  rows: string[][];
};
