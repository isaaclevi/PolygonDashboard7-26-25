import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { ChartService } from '../../../services/chart';
import { DualChartData } from '../../../models/stock-data.interface';
import { ChartColorConfig } from '../../../models/chart-config.interface';
import 'chartjs-adapter-date-fns';

Chart.register(...registerables);

@Component({
  selector: 'app-price-chart',
  templateUrl: './price-chart.component.html',
  styleUrls: [],
  standalone: true
})
export class PriceChartComponent implements OnChanges {
  @Input() chartData!: DualChartData;
  @Input() chartColors!: ChartColorConfig;
  public chart: Chart | undefined;

  constructor(private chartService: ChartService) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chartData'] && this.chartData) {
      if (this.chart) {
        this.chart.destroy();
      }
      this.chart = this.chartService.createPriceChart('priceChart', this.chartData, this.chartColors);
    }
  }
}
