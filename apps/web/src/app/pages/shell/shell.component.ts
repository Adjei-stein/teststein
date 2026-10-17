import { Component, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { HeaderComponent } from '../header/header.component';

/** Layout for every signed-in page: sidebar + top bar + routed content. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, NgClass, SidebarComponent, HeaderComponent],
  template: `
    <app-sidebar
      [collapsed]="collapsed()"
      [mobileOpen]="mobileOpen()"
      (toggleCollapsed)="collapsed.set(!collapsed())"
      (closeMobile)="mobileOpen.set(false)"
    />
    <div
      class="min-h-screen transition-[padding] duration-200"
      [ngClass]="collapsed() ? 'lg:pl-[72px]' : 'lg:pl-64'"
    >
      <app-header (openMenu)="mobileOpen.set(true)" />
      <main class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <router-outlet />
      </main>
    </div>
  `,
})
export class ShellComponent {
  readonly collapsed = signal(false);
  readonly mobileOpen = signal(false);
}
