import { describe, expect, it } from 'vitest';

import { shareholdersDiffRankToTabular } from './shareholders-diff-rank-export';
import type { RankedIssuer } from './rank-issuers';

describe('shareholdersDiffRankToTabular', () => {
  it('maps visible ranked issuers to tabular export rows', () => {
    const rows: RankedIssuer[] = [
      {
        issuerIndex: 0,
        isin: 'BG1100000050',
        name: 'Delta',
        diff: 20,
        abs: '+20',
        percent: '+200%',
      },
    ];
    expect(
      shareholdersDiffRankToTabular(rows, {
        issuer: 'Issuer',
        isin: 'ISIN',
        changeAbs: 'Change',
        changePercent: '%',
      }),
    ).toEqual({
      headers: ['Issuer', 'ISIN', 'Change', '%'],
      rows: [['Delta', 'BG1100000050', '+20', '+200%']],
    });
  });
});
