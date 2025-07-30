/**
 * Example of creating independent charts using the factory pattern
 * Each chart operates independently without synchronization
 */

import { Component } from '@angular/core';
import { Chart } from 'chart.js';
import { ChartInteractionFactory } from '../services/chart-interaction-factory.service';

@Component({
  selector: 'app-independent-chart-example',
  template: `
    <div class="chart-container">
      <h3>Independent Price Chart</h3>
      <canvas id="independent-price-chart"></canvas>
    </div>
    
    <div class="chart-container">
      <h3>Independent Volume Chart</h3>
      <canvas id="independent-volume-chart"></canvas>
    </div>
    
    <div class="controls">
      <button (click)="createIndependentCharts()">Create Independent Charts</button>
      <button (click)="createSynchronizedCharts()">Create Synchronized Charts</button>
      <button (click)="toggleCtrlRequirement()">
        {{ requireCtrl ? 'Disable' : 'Enable' }} Ctrl for Zoom
      </button>
    </div>
  `,
  styles: [`
    .chart-container {
      margin: 20px 0;
      padding: 15px;
      border: 1px solid #ddd;
      border-radius: 8px;
    }
    
    canvas {
      width: 100%;
      height: 300px;
    }
    
    .controls {
      display: flex;
      gap: 10px;
      margin: 20px 0;
    }
    
    button {
      padding: 10px 15px;
      border: none;
      border-radius: 4px;
      background: #007bff;
      color: white;
      cursor: pointer;
    }
    
    button:hover {
      background: #0056b3;
    }
  `]
})
export class IndependentChartExample {
  private priceChart: Chart | null = null;
  private volumeChart: Chart | null = null;
  private requireCtrl = true;

  constructor(private interactionFactory: ChartInteractionFactory) {}

  /**
   * Create charts that operate independently (no synchronization)
   */
  createIndependentCharts(): void {
    this.destroyExistingCharts();

    // Create independent price chart
    this.priceChart = new Chart('independent-price-chart', {
      type: 'line',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
        datasets: [{
          label: 'Price (Independent)',
          data: [100, 105, 98, 112, 108],
          borderColor: 'rgb(75, 192, 192)',
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { type: 'category' },
          y: { type: 'linear' }
        },
        plugins: {
          legend: { display: true },
          // Use factory to create independent interaction
          ...this.interactionFactory.createIndependentInteraction('price', this.requireCtrl).plugins
        }
      }
    });

    // Create independent volume chart
    this.volumeChart = new Chart('independent-volume-chart', {
      type: 'bar',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
        datasets: [{
          label: 'Volume (Independent)',
          data: [1000, 1200, 800, 1500, 1100],
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          borderColor: 'rgba(255, 99, 132, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { type: 'category' },
          y: { type: 'linear' }
        },
        plugins: {
          legend: { display: true },
          // Use factory to create independent interaction
          ...this.interactionFactory.createIndependentInteraction('volume', this.requireCtrl).plugins
        }
      }
    });

    // Register charts with the factory (but don't link them)
    this.interactionFactory.registerChart('independent-price', this.priceChart, 'price');
    this.interactionFactory.registerChart('independent-volume', this.volumeChart, 'volume');

    console.log('✅ Independent charts created - each operates separately');
  }

  /**
   * Create charts that are synchronized together
   */
  createSynchronizedCharts(): void {
    this.destroyExistingCharts();

    // Create synchronized price chart
    this.priceChart = new Chart('independent-price-chart', {
      type: 'line',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
        datasets: [{
          label: 'Price (Synchronized)',
          data: [100, 105, 98, 112, 108],
          borderColor: 'rgb(54, 162, 235)',
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { type: 'category' },
          y: { type: 'linear' }
        },
        plugins: {
          legend: { display: true },
          // Use factory to create synchronized interaction
          ...this.interactionFactory.createSynchronizedInteraction('price', this.requireCtrl).plugins
        }
      }
    });

    // Create synchronized volume chart
    this.volumeChart = new Chart('independent-volume-chart', {
      type: 'bar',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
        datasets: [{
          label: 'Volume (Synchronized)',
          data: [1000, 1200, 800, 1500, 1100],
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { type: 'category' },
          y: { type: 'linear' }
        },
        plugins: {
          legend: { display: true },
          // Use factory to create synchronized interaction
          ...this.interactionFactory.createSynchronizedInteraction('volume', this.requireCtrl).plugins
        }
      }
    });

    // Register and link charts for synchronization
    this.interactionFactory.registerChart('sync-price', this.priceChart, 'price');
    this.interactionFactory.registerChart('sync-volume', this.volumeChart, 'volume');
    this.interactionFactory.linkCharts(this.priceChart, this.volumeChart);

    console.log('✅ Synchronized charts created - zoom/pan operations sync between charts');
  }

  /**
   * Toggle whether Ctrl key is required for zooming
   */
  toggleCtrlRequirement(): void {
    this.requireCtrl = !this.requireCtrl;
    console.log(`🎛️ Ctrl requirement for zoom: ${this.requireCtrl ? 'Enabled' : 'Disabled'}`);
    
    // Recreate charts with new settings
    if (this.priceChart && this.volumeChart) {
      // Determine if charts are currently synchronized
      const areSynced = !!(this.priceChart as any).volumeChart;
      
      if (areSynced) {
        this.createSynchronizedCharts();
      } else {
        this.createIndependentCharts();
      }
    }
  }

  /**
   * Destroy existing charts
   */
  private destroyExistingCharts(): void {
    if (this.priceChart) {
      this.priceChart.destroy();
      this.priceChart = null;
    }
    
    if (this.volumeChart) {
      this.volumeChart.destroy();
      this.volumeChart = null;
    }
  }

  ngOnDestroy(): void {
    this.destroyExistingCharts();
  }
}

/**
 * Usage Instructions:
 * 
 * 1. Independent Charts:
 *    - Each chart zooms/pans independently
 *    - No synchronization between charts
 *    - Useful for comparing different datasets
 * 
 * 2. Synchronized Charts:
 *    - Zoom/pan operations sync between charts
 *    - Maintains alignment for time-series data
 *    - Useful for price/volume analysis
 * 
 * 3. Ctrl Requirement:
 *    - When enabled: Must hold Ctrl while scrolling to zoom
 *    - When disabled: Scroll wheel zooms directly
 *    - Pan operations (drag) work regardless of setting
 * 
 * Factory Benefits:
 * - Consistent interaction behavior across all charts
 * - Easy to switch between independent and synchronized modes
 * - Centralized configuration management
 * - Better performance through optimized event handlers
 */