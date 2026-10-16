import { Component, OnInit, inject, input, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { MatChipEditedEvent, MatChipInputEvent, MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { DataService } from '../core/data.service';
import { APP_TYPES, AppType, ENVIRONMENTS, Environment, Project } from '../core/models';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function endAfterStart(group: AbstractControl): ValidationErrors | null {
  const start = group.get('startDate')?.value;
  const end = group.get('endDate')?.value;
  return start && end && end < start ? { endBeforeStart: true } : null;
}

@Component({
  selector: 'app-project-details',
  imports: [ReactiveFormsModule, RouterLink, MatChipsModule, MatIconModule],
  templateUrl: './project-details.component.html',
  styleUrl: './project-details.component.scss',
})
export class ProjectDetailsComponent implements OnInit {
  private readonly data = inject(DataService);
  private readonly router = inject(Router);
  private readonly announcer = inject(LiveAnnouncer);

  /** Bound from the `:id` route param; undefined on /projects/new. */
  readonly id = input<string>();

  readonly appTypes = APP_TYPES;
  readonly environments = ENVIRONMENTS;
  readonly separatorKeysCodes = [ENTER, COMMA] as const;

  readonly isNew = signal(true);
  readonly notFound = signal(false);
  readonly stakeholders = signal<string[]>([]);
  readonly stakeholderError = signal('');

  private existing?: Project;

  readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    key: [{ value: '', disabled: true }],
    description: ['', Validators.maxLength(500)],
    appType: ['' as AppType | '', Validators.required],
    environment: ['' as Environment | '', Validators.required],
    startDate: ['', Validators.required],
    endDate: [''],
  }, { validators: endAfterStart });

  ngOnInit() {
    const id = this.id();
    if (!id) {
      this.form.controls.key.setValue(`PX-${this.data.nextProjectId().padStart(3, '0')}`);
      return;
    }
    const project = this.data.getProject(id);
    if (!project) {
      this.notFound.set(true);
      return;
    }
    this.existing = project;
    this.isNew.set(false);
    this.stakeholders.set([...project.stakeholders]);
    this.form.patchValue({ ...project, endDate: project.endDate ?? '' });
  }

  showError(control: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[control];
    return c.invalid && (c.touched || c.dirty);
  }

  addStakeholder(event: MatChipInputEvent): void {
    const value = (event.value || '').trim().toLowerCase();
    if (!value) {
      return;
    }
    if (!EMAIL_PATTERN.test(value)) {
      this.stakeholderError.set(`“${value}” isn't a valid email address.`);
      return;
    }
    if (!this.stakeholders().includes(value)) {
      this.stakeholders.update(list => [...list, value]);
    }
    this.stakeholderError.set('');
    event.chipInput.clear();
  }

  removeStakeholder(email: string): void {
    this.stakeholders.update(list => list.filter(e => e !== email));
    this.announcer.announce(`Removed ${email}`);
  }

  editStakeholder(email: string, event: MatChipEditedEvent): void {
    const value = event.value.trim().toLowerCase();
    if (!value) {
      this.removeStakeholder(email);
      return;
    }
    if (!EMAIL_PATTERN.test(value)) {
      this.stakeholderError.set(`“${value}” isn't a valid email address.`);
      return;
    }
    this.stakeholders.update(list => list.map(e => (e === email ? value : e)));
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.data.saveProject({
      id: this.existing?.id ?? this.data.nextProjectId(),
      key: v.key,
      name: v.name.trim(),
      description: v.description.trim(),
      appType: v.appType as AppType,
      environment: v.environment as Environment,
      startDate: v.startDate,
      endDate: v.endDate || null,
      stakeholders: this.stakeholders(),
      testCases: this.existing?.testCases ?? 0,
      passRate: this.existing?.passRate ?? null,
      lastRunAt: this.existing?.lastRunAt ?? null,
    });
    this.router.navigate(['/projects']);
  }
}
