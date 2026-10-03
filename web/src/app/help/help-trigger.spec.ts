import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { HelpService } from '../core/help/help.service';
import { HelpTrigger } from './help-trigger';
import { RANGE_PRESETS_HELP } from '../statistics/range-presets.help-id';

describe('HelpTrigger', () => {
  let fixture: ComponentFixture<HelpTrigger>;

  beforeEach(async () => {
    vi.spyOn(HelpService.prototype, 'ensureManifest').mockResolvedValue(undefined);
    vi.spyOn(HelpService.prototype, 'hasTopic').mockReturnValue(true);
    vi.spyOn(HelpService.prototype, 'openTopic').mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [HelpTrigger],
    }).compileComponents();

    fixture = TestBed.createComponent(HelpTrigger);
    fixture.componentRef.setInput('topicId', RANGE_PRESETS_HELP);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('renders the trigger and opens help on click', () => {
    const button = fixture.nativeElement.querySelector('.help-trigger') as HTMLButtonElement;
    expect(button).toBeTruthy();

    button.click();

    expect(HelpService.prototype.openTopic).toHaveBeenCalledWith(RANGE_PRESETS_HELP);
  });
});
