import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RunStatus } from '../core/models';

const STATUS: Record<RunStatus, { label: string; icon: string; color: string }> = {
  passed: { label: 'Passed', icon: 'check_circle', color: 'text-status-passed' },
  failed: { label: 'Failed', icon: 'cancel', color: 'text-status-failed' },
  blocked: { label: 'Blocked', icon: 'block', color: 'text-status-blocked' },
  running: { label: 'Running', icon: 'autorenew', color: 'text-status-running animate-spin' },
};

/** Status is never colour-only: icon + label carry it, colour reinforces it. */
@Component({
  selector: 'app-status-badge',
  imports: [MatIconModule],
  template: `
    <span class="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-0.5 pl-1.5 pr-2.5 text-xs font-medium text-slate-700">
      <mat-icon class="icon-16" [class]="config().color">{{ config().icon }}</mat-icon>
      {{ config().label }}
    </span>
  `,
})
export class StatusBadgeComponent {
  readonly status = input.required<RunStatus>();
  readonly config = computed(() => STATUS[this.status()]);
}
