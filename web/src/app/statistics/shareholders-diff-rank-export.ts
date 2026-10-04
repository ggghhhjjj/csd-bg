import type { TabularExportData } from '../core/export/tabular-export.types';
import type { RankedIssuer } from './rank-issuers';

export type ShareholdersDiffRankExportLabels = {
  issuer: string;
  isin: string;
  changeAbs: string;
  changePercent: string;
};

export function shareholdersDiffRankToTabular(
  rows: RankedIssuer[],
  labels: ShareholdersDiffRankExportLabels,
): TabularExportData {
  return {
    headers: [labels.issuer, labels.isin, labels.changeAbs, labels.changePercent],
    rows: rows.map((row) => [row.name, row.isin, row.abs, row.percent]),
  };
}
