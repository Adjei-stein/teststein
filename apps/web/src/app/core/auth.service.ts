import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { User } from './models';

const STORAGE_KEY = 'teststein.user';

/**
 * Mock authentication: any email + password signs in. Replace `login` with a
 * call to your auth API and store a token instead of the user object.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly user = signal<User | null>(this.restore());
  readonly isLoggedIn = computed(() => this.user() !== null);

  login(email: string, password: string): boolean {
    if (!email || !password) {
      return false;
    }
    const user: User = { email, name: this.nameFromEmail(email) };
    this.user.set(user);
    if (this.isBrowser) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    }
    return true;
  }

  logout(): void {
    this.user.set(null);
    if (this.isBrowser) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  private restore(): User | null {
    if (!this.isBrowser) {
      return null;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  }

  private nameFromEmail(email: string): string {
    return email
      .split('@')[0]
      .split(/[._-]+/)
      .filter(Boolean)
      .map(part => part[0].toUpperCase() + part.slice(1))
      .join(' ');
  }
}
