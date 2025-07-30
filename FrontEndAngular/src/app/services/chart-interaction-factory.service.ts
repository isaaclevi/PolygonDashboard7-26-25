import { Injectable } from '@angular/core';
import { Chart } from 'chart.js';
import { ZoomOptimizerService } from './zoom-optimizer.service';

export interface ChartInteractionConfig {
  chartType: 'price' | 'volume';
  enableSync: boolean;
  requireCtrlForZoom: boolean;
  panSensitivity: number;
  zoomSensitivity: number;
}

export interface ZoomHandler {
  onZoomStart: (ctx: any) => any;
  onZoom: (ctx: any) => any;
  onZoomComplete?: (ctx: any) => any;
}

export interface PanHandler {
  onPanStart: (ctx: any) => boolean;
  onPan: (ctx: any) => boolean;
  onPanComplete?: (ctx: any) => void;
}

@Injectable({
  providedIn: 'root'
})
export class ChartInteractionFactory {
  private readonly ZOOM_THROTTLE_MS = 16; // ~60fps
  private lastZoomTime = 0;
  private readonly chartReferences = new Map<string, Chart>();

  constructor(private readonly zoomOptimizer: ZoomOptimizerService) {}

  /**
   * Factory method to create zoom configuration for a chart
   */
  createZoomConfiguration(config: ChartInteractionConfig): any {
    return {
      wheel: {
        enabled: false, // Disable built-in wheel zoom to implement custom hover+Ctrl logic
        speed: config.zoomSensitivity,
        modifierKey: config.requireCtrlForZoom ? 'ctrl' : undefined
      },
      drag: {
        enabled: false, // Disable drag zoom to prevent interference with pan
        backgroundColor: 'rgba(225,225,225,0.3)',
        borderColor: 'rgba(225,225,225)',
        borderWidth: 1
      },
      pinch: {
        enabled: true
      },
      mode: 'x',
      // Enable zoom functionality programmatically
      limits: {
        x: {min: 'original', max: 'original'}
      },
      ...this.createZoomHandler(config)
    };
  }

  /**
   * Factory method to create pan configuration for a chart
   */
  createPanConfiguration(config: ChartInteractionConfig): any {
    return {
      enabled: true,
      mode: 'x',
      modifierKey: undefined, // No modifier key required for panning
      threshold: 10, // Minimum distance to start panning
      scaleMode: 'x', // Only pan on x-axis
      rangeMin: {
        x: null // Allow panning to any minimum
      },
      rangeMax: {
        x: null // Allow panning to any maximum
      },
      ...this.createPanHandler(config)
    };
  }

  /**
   * Factory method to create zoom handlers
   */
  private createZoomHandler(config: ChartInteractionConfig): ZoomHandler {
    const chartType = config.chartType;
    const enableSync = config.enableSync;

    return {
      onZoomStart: (ctx: any) => {
        // Set zoom event flag to prevent sync loops
        ctx.chart[`${chartType}ChartZoomEvent`] = true;
        console.log(`🔍 Zoom start - ${chartType} chart`);
        return undefined;
      },

      onZoom: (ctx: any) => {
        // Throttle zoom events for performance
        const now = performance.now();
        if (now - this.lastZoomTime < this.ZOOM_THROTTLE_MS) {
          return;
        }
        this.lastZoomTime = now;

        const chart = ctx.chart;
        const xAxis = chart.scales['x'];
        
        console.log(`📊 Zoom event - ${chartType} chart:`, { min: xAxis.min, max: xAxis.max });

        // Sync with paired chart if enabled
        if (enableSync) {
          this.syncZoomWithPairedChart(chart, chartType, { min: xAxis.min, max: xAxis.max });
        }

        // Emit event for time scale updates
        this.notifyTimeRangeChanged(chart, { min: xAxis.min, max: xAxis.max });

        // Reset zoom event flag
        chart[`${chartType}ChartZoomEvent`] = false;
        return undefined;
      },

      onZoomComplete: (ctx: any) => {
        console.log(`✅ Zoom complete - ${chartType} chart`);
        ctx.chart[`${chartType}ChartZoomEvent`] = false;
        
        // Final time range update
        const xAxis = ctx.chart.scales['x'];
        this.notifyTimeRangeChanged(ctx.chart, { min: xAxis.min, max: xAxis.max });
      }
    };
  }

  /**
   * Factory method to create pan handlers
   */
  private createPanHandler(config: ChartInteractionConfig): PanHandler {
    const chartType = config.chartType;
    const enableSync = config.enableSync;
    const sensitivity = config.panSensitivity;

    return {
      onPanStart: (ctx: any) => {
        console.log(`👆 Pan start - ${chartType} chart`);
        // Allow the pan to start
        return true;
      },

      onPan: (ctx: any) => {
        const chart = ctx.chart;
        
        // Basic validation - allow pan to proceed even if delta is not available
        // This ensures the built-in pan functionality still works
        if (!ctx) {
          console.warn(`⚠️ Invalid pan context for ${chartType} chart`);
          return false;
        }

        // Log pan event for debugging
        console.log(`📊 Pan event - ${chartType} chart:`, ctx);

        // If we have delta information, sync with paired chart
        if (enableSync && ctx.delta && typeof ctx.delta.x === 'number') {
          const scaledDelta = ctx.delta.x * sensitivity;
          if (Math.abs(scaledDelta) > 0.1) {
            this.syncPanWithPairedChart(chart, chartType, scaledDelta);
          }
        }

        // Notify time range changes during pan
        const xAxis = chart.scales['x'];
        if (xAxis && typeof xAxis.min === 'number' && typeof xAxis.max === 'number') {
          this.notifyTimeRangeChanged(chart, { min: xAxis.min, max: xAxis.max });
        }

        // Always return true to allow the built-in pan functionality
        return true;
      },

      onPanComplete: (ctx: any) => {
        console.log(`✅ Pan complete - ${chartType} chart`);
        if (ctx && ctx.chart) {
          ctx.chart[`${chartType}ChartPanEvent`] = false;
          
          // Final time range update after pan
          const xAxis = ctx.chart.scales['x'];
          if (xAxis && typeof xAxis.min === 'number' && typeof xAxis.max === 'number') {
            this.notifyTimeRangeChanged(ctx.chart, { min: xAxis.min, max: xAxis.max });
          }
        }
      }
    };
  }

  /**
   * Register a chart for cross-chart synchronization and set up custom wheel handling
   */
  registerChart(chartId: string, chart: Chart, chartType: 'price' | 'volume'): void {
    this.chartReferences.set(chartId, chart);
    (chart as any).chartType = chartType;
    (chart as any).chartId = chartId;
    
    // Set up custom wheel event handling for hover+Ctrl zoom
    this.setupCustomWheelHandling(chart, chartType);
    
    console.log(`📋 Chart registered: ${chartId} (${chartType})`);
  }

  /**
   * Set up custom wheel event handling that requires hover + Ctrl + wheel for zoom
   */
  private setupCustomWheelHandling(chart: Chart, chartType: 'price' | 'volume'): void {
    const canvas = chart.canvas;
    if (!canvas) return;

    let isHovering = false;

    // Track mouse enter/leave for hover state
    canvas.addEventListener('mouseenter', () => {
      isHovering = true;
    });

    canvas.addEventListener('mouseleave', () => {
      isHovering = false;
    });

    // Custom wheel event handler
    canvas.addEventListener('wheel', (event: WheelEvent) => {
      // Only zoom if hovering over chart AND Ctrl is pressed while wheel is rolling
      if (isHovering && event.ctrlKey) {
        event.preventDefault();
        event.stopPropagation();
        
        // Perform zoom using the zoom plugin API
        const zoomLevel = event.deltaY > 0 ? 0.9 : 1.1; // Zoom out or in
        
        try {
          // Use zoomScale API (matches existing working code)
          if ((chart as any).zoomScale && typeof (chart as any).zoomScale === 'function') {
            const xAxis = chart.scales['x'];
            if (xAxis && typeof xAxis.min === 'number' && typeof xAxis.max === 'number') {
              const range = xAxis.max - xAxis.min;
              const center = (xAxis.max + xAxis.min) / 2;
              const newRange = range * (1 / zoomLevel);
              
              const newMin = center - newRange / 2;
              const newMax = center + newRange / 2;
              
              (chart as any).zoomScale('x', { min: newMin, max: newMax }, 'none');
            }
          }
          // Fallback: manual zoom by adjusting scales directly
          else {
            const xAxis = chart.scales['x'];
            if (xAxis && typeof xAxis.min === 'number' && typeof xAxis.max === 'number') {
              const range = xAxis.max - xAxis.min;
              const center = (xAxis.max + xAxis.min) / 2;
              const newRange = range * (1 / zoomLevel);
              
              xAxis.min = center - newRange / 2;
              xAxis.max = center + newRange / 2;
              
              chart.update('none');
            }
          }
        } catch (error) {
          console.error(`⚠️ Custom zoom error for ${chartType} chart:`, error);
        }
      }
      // If not hovering or Ctrl not pressed, let normal page scrolling happen
    }, { passive: false });
  }

  /**
   * Link two charts for synchronization
   */
  linkCharts(priceChart: Chart, volumeChart: Chart): void {
    (priceChart as any).volumeChart = volumeChart;
    (volumeChart as any).priceChart = priceChart;
    console.log('🔗 Charts linked for synchronization');
  }

  /**
   * Sync zoom operation with paired chart
   */
  private syncZoomWithPairedChart(sourceChart: Chart, sourceType: 'price' | 'volume', zoomParams: { min: number, max: number }): void {
    const pairedChart = sourceType === 'price' 
      ? (sourceChart as any).volumeChart 
      : (sourceChart as any).priceChart;

    if (!pairedChart) {
      console.warn(`⚠️ No paired chart found for ${sourceType} chart sync`);
      return;
    }

    const pairedType = sourceType === 'price' ? 'volume' : 'price';
    
    // Prevent sync loops
    if (pairedChart[`${pairedType}ChartZoomEvent`]) {
      return;
    }

    try {
      console.log(`🔄 Syncing zoom: ${sourceType} → ${pairedType}`, zoomParams);
      
      // Set flag to prevent sync loop
      pairedChart[`${pairedType}ChartZoomEvent`] = true;
      
      // Direct synchronization for immediate response
      const pairedXAxis = pairedChart.scales['x'];
      if (pairedXAxis) {
        pairedXAxis.min = zoomParams.min;
        pairedXAxis.max = zoomParams.max;
        pairedChart.update('none'); // Use 'none' for fastest update
        
        console.log(`✅ ${pairedType} chart synchronized to:`, { 
          min: new Date(zoomParams.min).toISOString(), 
          max: new Date(zoomParams.max).toISOString() 
        });
      }
      
      // Reset flag after a brief delay
      setTimeout(() => {
        pairedChart[`${pairedType}ChartZoomEvent`] = false;
      }, 50);
      
    } catch (error) {
      console.warn('⚠️ Chart zoom sync error:', error);
      pairedChart[`${pairedType}ChartZoomEvent`] = false;
    }
  }

  /**
   * Sync pan operation with paired chart
   */
  private syncPanWithPairedChart(sourceChart: Chart, sourceType: 'price' | 'volume', deltaX: number): void {
    const pairedChart = sourceType === 'price' 
      ? (sourceChart as any).volumeChart 
      : (sourceChart as any).priceChart;

    if (!pairedChart) {
      console.warn(`⚠️ No paired chart found for ${sourceType} chart sync`);
      return;
    }

    const pairedType = sourceType === 'price' ? 'volume' : 'price';
    
    // Prevent sync loops
    if (pairedChart[`${pairedType}ChartPanEvent`]) {
      return;
    }

    try {
      console.log(`🔄 Syncing pan: ${sourceType} → ${pairedType}, deltaX=${deltaX}`);
      
      // Set flag to prevent sync loop
      pairedChart[`${pairedType}ChartPanEvent`] = true;
      
      // Get the current range from source chart for exact synchronization
      const sourceXAxis = sourceChart.scales['x'];
      const pairedXAxis = pairedChart.scales['x'];
      
      if (!sourceXAxis || !pairedXAxis || 
          typeof sourceXAxis.min !== 'number' || typeof sourceXAxis.max !== 'number') {
        return;
      }

      // Direct synchronization - copy exact time range from source chart
      pairedXAxis.min = sourceXAxis.min;
      pairedXAxis.max = sourceXAxis.max;
      pairedChart.update('none'); // Use 'none' for fastest update
      
      console.log(`✅ ${pairedType} chart pan synchronized to:`, { 
        min: new Date(sourceXAxis.min).toISOString(), 
        max: new Date(sourceXAxis.max).toISOString() 
      });
      
      // Reset flag after brief delay
      setTimeout(() => {
        pairedChart[`${pairedType}ChartPanEvent`] = false;
      }, 50);
      
    } catch (error) {
      console.warn('⚠️ Chart pan sync error:', error);
      pairedChart[`${pairedType}ChartPanEvent`] = false;
    }
  }

  /**
   * Create a complete interaction configuration for a chart
   */
  createChartInteractionConfig(config: ChartInteractionConfig): any {
    const panConfig = this.createPanConfiguration(config);
    const zoomConfig = this.createZoomConfiguration(config);
    
    console.log(`📊 Creating chart interaction config for ${config.chartType}:`, {
      pan: panConfig,
      zoom: zoomConfig
    });
    
    return {
      plugins: {
        zoom: {
          pan: panConfig,
          zoom: zoomConfig
        }
      }
    };
  }

  /**
   * Create independent chart interaction (no sync)
   */
  createIndependentInteraction(chartType: 'price' | 'volume', requireCtrlForZoom: boolean = true): any {
    const config: ChartInteractionConfig = {
      chartType,
      enableSync: false,
      requireCtrlForZoom,
      panSensitivity: 1.0,
      zoomSensitivity: 0.1
    };

    return this.createChartInteractionConfig(config);
  }

  /**
   * Create synchronized chart interaction
   */
  createSynchronizedInteraction(chartType: 'price' | 'volume', requireCtrlForZoom: boolean = true): any {
    const config: ChartInteractionConfig = {
      chartType,
      enableSync: true,
      requireCtrlForZoom,
      panSensitivity: 1.0,
      zoomSensitivity: 0.1
    };

    const result = this.createChartInteractionConfig(config);
    
    // Add simplified fallback configuration to ensure pan works
    if (!result.plugins.zoom.pan.enabled) {
      console.warn(`⚠️ Pan not enabled for ${chartType}, using fallback configuration`);
      result.plugins.zoom.pan = {
        enabled: true,
        mode: 'x',
        modifierKey: null
      };
    }
    
    return result;
  }

  /**
   * Debug method to test pan functionality
   */
  testPanFunctionality(chartId: string): void {
    const chart = this.chartReferences.get(chartId);
    if (!chart) {
      console.error(`❌ Chart ${chartId} not found for pan test`);
      return;
    }
    
    const zoomPlugin = chart.config.plugins?.find((p: any) => p.id === 'zoom');
    console.log('📊 Pan test for chart:', chartId, {
      hasZoomPlugin: !!zoomPlugin,
      panEnabled: (chart as any).options?.plugins?.zoom?.pan?.enabled,
      panMode: (chart as any).options?.plugins?.zoom?.pan?.mode,
      chartType: (chart as any).chartType
    });
    
    // Test programmatic pan
    try {
      if ((chart as any).pan) {
        console.log('📊 Testing programmatic pan');
        (chart as any).pan({ x: 50 });
      } else {
        console.warn('⚠️ No pan method available on chart');
      }
    } catch (error) {
      console.error('❌ Pan test failed:', error);
    }
  }
  
  /**
   * Notify time range changes for time scale updates
   */
  private notifyTimeRangeChanged(chart: Chart, timeRange: { min: number, max: number }): void {
    // Emit custom event that can be listened to by parent components
    const event = new CustomEvent('timeRangeChanged', {
      detail: {
        chartId: (chart as any).id,
        chartType: (chart as any).chartType,
        timeRange
      }
    });
    
    if (chart.canvas) {
      chart.canvas.dispatchEvent(event);
    }
  }

  /**
   * Cleanup method
   */
  destroy(): void {
    this.chartReferences.clear();
    console.log('🧹 ChartInteractionFactory destroyed');
  }
}