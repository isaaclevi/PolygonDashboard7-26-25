import { Component, Input, OnChanges, SimpleChanges, AfterViewInit } from '@angular/core';
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
export class VolumeChartComponent implements OnChanges, AfterViewInit {
  @Input() chartData!: DualChartData;
  @Input() chartColors!: ChartColorConfig;
  public chart: Chart | undefined;
  private viewInitialized = false;

  constructor(private chartService: ChartService) { }

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    this.createChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chartData'] && this.chartData && this.viewInitialized) {
      this.createChart();
    }
  }

  private createChart(): void {
    if (!this.chartData || !this.chartColors) {
      console.log('Volume chart: Missing data or colors, skipping chart creation');
      return;
    }

    try {
      if (this.chart) {
        this.chart.destroy();
      }
      
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        try {
          this.chart = this.chartService.createVolumeChart('volumeChart', this.chartData, this.chartColors);
          console.log('Volume chart created successfully');
        } catch (error) {
          console.error('Error creating volume chart:', error);
        }
      }, 100);
    } catch (error) {
      console.error('Error in volume chart creation process:', error);
    }
  }
}
