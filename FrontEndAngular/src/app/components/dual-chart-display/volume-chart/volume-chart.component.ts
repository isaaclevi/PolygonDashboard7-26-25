import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { Chart } from 'chart.js';
import { ChartService } from '../../../services/chart';
import { DualChartData } from '../../../models/stock-data.interface';
import { ChartColorConfig } from '../../../models/chart-config.interface';

@Component({
  selector: 'app-volume-chart',
  templateUrl: './volume-chart.component.html',
  styleUrls: [],
  standalone: true
})
export class VolumeChartComponent implements OnChanges {
  @Input() chartData!: DualChartData;
  @Input() chartColors!: ChartColorConfig;
  public chart: Chart | undefined;

  constructor(private chartService: ChartService) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chartData'] && this.chartData) {
      if (this.chart) {
        this.chart.destroy();
      }
      this.chart = this.chartService.createVolumeChart('volumeChart', this.chartData, this.chartColors);
    }
  }
}
