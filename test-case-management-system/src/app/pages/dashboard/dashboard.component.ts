import { Component, PLATFORM_ID, computed, inject } from '@angular/core';
import { DatePipe, DecimalPipe, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import * as Highcharts from 'highcharts';
import { HighchartsChartModule } from 'highcharts-angular';
import { DataService } from '../../core/data.service';
import { StatusBadgeComponent } from '../../shared/status-badge.component';

// Mirrors the `status` colours in tailwind.config.js.
const STATUS_COLORS = {
  passed: '#0ca30c',
  failed: '#d03b3b',
  blocked: '#fab219',
  untested: '#94a3b8',
};

@Component({
  selector: 'app-dashboard',
  imports: [MatIconModule, HighchartsChartModule, RouterLink, DatePipe, DecimalPipe, StatusBadgeComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  private readonly data = inject(DataService);
  readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly Highcharts: typeof Highcharts = Highcharts;
  readonly runs = this.data.runs;
  readonly projects = this.data.projects;
  readonly projectName = (id: string) => this.data.projectName(id);

  readonly summary = this.data.resultSummary;
  readonly totalResults = computed(() => {
    const s = this.summary();
    return s.passed + s.failed + s.blocked + s.untested;
  });
  readonly passRate = computed(() => {
    const s = this.summary();
    const executed = s.passed + s.failed + s.blocked;
    return executed ? Math.round((s.passed / executed) * 100) : 0;
  });

  readonly stats = computed(() => [
    { label: 'Projects', value: this.projects().length, icon: 'folder' },
    { label: 'Test cases', value: this.data.totalTestCases(), icon: 'edit_note' },
    { label: 'Active runs', value: this.data.activeRuns(), icon: 'play_circle' },
    { label: 'Pass rate', value: `${this.passRate()}%`, icon: 'verified' },
  ]);

  readonly legend = computed(() => {
    const s = this.summary();
    const total = this.totalResults() || 1;
    return [
      { label: 'Passed', count: s.passed, icon: 'check_circle', color: STATUS_COLORS.passed },
      { label: 'Failed', count: s.failed, icon: 'cancel', color: STATUS_COLORS.failed },
      { label: 'Blocked', count: s.blocked, icon: 'block', color: STATUS_COLORS.blocked },
      { label: 'Untested', count: s.untested, icon: 'radio_button_unchecked', color: STATUS_COLORS.untested },
    ].map(item => ({ ...item, percent: (item.count / total) * 100 }));
  });

  readonly chartOptions = computed<Highcharts.Options>(() => ({
    chart: { type: 'pie', height: 220, backgroundColor: 'transparent', style: { fontFamily: 'Inter, sans-serif' } },
    title: { text: undefined },
    credits: { enabled: false },
    legend: { enabled: false },
    tooltip: {
      pointFormat: '<b>{point.y}</b> test cases ({point.percentage:.0f}%)',
      backgroundColor: '#ffffff',
      borderColor: '#e2e8f0',
      borderRadius: 8,
      shadow: false,
    },
    plotOptions: {
      pie: {
        innerSize: '72%',
        borderWidth: 2,
        borderColor: '#ffffff',
        dataLabels: { enabled: false },
        states: { inactive: { opacity: 0.4 } },
      },
    },
    series: [{
      type: 'pie',
      name: 'Results',
      data: this.legend().map(item => ({ name: item.label, y: item.count, color: item.color })),
    }],
  }));
}
