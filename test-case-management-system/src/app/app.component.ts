import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { SidebarComponent } from "./pages/sidebar/sidebar.component";
import { HeaderComponent } from "./pages/header/header.component";
import { LoginComponent } from "./pages/login/login.component";

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MatIconModule, CommonModule, SidebarComponent, HeaderComponent, LoginComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  isUserLoggedIn = true
  title = 'test-case-management-system';
  dropdownOpen = false;

  ngOnInit() {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('isUserLoggedIn', String(this.isUserLoggedIn));
    }
  }

  toggleDropdown() {
    this.dropdownOpen = !this.dropdownOpen;
  }
}
