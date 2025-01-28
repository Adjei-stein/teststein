import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})

export class AuthGuard implements CanActivate {
  constructor(private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> | Promise<boolean> | boolean {
    const isUserLoggedIn = typeof window !== 'undefined' && localStorage.getItem('isUserLoggedIn') === 'true';

    if (isUserLoggedIn) {
      this.router.navigate(['/dashboard'])
      return false;  // Allow access
    } else {
      //this.router.navigate(['/']);  // Redirect to the login page
      return true;  // Deny access
    }
  }
}
