import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { DataService } from '../../core/data.service';

@Component({
  selector: 'app-projects',
  imports: [MatIconModule, RouterLink, DatePipe],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.scss'
})
export class ProjectsComponent {
  private readonly data = inject(DataService);

  readonly query = signal('');
  readonly projects = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.data.projects();
    return q
      ? all.filter(p => `${p.name} ${p.key} ${p.description}`.toLowerCase().includes(q))
      : all;
  });
  readonly total = computed(() => this.data.projects().length);
}
