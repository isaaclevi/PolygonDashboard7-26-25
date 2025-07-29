import { Component, Input, ViewChild, AfterViewInit } from '@angular/core';
import { PriceChartComponent } from '../price-chart/price-chart.component';
import { VolumeChartComponent } from '../volume-chart/volume-chart.component';
import { DualChartData } from '../../../models/stock-data.interface';
import { ChartColorConfig } from '../../../models/chart-config.interface';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import { ChartService } from '../../../services/chart';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import 'chartjs-adapter-date-fns';

Chart.register(...registerables);

@Component({
  selector: 'app-chart-container',
  templateUrl: './chart-container.component.html',
  styleUrls: ['./chart-container.component.scss'],
  standalone: true,
  imports: [PriceChartComponent, VolumeChartComponent, CommonModule, MatButtonModule, MatIconModule, MatTooltipModule]
})
export class ChartContainerComponent implements AfterViewInit {
  @Input() chartData!: DualChartData;
  @Input() chartColors!: ChartColorConfig;
  
  @ViewChild(PriceChartComponent) priceChartComponent!: PriceChartComponent;
  @ViewChild(VolumeChartComponent) volumeChartComponent!: VolumeChartComponent;

  constructor(private chartService: ChartService) {}

  ngAfterViewInit(): void {
    // Wait a bit for charts to be created, then link them
    setTimeout(() => {
      this.linkCharts();
    }, 200);
  }

  private linkCharts(): void {
    const priceChart = this.priceChartComponent?.chart;
    const volumeChart = this.volumeChartComponent?.chart;
    
    if (priceChart && volumeChart) {
      this.chartService.linkCharts(priceChart, volumeChart);
      console.log('Charts linked for synchronized zooming');
    }
  }

  resetZoom(): void {
    const priceChart = this.priceChartComponent?.chart;
    const volumeChart = this.volumeChartComponent?.chart;
    
    this.chartService.resetZoomBoth(priceChart, volumeChart);
  }

  zoomToLast24Hours(): void {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    
    const priceChart = this.priceChartComponent?.chart;
    const volumeChart = this.volumeChartComponent?.chart;
    
    this.chartService.panToDateRange(priceChart, volumeChart, startDate, endDate);
  }

  zoomToLastWeek(): void {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const priceChart = this.priceChartComponent?.chart;
    const volumeChart = this.volumeChartComponent?.chart;
    
    this.chartService.panToDateRange(priceChart, volumeChart, startDate, endDate);
  }

  zoomToLastMonth(): void {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const priceChart = this.priceChartComponent?.chart;
    const volumeChart = this.volumeChartComponent?.chart;
    
    this.chartService.panToDateRange(priceChart, volumeChart, startDate, endDate);
  }
}
