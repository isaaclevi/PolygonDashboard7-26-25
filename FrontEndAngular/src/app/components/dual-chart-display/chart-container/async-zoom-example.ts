/**
 * Example implementation of how to use the async zoom features
 * in the chart container component
 */

import { Component, ViewChild, OnDestroy } from '@angular/core';
import { ChartService } from '../../../services/chart';
import { ZoomOptimizerService } from '../../../services/zoom-optimizer.service';

export class ChartContainerAsyncExample implements OnDestroy {
  
  constructor(
    private chartService: ChartService,
    private zoomOptimizer: ZoomOptimizerService
  ) {}

  /**
   * Enhanced zoom methods using async patterns
   */

  // 1. Async zoom to date range
  async zoomToDateRangeAsync(startDate: Date, endDate: Date): Promise<void> {
    const priceChart = this.priceChartComponent?.chart;
    const volumeChart = this.volumeChartComponent?.chart;
    
    const startTime = startDate.getTime();
    const endTime = endDate.getTime();
    
    if (priceChart && volumeChart) {
      // Use async zoom for both charts simultaneously
      await Promise.all([
        this.chartService.asyncZoom(priceChart, { min: startTime, max: endTime }),
        this.chartService.asyncZoom(volumeChart, { min: startTime, max: endTime })
      ]);
      
      console.log('✅ Async zoom to date range completed');
    }
  }

  // 2. Intelligent zoom based on data density
  async smartZoom(zoomLevel: number): Promise<void> {
    const priceChart = this.priceChartComponent?.chart;
    const volumeChart = this.volumeChartComponent?.chart;
    
    if (!priceChart || !volumeChart) return;

    // Calculate optimal zoom boundaries
    const data = priceChart.data.datasets[0]?.data as any[];
    if (!data || data.length === 0) return;

    const dataStart = new Date(data[0].x).getTime();
    const dataEnd = new Date(data[data.length - 1].x).getTime();
    const totalRange = dataEnd - dataStart;
    
    // Calculate zoom window based on level (0.1 = 10% of data visible)
    const visibleRange = totalRange * zoomLevel;
    const center = (dataStart + dataEnd) / 2;
    const minTime = center - visibleRange / 2;
    const maxTime = center + visibleRange / 2;

    // Use priority-based async zoom
    await Promise.all([
      this.zoomOptimizer.scheduleZoom(priceChart, 'zoom', { min: minTime, max: maxTime }, 'high'),
      this.zoomOptimizer.scheduleZoom(volumeChart, 'zoom', { min: minTime, max: maxTime }, 'high')
    ]);
  }

  // 3. Responsive pan with auto-adjustment
  async responsivePan(direction: 'left' | 'right', sensitivity: number = 0.15): Promise<void> {
    const priceChart = this.priceChartComponent?.chart;
    const volumeChart = this.volumeChartComponent?.chart;
    
    if (!priceChart || !volumeChart) return;

    const xAxis = priceChart.scales['x'];
    if (!xAxis) return;

    const range = xAxis.max - xAxis.min;
    const panAmount = range * sensitivity * (direction === 'left' ? -1 : 1);

    // Use debounced async pan for smooth experience
    this.zoomOptimizer.debounceZoom('responsive-pan', async () => {
      await Promise.all([
        this.zoomOptimizer.scheduleZoom(priceChart, 'pan', { deltaX: panAmount }, 'high'),
        this.zoomOptimizer.scheduleZoom(volumeChart, 'pan', { deltaX: panAmount }, 'high')
      ]);
    }, 8); // Higher frequency for pan operations
  }

  // 4. Batch zoom operations for multiple time periods
  async batchZoomToTimeframes(): Promise<void> {
    const timeframes = [
      { name: '1H', hours: 1 },
      { name: '4H', hours: 4 },
      { name: '1D', hours: 24 },
      { name: '1W', hours: 168 }
    ];

    const priceChart = this.priceChartComponent?.chart;
    const volumeChart = this.volumeChartComponent?.chart;
    
    if (!priceChart || !volumeChart) return;

    // Precompute all zoom levels asynchronously
    const zoomPromises = timeframes.map(async (tf) => {
      const endTime = Date.now();
      const startTime = endTime - (tf.hours * 60 * 60 * 1000);
      
      return {
        name: tf.name,
        boundaries: { min: startTime, max: endTime }
      };
    });

    const zoomLevels = await Promise.all(zoomPromises);
    
    // Cache the precomputed zoom levels for instant switching
    zoomLevels.forEach(level => {
      const cacheKey = `timeframe_${level.name}`;
      (this.chartService as any).zoomCache.set(cacheKey, level.boundaries);
    });

    console.log('✅ Batch zoom levels precomputed and cached');
  }

  // 5. Viewport-aware zoom optimization
  async optimizeForViewport(): Promise<void> {
    const priceChart = this.priceChartComponent?.chart;
    
    if (!priceChart || !priceChart.canvas) return;

    const canvas = priceChart.canvas;
    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasWidth = canvas.clientWidth * devicePixelRatio;
    
    // Adjust zoom behavior based on viewport size
    let zoomSensitivity: number;
    let decimationThreshold: number;
    
    if (canvasWidth < 400) {
      // Mobile: High decimation, low sensitivity
      zoomSensitivity = 0.05;
      decimationThreshold = 500;
    } else if (canvasWidth < 800) {
      // Tablet: Medium decimation, medium sensitivity  
      zoomSensitivity = 0.08;
      decimationThreshold = 1000;
    } else {
      // Desktop: Low decimation, high sensitivity
      zoomSensitivity = 0.1;
      decimationThreshold = 2000;
    }

    // Apply viewport-optimized settings
    (this.chartService as any).ZOOM_THROTTLE_MS = canvasWidth < 400 ? 32 : 16;
    
    console.log(`📱 Viewport optimization applied: ${canvasWidth}px, sensitivity: ${zoomSensitivity}`);
  }

  // 6. Performance monitoring
  monitorZoomPerformance(): void {
    const startTime = performance.now();
    
    // Hook into zoom events to measure performance
    const originalOnZoom = (this.priceChartComponent?.chart as any)?.options?.plugins?.zoom?.zoom?.onZoom;
    
    if (originalOnZoom) {
      (this.priceChartComponent.chart as any).options.plugins.zoom.zoom.onZoom = (ctx: any) => {
        const zoomStartTime = performance.now();
        
        // Call original zoom handler
        const result = originalOnZoom(ctx);
        
        const zoomEndTime = performance.now();
        const zoomDuration = zoomEndTime - zoomStartTime;
        
        // Log performance metrics
        if (zoomDuration > 16) { // Slower than 60fps
          console.warn(`⚠️ Slow zoom detected: ${zoomDuration.toFixed(2)}ms`);
        } else {
          console.log(`⚡ Fast zoom: ${zoomDuration.toFixed(2)}ms`);
        }
        
        return result;
      };
    }
  }

  ngOnDestroy(): void {
    // Cleanup async zoom resources
    this.chartService.destroy();
  }
}

/**
 * Usage Examples:
 * 
 * // Basic async zoom
 * await this.zoomToDateRangeAsync(new Date('2023-01-01'), new Date('2023-01-02'));
 * 
 * // Smart zoom to show 25% of data
 * await this.smartZoom(0.25);
 * 
 * // Responsive pan left
 * await this.responsivePan('left', 0.1);
 * 
 * // Precompute common timeframes
 * await this.batchZoomToTimeframes();
 * 
 * // Optimize for current device
 * await this.optimizeForViewport();
 */