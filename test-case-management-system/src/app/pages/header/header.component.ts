import { Component, ElementRef, HostListener, computed, inject, output, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-header',
  imports: [MatIconModule, RouterLink],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly openMenu = output<void>();
  readonly dropdownOpen = signal(false);
  readonly user = this.auth.user;
  readonly initials = computed(() =>
    (this.user()?.name ?? '?')
      .split(' ')
      .map(part => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()
  );
  readonly firstName = computed(() => this.user()?.name.split(' ')[0] ?? '');

  toggleDropdown() {
    this.dropdownOpen.update(open => !open);
  }

  logout() {
    this.dropdownOpen.set(false);
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.dropdownOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.dropdownOpen.set(false);
  }
}
