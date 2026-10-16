export type AppType = 'Web' | 'Mobile' | 'API' | 'Desktop';
export type Environment = 'Development' | 'QA' | 'Staging' | 'Production';
export type RunStatus = 'passed' | 'failed' | 'blocked' | 'running';

export const APP_TYPES: AppType[] = ['Web', 'Mobile', 'API', 'Desktop'];
export const ENVIRONMENTS: Environment[] = ['Development', 'QA', 'Staging', 'Production'];

export interface Project {
  id: string;
  key: string;
  name: string;
  description: string;
  appType: AppType;
  environment: Environment;
  startDate: string;
  endDate: string | null;
  stakeholders: string[];
  testCases: number;
  /** 0–100, from the most recent completed run. */
  passRate: number | null;
  lastRunAt: string | null;
}

export interface TestRun {
  id: string;
  name: string;
  projectId: string;
  status: RunStatus;
  startedAt: string;
  total: number;
  failures: number;
}

export interface ResultSummary {
  passed: number;
  failed: number;
  blocked: number;
  untested: number;
}

export interface User {
  name: string;
  email: string;
}
