import { Injectable } from '@angular/core';
import { Chart } from 'chart.js';

@Injectable({
  providedIn: 'root'
})
export class ChartSyncService {
  private charts: Chart[] = [];

  constructor() { }

  addChart(chart: Chart) {
    this.charts.push(chart);
    this.synchronizeCharts();
  }

  private synchronizeCharts() {
    this.charts.forEach(chart => {
      chart.options.scales = chart.options.scales || {};
      chart.options.scales['x'] = chart.options.scales['x'] || {};
      chart.options.scales['x'].afterUpdate = (scale) => {
        this.charts.forEach(c => {
          if (c !== chart) {
            c.options.scales = c.options.scales || {};
            c.options.scales['x'] = c.options.scales['x'] || {};
            c.options.scales['x'].min = scale.min;
            c.options.scales['x'].max = scale.max;
            c.update('none');
          }
        });
      };
    });
  }
}
