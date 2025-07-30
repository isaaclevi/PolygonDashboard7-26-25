import { Injectable } from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { CandlestickController, CandlestickElement, OhlcController, OhlcElement } from 'chartjs-chart-financial';
import zoomPlugin from 'chartjs-plugin-zoom';
import { DualChartData } from '../models/stock-data.interface';
import { ChartColorConfig } from '../models/chart-config.interface';
import { ZoomOptimizerService } from './zoom-optimizer.service';
import { ChartInteractionFactory } from './chart-interaction-factory.service';

// Strategy Pattern for different chart types
abstract class ChartStrategy {
  abstract createChart(canvasId: string, data: DualChartData, colors: ChartColorConfig): Chart;
  abstract getChartType(): string;
}

class PriceChartStrategy extends ChartStrategy {
  constructor(
    private interactionFactory: ChartInteractionFactory,
    private activeCharts: Map<string, Chart>
  ) {
    super();
  }

  createChart(canvasId: string, data: DualChartData, colors: ChartColorConfig): Chart {
    if (!data.priceData || data.priceData.length === 0) {
      console.warn(`Price chart: No data available for ${data.symbol}, creating empty chart`);
      return this.createEmptyChart(canvasId, `${data.symbol} Price - No Data Available`, colors);
    }

    const config: ChartConfiguration = {
      type: 'candlestick',
      data: {
        datasets: [{
          label: `${data.symbol} Price`,
          data: data.priceData,
          borderColor: (ctx: any) => {
            if (!ctx.raw || typeof ctx.raw.o === 'undefined' || typeof ctx.raw.c === 'undefined') {
              return colors.price.up;
            }
            const o = ctx.raw.o;
            const c = ctx.raw.c;
            return c >= o ? colors.price.up : colors.price.down;
          },
          backgroundColor: (ctx: any) => {
            if (!ctx.raw || typeof ctx.raw.o === 'undefined' || typeof ctx.raw.c === 'undefined') {
              return colors.price.up;
            }
            const o = ctx.raw.o;
            const c = ctx.raw.c;
            return c >= o ? colors.price.up : colors.price.down;
          },
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'day'
            },
            grid: {
              color: colors.grid
            },
            ticks: {
              color: colors.text
            }
          },
          y: {
            type: 'linear',
            position: 'left',
            grid: {
              color: colors.grid
            },
            ticks: {
              color: colors.text
            }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: colors.text
            }
          },
          ...this.interactionFactory.createSynchronizedInteraction('price', true).plugins
        },
        onHover: (event, activeElements, chart) => {
          const canvas = chart.canvas;
          if (canvas) {
            canvas.style.cursor = activeElements.length > 0 ? 'crosshair' : 'grab';
          }
        }
      }
    };

    return this.buildChart(canvasId, config, data.symbol, 'price');
  }

  getChartType(): string {
    return 'price';
  }

  private buildChart(canvasId: string, config: ChartConfiguration, symbol: string, type: string): Chart {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
      console.error(`Canvas element with ID '${canvasId}' not found`);
      throw new Error(`Canvas element with ID '${canvasId}' not found`);
    }
    
    console.log(`Creating ${type} chart on canvas: ${canvasId}`);
    const chart = new Chart(canvas, config);
    
    (chart as any).chartType = type;
    
    const chartId = canvasId || `${type}_${Date.now()}`;
    this.activeCharts.set(chartId, chart);
    (chart as any).id = chartId;
    
    this.interactionFactory.registerChart(chartId, chart, type as 'price' | 'volume');
    
    return chart;
  }

  private createEmptyChart(canvasId: string, title: string, colors: ChartColorConfig): Chart {
    const config: ChartConfiguration = {
      type: 'line',
      data: {
        datasets: [{
          label: title,
          data: [],
          borderColor: colors.text,
          backgroundColor: colors.text
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'time',
            grid: {
              color: colors.grid
            },
            ticks: {
              color: colors.text
            }
          },
          y: {
            type: 'linear',
            grid: {
              color: colors.grid
            },
            ticks: {
              color: colors.text
            }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: colors.text
            }
          },
          title: {
            display: true,
            text: 'No data available for the selected period',
            color: colors.text
          }
        }
      }
    };

    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
      console.error(`Canvas element with ID '${canvasId}' not found`);
      throw new Error(`Canvas element with ID '${canvasId}' not found`);
    }
    
    console.log(`Creating empty chart on canvas: ${canvasId}`);
    const chart = new Chart(canvas, config);
    
    const chartId = canvasId || `empty_${Date.now()}`;
    this.activeCharts.set(chartId, chart);
    (chart as any).id = chartId;
    
    return chart;
  }
}

class VolumeChartStrategy extends ChartStrategy {
  constructor(
    private interactionFactory: ChartInteractionFactory,
    private activeCharts: Map<string, Chart>
  ) {
    super();
  }

  createChart(canvasId: string, data: DualChartData, colors: ChartColorConfig): Chart {
    if (!data.volumeData || data.volumeData.length === 0) {
      console.warn(`Volume chart: No data available for ${data.symbol}, creating empty chart`);
      return this.createEmptyChart(canvasId, `${data.symbol} Volume - No Data Available`, colors);
    }

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        datasets: [{
          label: `${data.symbol} Volume`,
          data: data.volumeData,
          yAxisID: 'y1',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'day'
            },
            grid: {
              color: colors.grid
            },
            ticks: {
              color: colors.text
            }
          },
          y1: {
            type: 'linear',
            position: 'right',
            grid: {
              drawOnChartArea: false,
            },
            ticks: {
              color: colors.text
            }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: colors.text
            }
          },
          ...this.interactionFactory.createSynchronizedInteraction('volume', true).plugins
        },
        onHover: (event, activeElements, chart) => {
          const canvas = chart.canvas;
          if (canvas) {
            canvas.style.cursor = activeElements.length > 0 ? 'crosshair' : 'grab';
          }
        }
      }
    };

    return this.buildChart(canvasId, config, data.symbol, 'volume');
  }

  getChartType(): string {
    return 'volume';
  }

  private buildChart(canvasId: string, config: ChartConfiguration, symbol: string, type: string): Chart {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
      console.error(`Canvas element with ID '${canvasId}' not found`);
      throw new Error(`Canvas element with ID '${canvasId}' not found`);
    }
    
    console.log(`Creating ${type} chart on canvas: ${canvasId}`);
    const chart = new Chart(canvas, config);
    
    (chart as any).chartType = type;
    
    const chartId = canvasId || `${type}_${Date.now()}`;
    this.activeCharts.set(chartId, chart);
    (chart as any).id = chartId;
    
    this.interactionFactory.registerChart(chartId, chart, type as 'price' | 'volume');
    
    return chart;
  }

  private createEmptyChart(canvasId: string, title: string, colors: ChartColorConfig): Chart {
    const config: ChartConfiguration = {
      type: 'line',
      data: {
        datasets: [{
          label: title,
          data: [],
          borderColor: colors.text,
          backgroundColor: colors.text
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'time',
            grid: {
              color: colors.grid
            },
            ticks: {
              color: colors.text
            }
          },
          y: {
            type: 'linear',
            grid: {
              color: colors.grid
            },
            ticks: {
              color: colors.text
            }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: colors.text
            }
          },
          title: {
            display: true,
            text: 'No data available for the selected period',
            color: colors.text
          }
        }
      }
    };

    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
      console.error(`Canvas element with ID '${canvasId}' not found`);
      throw new Error(`Canvas element with ID '${canvasId}' not found`);
    }
    
    console.log(`Creating empty chart on canvas: ${canvasId}`);
    const chart = new Chart(canvas, config);
    
    const chartId = canvasId || `empty_${Date.now()}`;
    this.activeCharts.set(chartId, chart);
    (chart as any).id = chartId;
    
    return chart;
  }
}

// Factory Pattern for Chart Strategy creation
class ChartStrategyFactory {
  static createStrategy(type: 'price' | 'volume', interactionFactory: ChartInteractionFactory, activeCharts: Map<string, Chart>): ChartStrategy {
    switch (type) {
      case 'price':
        return new PriceChartStrategy(interactionFactory, activeCharts);
      case 'volume':
        return new VolumeChartStrategy(interactionFactory, activeCharts);
      default:
        throw new Error(`Unknown chart strategy type: ${type}`);
    }
  }
}

@Injectable({
  providedIn: 'root'
})
export class ChartService {
  private keyboardListenerAdded = false;
  private zoomWorker: Worker | null = null;
  private activeCharts = new Map<string, Chart>();
  private zoomCache = new Map<string, any>();
  private lastZoomTime = 0;
  private readonly ZOOM_THROTTLE_MS = 16;
  private chartStrategies = new Map<string, ChartStrategy>();

  constructor(
    private zoomOptimizer: ZoomOptimizerService,
    private interactionFactory: ChartInteractionFactory
  ) {
    this.initializeChartJS();
    this.initializeStrategies();
    this.setupGlobalKeyboardListener();
  }
  
  private initializeChartJS(): void {
    Chart.register(
      CandlestickController, 
      CandlestickElement, 
      OhlcController, 
      OhlcElement, 
      zoomPlugin, 
      ...registerables
    );
    
    if (Chart.registry.plugins.get('zoom')) {
      console.log('✅ Chart.js zoom plugin registered successfully');
    } else {
      console.warn('⚠️ Chart.js zoom plugin not found - manual panning will be used');
    }
  }
  
  private initializeStrategies(): void {
    this.chartStrategies.set('price', ChartStrategyFactory.createStrategy('price', this.interactionFactory, this.activeCharts));
    this.chartStrategies.set('volume', ChartStrategyFactory.createStrategy('volume', this.interactionFactory, this.activeCharts));
  }

  private setupGlobalKeyboardListener(): void {
    if (this.keyboardListenerAdded) return;
    
    document.addEventListener('keydown', (event) => {
      this.handleKeyboardNavigation(event);
    });
    this.keyboardListenerAdded = true;
  }

  private handleKeyboardNavigation(event: KeyboardEvent): void {
    // Only handle navigation when chart is focused or no specific element is focused
    const activeElement = document.activeElement;
    if (activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName)) {
      return; // Don't interfere with form inputs
    }

    const charts = this.getAllActiveCharts();
    if (charts.length === 0) return;

    const panDistance = 0.08; // Reduced from 0.1 to 0.08 for more responsive panning
    let handled = false;

    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        charts.forEach(chart => this.panChart(chart, -panDistance));
        handled = true;
        break;
      case 'ArrowRight':
        event.preventDefault();
        charts.forEach(chart => this.panChart(chart, panDistance));
        handled = true;
        break;
      case 'Home':
        event.preventDefault();
        charts.forEach(chart => this.panToStart(chart));
        handled = true;
        break;
      case 'End':
        event.preventDefault();
        charts.forEach(chart => this.panToEnd(chart));
        handled = true;
        break;
      case 'Escape':
        event.preventDefault();
        charts.forEach(chart => this.resetZoom(chart));
        handled = true;
        break;
    }

    if (handled) {
      console.log('🎯 Chart navigation: ' + event.key);
    }
  }

  private getAllActiveCharts(): Chart[] {
    const charts: Chart[] = [];
    
    try {
      // Try to access Chart.instances safely
      const instances = (Chart as any).instances;
      
      if (instances && typeof instances['forEach'] === 'function') {
        // Chart.instances is iterable (Map)
        instances['forEach']((chart: any) => {
          if (chart && typeof chart.destroy === 'function' && !(chart as any)._destroyed) {
            charts.push(chart);
          }
        });
      } else if (instances && typeof instances['values'] === 'function') {
        // Chart.instances is a Map with values() method
        const chartValues = instances['values']();
        for (const chart of chartValues) {
          if (chart && typeof chart.destroy === 'function' && !(chart as any)._destroyed) {
            charts.push(chart as Chart);
          }
        }
      } else {
        // Fallback: Use our own chart tracking
        console.warn('⚠️ Chart.instances not available, using fallback chart tracking');
        this.activeCharts.forEach((chart, id) => {
          if (chart && typeof chart.destroy === 'function' && !(chart as any)._destroyed) {
            charts.push(chart);
          }
        });
      }
    } catch (error) {
      console.warn('⚠️ Error accessing Chart.instances, using fallback:', error);
      // Use our own chart tracking as fallback
      this.activeCharts.forEach((chart, id) => {
        if (chart && typeof chart.destroy === 'function' && !(chart as any)._destroyed) {
          charts.push(chart);
        }
      });
    }
    
    return charts;
  }

  private panChart(chart: Chart, direction: number): void {
    if (!chart) return;
    
    const xAxis = chart.scales['x'];
    if (!xAxis) return;

    const range = xAxis.max - xAxis.min;
    const panAmount = range * direction;
    
    // Use the zoom plugin's pan API directly
    try {
      if ((chart as any).zoom && typeof (chart as any).zoom.pan === 'function') {
        (chart as any).zoom.pan({ x: panAmount });
      }
    } catch (error) {
      console.warn('⚠️ Pan operation failed:', error);
    }
  }

  private panToStart(chart: Chart): void {
    if (!chart || !(chart as any).zoomScale) return;
    
    const xAxis = chart.scales['x'];
    if (!xAxis) return;

    // Get original data range
    const data = chart.data.datasets[0]?.data as any[];
    if (!data || data.length === 0) return;

    const firstPoint = data[0];
    const lastPoint = data[data.length - 1];
    
    if (firstPoint && firstPoint.x !== undefined) {
      const visibleRange = xAxis.max - xAxis.min;
      const startTime = new Date(firstPoint.x).getTime();
      (chart as any).zoomScale('x', { min: startTime, max: startTime + visibleRange }, 'default');
    }
  }

  private panToEnd(chart: Chart): void {
    if (!chart || !(chart as any).zoomScale) return;
    
    const xAxis = chart.scales['x'];
    if (!xAxis) return;

    // Get original data range
    const data = chart.data.datasets[0]?.data as any[];
    if (!data || data.length === 0) return;

    const lastPoint = data[data.length - 1];
    
    if (lastPoint && lastPoint.x !== undefined) {
      const visibleRange = xAxis.max - xAxis.min;
      const endTime = new Date(lastPoint.x).getTime();
      (chart as any).zoomScale('x', { min: endTime - visibleRange, max: endTime }, 'default');
    }
  }

  createPriceChart(canvasId: string, data: DualChartData, colors: ChartColorConfig): Chart {
    const strategy = this.chartStrategies.get('price');
    if (!strategy) {
      throw new Error('Price chart strategy not found');
    }
    return strategy.createChart(canvasId, data, colors);
  }

  createVolumeChart(canvasId: string, data: DualChartData, colors: ChartColorConfig): Chart {
    const strategy = this.chartStrategies.get('volume');
    if (!strategy) {
      throw new Error('Volume chart strategy not found');
    }
    return strategy.createChart(canvasId, data, colors);
  }

  /**
   * Reset zoom on a chart
   */
  resetZoom(chart: Chart): void {
    if (chart && (chart as any).resetZoom) {
      (chart as any).resetZoom();
    }
  }

  /**
   * Reset zoom on both charts simultaneously
   */
  resetZoomBoth(priceChart: Chart | undefined, volumeChart: Chart | undefined): void {
    if (priceChart && (priceChart as any).resetZoom) {
      (priceChart as any).resetZoom();
    }
    if (volumeChart && (volumeChart as any).resetZoom) {
      (volumeChart as any).resetZoom();
    }
  }

  /**
   * Pan to a specific date range on both charts
   */
  panToDateRange(priceChart: Chart | undefined, volumeChart: Chart | undefined, startDate: Date, endDate: Date): void {
    const startTime = startDate.getTime();
    const endTime = endDate.getTime();
    
    if (priceChart && (priceChart as any).zoomScale) {
      (priceChart as any).zoomScale('x', { min: startTime, max: endTime }, 'none');
    }
    if (volumeChart && (volumeChart as any).zoomScale) {
      (volumeChart as any).zoomScale('x', { min: startTime, max: endTime }, 'none');
    }
  }

  /**
   * Pan both charts left by a specified percentage
   */
  panLeft(priceChart: Chart | undefined, volumeChart: Chart | undefined, percent: number = 0.2): void {
    if (priceChart) {
      this.panChart(priceChart, -percent);
    }
    if (volumeChart) {
      this.panChart(volumeChart, -percent);
    }
  }

  /**
   * Pan both charts right by a specified percentage
   */
  panRight(priceChart: Chart | undefined, volumeChart: Chart | undefined, percent: number = 0.2): void {
    if (priceChart) {
      this.panChart(priceChart, percent);
    }
    if (volumeChart) {
      this.panChart(volumeChart, percent);
    }
  }

  /**
   * Establish cross-references between price and volume charts for synchronization
   */
  linkCharts(priceChart: Chart, volumeChart: Chart): void {
    (priceChart as any).volumeChart = volumeChart;
    (volumeChart as any).priceChart = priceChart;
    
    // Link charts in the interaction factory for synchronized interactions
    this.interactionFactory.linkCharts(priceChart, volumeChart);
  }

  private syncPanBetweenCharts(targetChart: Chart, deltaX: number): void {
    if (!targetChart || !deltaX || Math.abs(deltaX) < 0.1) return;
    
    try {
      const xAxis = targetChart.scales['x'];
      if (!xAxis || typeof xAxis.min !== 'number' || typeof xAxis.max !== 'number') {
        console.warn('⚠️ Invalid axis for sync pan');
        return;
      }
      
      // Get actual canvas width for accurate calculations
      const canvasWidth = targetChart.canvas?.clientWidth || targetChart.canvas?.width || 800;
      const range = xAxis.max - xAxis.min;
      
      // Improved delta calculation with responsive scaling
      const panPercent = deltaX / canvasWidth;
      const panAmount = range * panPercent * 0.8; // Reduced sensitivity for smoother panning
      
      console.log('🔄 Syncing charts - deltaX:', deltaX, 'panAmount:', panAmount);
      
      // Use async zoom optimizer for better performance
      this.zoomOptimizer.scheduleZoom(targetChart, 'pan', { deltaX: panAmount }, 'high');
      
    } catch (error) {
      console.error('❌ Chart sync error:', error);
    }
  }

  /**
   * Initialize web worker for heavy zoom calculations
   */
  private initializeZoomWorker(): void {
    if (!this.zoomWorker && typeof Worker !== 'undefined') {
      try {
        this.zoomWorker = new Worker('/assets/workers/zoom-worker.js');
        
        this.zoomWorker.onmessage = (e) => {
          const { type, data, metadata } = e.data;
          
          switch (type) {
            case 'visibleData':
              this.handleVisibleDataResult(data, metadata);
              break;
            case 'zoomBoundaries':
              this.handleZoomBoundariesResult(data, metadata);
              break;
            case 'precomputedLevels':
              this.handlePrecomputedLevelsResult(data, metadata);
              break;
            case 'error':
              console.warn('⚠️ Zoom worker error:', data.error);
              break;
          }
        };

        console.log('✅ Zoom worker initialized successfully');
      } catch (error) {
        console.warn('⚠️ Could not initialize zoom worker:', error);
      }
    }
  }

  /**
   * Async zoom with intelligent data decimation
   */
  async asyncZoom(chart: Chart, zoomParams: { min: number, max: number }): Promise<void> {
    if (!chart) return;

    // Initialize worker if not already done
    if (!this.zoomWorker) {
      this.initializeZoomWorker();
    }

    const chartId = chart.id || 'unknown';
    
    // Use debounced zoom for rapid operations
    this.zoomOptimizer.debounceZoom(chartId, async () => {
      try {
        // Check cache first
        const cacheKey = `${chartId}_${zoomParams.min}_${zoomParams.max}`;
        if (this.zoomCache.has(cacheKey)) {
          const cachedResult = this.zoomCache.get(cacheKey);
          this.applyZoomResult(chart, cachedResult);
          return;
        }

        // Calculate zoom level and decimation factor
        const data = chart.data.datasets[0]?.data as any[];
        if (!data || data.length === 0) return;

        const dataStart = new Date(data[0].x).getTime();
        const dataEnd = new Date(data[data.length - 1].x).getTime();
        const totalRange = dataEnd - dataStart;
        const visibleRange = zoomParams.max - zoomParams.min;
        const zoomRatio = visibleRange / totalRange;

        // Determine decimation factor based on zoom level
        let decimationFactor = 1;
        if (zoomRatio > 0.8) decimationFactor = 1;      // Show all points when zoomed out
        else if (zoomRatio > 0.5) decimationFactor = 2; // Show every 2nd point
        else if (zoomRatio > 0.2) decimationFactor = 5; // Show every 5th point  
        else decimationFactor = 10;                     // Show every 10th point when zoomed in

        // Use web worker for heavy calculations if available
        if (this.zoomWorker && data.length > 1000) {
          this.zoomWorker.postMessage({
            type: 'calculateVisibleData',
            data: {
              chartData: data,
              minTime: zoomParams.min,
              maxTime: zoomParams.max,
              decimationFactor
            }
          });
        } else {
          // Fallback to main thread for small datasets
          const visibleData = this.calculateVisibleDataSync(data, zoomParams.min, zoomParams.max, decimationFactor);
          this.applyZoomResult(chart, { data: visibleData, decimationFactor });
        }

      } catch (error) {
        console.error('❌ Async zoom failed:', error);
        // Fallback to traditional zoom
        this.performTraditionalZoom(chart, zoomParams);
      }
    }, 16); // 60fps debouncing
  }

  /**
   * Synchronous visible data calculation (fallback)
   */
  private calculateVisibleDataSync(data: any[], minTime: number, maxTime: number, decimationFactor: number): any[] {
    return data
      .filter(point => {
        const pointTime = new Date(point.x).getTime();
        return pointTime >= minTime && pointTime <= maxTime;
      })
      .filter((_, index) => index % decimationFactor === 0);
  }

  /**
   * Apply zoom result to chart
   */
  private applyZoomResult(chart: Chart, result: { data: any[], decimationFactor: number }): void {
    try {
      // Update chart data efficiently
      if (chart.data.datasets[0]) {
        chart.data.datasets[0].data = result.data;
      }

      // Use fastest update mode
      chart.update('none');
      
      console.log(`📊 Async zoom applied: ${result.data.length} points, decimation: ${result.decimationFactor}`);
    } catch (error) {
      console.error('❌ Failed to apply zoom result:', error);
    }
  }

  /**
   * Fallback traditional zoom
   */
  private performTraditionalZoom(chart: Chart, zoomParams: { min: number, max: number }): void {
    const xAxis = chart.scales['x'];
    if (xAxis) {
      xAxis.min = zoomParams.min;
      xAxis.max = zoomParams.max;
      chart.update('none');
    }
  }

  /**
   * Handle worker results
   */
  private handleVisibleDataResult(data: any[], metadata: any): void {
    // Find the chart that requested this data and apply the result
    // Implementation depends on how you track pending requests
    console.log('📊 Worker processed zoom:', metadata);
  }

  private handleZoomBoundariesResult(boundaries: any, metadata: any): void {
    console.log('🎯 Worker calculated boundaries:', boundaries, metadata);
  }

  private handlePrecomputedLevelsResult(levels: any[], metadata: any): void {
    console.log('⚡ Worker precomputed zoom levels:', levels.length, metadata);
  }

  /**
   * Remove a chart from tracking
   */
  removeChart(chart: Chart): void {
    if (!chart) return;
    
    const chartId = (chart as any).id;
    if (chartId && this.activeCharts.has(chartId)) {
      this.activeCharts.delete(chartId);
      console.log(`📊 Chart removed from tracking: ${chartId}`);
    }
    
    // Clean up chart-specific cache entries
    const keysToDelete: string[] = [];
    this.zoomCache.forEach((value, key) => {
      if (key.includes(chartId)) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.zoomCache.delete(key));
  }

  /**
   * Cleanup method
   */
  destroy(): void {
    if (this.zoomWorker) {
      this.zoomWorker.terminate();
      this.zoomWorker = null;
    }
    
    this.zoomOptimizer.destroy();
    this.interactionFactory.destroy();
    this.zoomCache.clear();
    this.activeCharts.clear();
  }
}
