import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

/** Stand-in for sections that are in the nav but not built yet. Fed by route `data`. */
@Component({
  selector: 'app-placeholder',
  imports: [MatIconModule, RouterLink],
  template: `
    <h1 class="text-2xl font-semibold tracking-tight text-slate-900">{{ heading() }}</h1>
    <div class="card mt-6 flex flex-col items-center px-6 py-16 text-center">
      <span class="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <mat-icon class="icon-24">{{ icon() }}</mat-icon>
      </span>
      <h2 class="mt-4 text-base font-semibold text-slate-900">Coming soon</h2>
      <p class="mt-1 max-w-sm text-sm text-slate-500">{{ blurb() }}</p>
      <a routerLink="/dashboard" class="btn btn-secondary mt-6">Back to dashboard</a>
    </div>
  `,
})
export class PlaceholderComponent {
  readonly heading = input('');
  readonly icon = input('construction');
  readonly blurb = input('');
}
