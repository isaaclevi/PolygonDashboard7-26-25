import { Component, Input } from '@angular/core';
import { PriceChartComponent } from '../price-chart/price-chart.component';
import { VolumeChartComponent } from '../volume-chart/volume-chart.component';
import { DualChartData } from '../../../models/stock-data.interface';
import { ChartColorConfig } from '../../../models/chart-config.interface';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import 'chartjs-adapter-date-fns';

Chart.register(...registerables);

@Component({
  selector: 'app-chart-container',
  templateUrl: './chart-container.component.html',
  styleUrls: ['./chart-container.component.scss'],
  standalone: true,
  imports: [PriceChartComponent, VolumeChartComponent, CommonModule]
})
export class ChartContainerComponent {
  @Input() chartData!: DualChartData;
  @Input() chartColors!: ChartColorConfig;
}
