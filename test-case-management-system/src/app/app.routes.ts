import { Routes } from '@angular/router';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { LoginComponent } from './pages/login/login.component';
import { ProjectsComponent } from './pages/projects/projects.component';
import { ProjectDetailsComponent } from './project-details/project-details.component';
import { ShellComponent } from './pages/shell/shell.component';
import { PlaceholderComponent } from './pages/placeholder/placeholder.component';
import { authGuard, guestGuard } from './auth.guard';

export const routes: Routes = [
    {
        path: 'login',
        component: LoginComponent,
        canActivate: [guestGuard],
        title: 'Sign in · Teststein'
    },
    {
        path: '',
        component: ShellComponent,
        canActivate: [authGuard],
        children: [
            { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
            { path: 'dashboard', component: DashboardComponent, title: 'Dashboard · Teststein' },
            { path: 'projects', component: ProjectsComponent, title: 'Projects · Teststein' },
            { path: 'projects/new', component: ProjectDetailsComponent, title: 'New project · Teststein' },
            { path: 'projects/:id', component: ProjectDetailsComponent, title: 'Project · Teststein' },
            { path: 'project-details', redirectTo: 'projects/new' },
            {
                path: 'test-cases', component: PlaceholderComponent, title: 'Test cases · Teststein',
                data: { heading: 'Test cases', icon: 'edit_note', blurb: 'Write, organise and version test cases for each project.' }
            },
            {
                path: 'test-runs', component: PlaceholderComponent, title: 'Test runs · Teststein',
                data: { heading: 'Test runs', icon: 'play_circle', blurb: 'Group test cases into runs and record results as you execute them.' }
            },
            {
                path: 'reports', component: PlaceholderComponent, title: 'Reports · Teststein',
                data: { heading: 'Reports', icon: 'description', blurb: 'Shareable summaries of run results for stakeholders.' }
            },
            {
                path: 'analytics', component: PlaceholderComponent, title: 'Analytics · Teststein',
                data: { heading: 'Analytics', icon: 'insights', blurb: 'Pass-rate trends, flaky tests and coverage over time.' }
            },
            {
                path: 'settings', component: PlaceholderComponent, title: 'Settings · Teststein',
                data: { heading: 'Settings', icon: 'settings', blurb: 'Workspace, members and integrations.' }
            },
            {
                path: 'help', component: PlaceholderComponent, title: 'Help · Teststein',
                data: { heading: 'Help', icon: 'help_outline', blurb: 'Guides and support.' }
            },
        ]
    },
    { path: '**', redirectTo: '' }
];
