import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCALE_STORAGE_KEY } from '../core/i18n/locale.service';
import { TabularExportService } from '../core/export/tabular-export.service';
import { DataExportMenu } from './data-export-menu';

describe('DataExportMenu', () => {
  beforeEach(() => {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
    document.documentElement.lang = 'bg';
  });

  it('copies CSV from resolveData when CSV is chosen', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const copyCsv = vi.spyOn(TabularExportService.prototype, 'copyCsv').mockResolvedValue();

    const fixture = TestBed.createComponent(DataExportMenu);
    fixture.componentRef.setInput('resolveData', () => ({
      headers: ['Name'],
      rows: [['Test']],
    }));
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.data-export-menu__trigger')?.click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.data-export-menu__item')?.click();
    await fixture.whenStable();

    expect(copyCsv).toHaveBeenCalledWith({ headers: ['Name'], rows: [['Test']] });
    vi.unstubAllGlobals();
    copyCsv.mockRestore();
  });
});
