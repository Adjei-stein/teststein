import { Injectable, computed, signal } from '@angular/core';
import { Project, ResultSummary, TestRun } from './models';

/**
 * In-memory data source. Every page reads from here, so swapping this for
 * HttpClient calls to a real API won't require template changes.
 */
@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly _projects = signal<Project[]>([
    {
      id: '1', key: 'SHOP', name: 'ShopInn Mobile App',
      description: 'Customer-facing shopping app for iOS and Android, including checkout and payments.',
      appType: 'Mobile', environment: 'Staging', startDate: '2024-06-01', endDate: '2025-03-31',
      stakeholders: ['product@shopinn.com'], testCases: 214, passRate: 92, lastRunAt: '2025-01-09T12:00:00Z',
    },
    {
      id: '2', key: 'LINK', name: 'LinkedIn Integration',
      description: 'OAuth sign-in and profile import via the LinkedIn API.',
      appType: 'API', environment: 'QA', startDate: '2024-11-15', endDate: null,
      stakeholders: [], testCases: 48, passRate: 81, lastRunAt: '2025-01-07T08:00:00Z',
    },
    {
      id: '3', key: 'ADMN', name: 'Admin Portal',
      description: 'Internal back-office for order management, refunds and reporting.',
      appType: 'Web', environment: 'Development', startDate: '2024-09-02', endDate: null,
      stakeholders: [], testCases: 132, passRate: 67, lastRunAt: '2025-01-08T15:30:00Z',
    },
    {
      id: '4', key: 'DESK', name: 'POS Desktop Client',
      description: 'Point-of-sale client used in physical stores.',
      appType: 'Desktop', environment: 'Production', startDate: '2023-04-10', endDate: '2024-12-20',
      stakeholders: [], testCases: 305, passRate: 98, lastRunAt: '2024-12-18T10:00:00Z',
    },
    {
      id: '5', key: 'NOTI', name: 'Notification Service',
      description: 'Email, SMS and push notification delivery.',
      appType: 'API', environment: 'QA', startDate: '2025-01-02', endDate: null,
      stakeholders: [], testCases: 0, passRate: null, lastRunAt: null,
    },
  ]);

  private readonly _runs = signal<TestRun[]>([
    { id: 'r5', name: 'Checkout regression', projectId: '1', status: 'running', startedAt: '2025-01-10T09:15:00Z', total: 86, failures: 0 },
    { id: 'r4', name: 'Payment system integration', projectId: '1', status: 'passed', startedAt: '2025-01-09T12:00:00Z', total: 64, failures: 0 },
    { id: 'r3', name: 'Refund workflow', projectId: '3', status: 'failed', startedAt: '2025-01-08T15:30:00Z', total: 40, failures: 6 },
    { id: 'r2', name: 'User login', projectId: '2', status: 'blocked', startedAt: '2025-01-07T08:00:00Z', total: 22, failures: 2 },
    { id: 'r1', name: 'Form validation', projectId: '1', status: 'failed', startedAt: '2025-01-06T16:00:00Z', total: 31, failures: 4 },
  ]);

  readonly projects = this._projects.asReadonly();
  readonly runs = this._runs.asReadonly();

  readonly resultSummary = signal<ResultSummary>({ passed: 412, failed: 38, blocked: 17, untested: 64 });

  readonly totalTestCases = computed(() => this._projects().reduce((sum, p) => sum + p.testCases, 0));
  readonly activeRuns = computed(() => this._runs().filter(r => r.status === 'running').length);

  getProject(id: string): Project | undefined {
    return this._projects().find(p => p.id === id);
  }

  projectName(id: string): string {
    return this.getProject(id)?.name ?? 'Unknown project';
  }

  nextProjectId(): string {
    return String(Math.max(0, ...this._projects().map(p => Number(p.id))) + 1);
  }

  saveProject(project: Project): void {
    this._projects.update(list => {
      const index = list.findIndex(p => p.id === project.id);
      if (index === -1) {
        return [...list, project];
      }
      const copy = [...list];
      copy[index] = project;
      return copy;
    });
  }
}
