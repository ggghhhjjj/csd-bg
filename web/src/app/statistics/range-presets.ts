import { Component, computed, inject, input, output } from '@angular/core';

import type { RangePreset } from '../core/data/date-range';
import { LocaleService } from '../core/i18n/locale.service';

@Component({
  selector: 'app-range-presets',
  templateUrl: './range-presets.html',
  styleUrl: './range-presets.css',
})
export class RangePresets {
  readonly preset = input.required<RangePreset>();
  readonly presetChange = output<RangePreset>();

  private readonly i18n = inject(LocaleService);

  protected readonly presets = computed<Array<{ id: RangePreset; label: string }>>(() => [
    { id: 'd5', label: this.i18n.text('range.d5') },
    { id: 'd10', label: this.i18n.text('range.d10') },
    { id: 'm1', label: this.i18n.text('range.m1') },
    { id: 'm3', label: this.i18n.text('range.m3') },
    { id: 'm6', label: this.i18n.text('range.m6') },
    { id: 'ytd', label: this.i18n.text('range.ytd') },
    { id: 'y1', label: this.i18n.text('range.y1') },
    { id: 'y3', label: this.i18n.text('range.y3') },
    { id: 'y5', label: this.i18n.text('range.y5') },
    { id: 'max', label: this.i18n.text('range.max') },
  ]);

  protected select(preset: RangePreset): void {
    this.presetChange.emit(preset);
  }
}
