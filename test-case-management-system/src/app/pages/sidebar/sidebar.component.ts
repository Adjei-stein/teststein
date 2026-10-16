import { Component, inject, input, output } from '@angular/core';
import { NgClass, NgTemplateOutlet } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

interface NavItem {
  label: string;
  icon: string;
  path: string;
}

@Component({
  selector: 'app-sidebar',
  imports: [MatIconModule, NgClass, NgTemplateOutlet, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {
  readonly collapsed = input(false);
  readonly mobileOpen = input(false);
  readonly toggleCollapsed = output<void>();
  readonly closeMobile = output<void>();

  readonly sections: { title: string; items: NavItem[] }[] = [
    {
      title: 'Workspace',
      items: [
        { label: 'Dashboard', icon: 'dashboard', path: '/dashboard' },
        { label: 'Projects', icon: 'folder', path: '/projects' },
        { label: 'Test cases', icon: 'edit_note', path: '/test-cases' },
        { label: 'Test runs', icon: 'play_circle', path: '/test-runs' },
      ],
    },
    {
      title: 'Insights',
      items: [
        { label: 'Reports', icon: 'description', path: '/reports' },
        { label: 'Analytics', icon: 'insights', path: '/analytics' },
      ],
    },
  ];

  readonly footerItems: NavItem[] = [
    { label: 'Settings', icon: 'settings', path: '/settings' },
    { label: 'Help', icon: 'help_outline', path: '/help' },
  ];

  constructor() {
    // Close the mobile drawer after navigating.
    inject(Router).events
      .pipe(filter(e => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(() => this.closeMobile.emit());
  }
}
