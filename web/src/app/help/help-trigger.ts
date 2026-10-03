import { Component, inject, input, OnInit, signal } from '@angular/core';

import type { HelpTopicId } from '../core/help/help-topic-id';
import { HelpService } from '../core/help/help.service';
import { LocaleService } from '../core/i18n/locale.service';

@Component({
  selector: 'app-help-trigger',
  templateUrl: './help-trigger.html',
  styleUrl: './help-trigger.css',
})
export class HelpTrigger implements OnInit {
  readonly topicId = input.required<HelpTopicId>();

  private readonly help = inject(HelpService);
  protected readonly i18n = inject(LocaleService);

  protected readonly visible = signal(false);

  ngOnInit(): void {
    void this.help.ensureManifest().then(() => {
      this.visible.set(this.help.hasTopic(this.topicId()));
    });
  }

  protected openHelp(): void {
    void this.help.openTopic(this.topicId());
  }

  protected ariaLabel(): string {
    return this.i18n.text('help.open');
  }
}
