import { Injectable } from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { CandlestickController, CandlestickElement, OhlcController, OhlcElement } from 'chartjs-chart-financial';
import zoomPlugin from 'chartjs-plugin-zoom';
import { DualChartData } from '../models/stock-data.interface';
import { ChartColorConfig } from '../models/chart-config.interface';

@Injectable({
  providedIn: 'root'
})
export class ChartService {
  private keyboardListenerAdded = false;

  constructor() {
    // Register all Chart.js components including zoom plugin
    Chart.register(
      CandlestickController, 
      CandlestickElement, 
      OhlcController, 
      OhlcElement, 
      zoomPlugin, 
      ...registerables
    );
    
    // Verify zoom plugin is registered
    if (Chart.registry.plugins.get('zoom')) {
      console.log('✅ Chart.js zoom plugin registered successfully');
    } else {
      console.warn('⚠️ Chart.js zoom plugin not found - manual panning will be used');
    }
    
    this.setupGlobalKeyboardListener();
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

    const panDistance = 0.1; // 10% of visible range
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
    // @ts-ignore - Chart.instances is available but types may not be complete
    Chart.instances.forEach((chart: any) => {
      if (chart && !chart.destroyed) {
        charts.push(chart);
      }
    });
    return charts;
  }

  private panChart(chart: Chart, direction: number): void {
    if (!chart) return;
    
    const xAxis = chart.scales['x'];
    if (!xAxis) return;

    const range = xAxis.max - xAxis.min;
    const panAmount = range * direction;
    
    // Use the improved pan method
    this.performPan(chart, panAmount);
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
    // Validate data exists and is not empty
    if (!data.priceData || data.priceData.length === 0) {
      console.warn(`Price chart: No data available for ${data.symbol}, creating empty chart`);
      return this.createEmptyChart(canvasId, `${data.symbol} Price - No Data Available`, colors);
    }

    // Bind the sync method to maintain proper context
    const syncPanBetweenCharts = this.syncPanBetweenCharts.bind(this);

    const config: ChartConfiguration = {
      type: 'candlestick',
      data: {
        datasets: [{
          label: `${data.symbol} Price`,
          data: data.priceData,
          borderColor: (ctx: any) => {
            if (!ctx.raw || typeof ctx.raw.o === 'undefined' || typeof ctx.raw.c === 'undefined') {
              return colors.price.up; // fallback color
            }
            const o = ctx.raw.o;
            const c = ctx.raw.c;
            return c >= o ? colors.price.up : colors.price.down;
          },
          backgroundColor: (ctx: any) => {
            if (!ctx.raw || typeof ctx.raw.o === 'undefined' || typeof ctx.raw.c === 'undefined') {
              return colors.price.up; // fallback color
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
          zoom: {
            pan: {
              enabled: true,
              mode: 'x',
              modifierKey: undefined, // Remove shift requirement for easier panning
              onPanStart: (ctx: any) => {
                // Custom pan start logic
                return true;
              },
              onPan: (ctx: any) => {
                console.log('Pan event received:', ctx);
                console.log('Event keys:', Object.keys(ctx || {}));
                
                if (ctx?.x !== undefined) {
                  console.log('Pan event received:', ctx);
                } else {
                  console.error('Expected x coordinate not found in event:', ctx);
                }
                // Sync with volume chart during pan
                const chart = ctx.chart;
                const xAxis = chart.scales['x'];
                if (chart.volumeChart && !chart.volumeChartPanEvent) {
                  chart.priceChartPanEvent = true;
                  syncPanBetweenCharts(chart.volumeChart, ctx.delta.x);
                  chart.priceChartPanEvent = false;
                }
                
              }
            },
            zoom: {
              wheel: {
                enabled: true,
                speed: 0.1
              },
              pinch: {
                enabled: true
              },
              mode: 'x',
              onZoomStart: (ctx: any) => {
                // Broadcast zoom event for chart synchronization
                ctx.chart.priceChartZoomEvent = true;
                return undefined;
              },
              onZoom: (ctx: any) => {
                // Store zoom state for synchronization
                const chart = ctx.chart;
                const xAxis = chart.scales['x'];
                if (chart.volumeChart && !chart.volumeChartZoomEvent) {
                  (chart.volumeChart as any).zoomScale('x', { min: xAxis.min, max: xAxis.max }, 'none');
                }
                chart.priceChartZoomEvent = false;
                return undefined;
              }
            }
          }
        },
        onHover: (event, activeElements, chart) => {
          // Change cursor when hovering over draggable area
          const canvas = chart.canvas;
          if (canvas) {
            canvas.style.cursor = activeElements.length > 0 ? 'crosshair' : 'grab';
          }
        }
      }
    };

    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
      console.error(`Canvas element with ID '${canvasId}' not found`);
      throw new Error(`Canvas element with ID '${canvasId}' not found`);
    }
    
    console.log(`Creating price chart on canvas: ${canvasId}`, data);
    const chart = new Chart(canvas, config);
    
    // Store reference for chart synchronization
    (chart as any).chartType = 'price';
    
    // Add mouse wheel horizontal scrolling when not zooming
    this.addMouseWheelScrolling(canvas, chart);
    
    return chart;
  }

  createVolumeChart(canvasId: string, data: DualChartData, colors: ChartColorConfig): Chart {
    // Validate data exists and is not empty
    if (!data.volumeData || data.volumeData.length === 0) {
      console.warn(`Volume chart: No data available for ${data.symbol}, creating empty chart`);
      return this.createEmptyChart(canvasId, `${data.symbol} Volume - No Data Available`, colors);
    }

    // Bind the sync method to maintain proper context
    const syncPanBetweenCharts = this.syncPanBetweenCharts.bind(this);

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
          zoom: {
            pan: {
              enabled: true,
              mode: 'x',
              modifierKey: undefined, // Remove shift requirement for easier panning
              onPanStart: (ctx: any) => {
                // Custom pan start logic
                return true;
              },
              onPan: (ctx: any) => {
                // Sync with price chart during pan
                const chart = ctx.chart;
                const xAxis = chart.scales['x'];
                if (chart.priceChart && !chart.priceChartPanEvent) {
                  chart.volumeChartPanEvent = true;
                  syncPanBetweenCharts(chart.priceChart, ctx.delta.x);
                  chart.volumeChartPanEvent = false;
                }
                return true;
              }
            },
            zoom: {
              wheel: {
                enabled: true,
                speed: 0.1
              },
              pinch: {
                enabled: true
              },
              mode: 'x',
              onZoomStart: (ctx: any) => {
                // Broadcast zoom event for chart synchronization
                ctx.chart.volumeChartZoomEvent = true;
                return undefined;
              },
              onZoom: (ctx: any) => {
                // Store zoom state for synchronization
                const chart = ctx.chart;
                const xAxis = chart.scales['x'];
                if (chart.priceChart && !chart.priceChartZoomEvent) {
                  (chart.priceChart as any).zoomScale('x', { min: xAxis.min, max: xAxis.max }, 'none');
                }
                chart.volumeChartZoomEvent = false;
                return undefined;
              }
            }
          }
        },
        onHover: (event, activeElements, chart) => {
          // Change cursor when hovering over draggable area
          const canvas = chart.canvas;
          if (canvas) {
            canvas.style.cursor = activeElements.length > 0 ? 'crosshair' : 'grab';
          }
        }
      }
    };

    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
      console.error(`Canvas element with ID '${canvasId}' not found`);
      throw new Error(`Canvas element with ID '${canvasId}' not found`);
    }
    
    console.log(`Creating volume chart on canvas: ${canvasId}`, data);
    const chart = new Chart(canvas, config);
    
    // Store reference for chart synchronization
    (chart as any).chartType = 'volume';
    
    // Add mouse wheel horizontal scrolling when not zooming
    this.addMouseWheelScrolling(canvas, chart);
    
    return chart;
  }

  private addMouseWheelScrolling(canvas: HTMLCanvasElement, chart: Chart): void {
    canvas.addEventListener('wheel', (event) => {
      // If Ctrl is pressed, let the zoom plugin handle it
      if (event.ctrlKey) {
        return; // Let the zoom plugin handle Ctrl+wheel zooming
      }
      
      event.preventDefault();
      
      // Calculate pan amount based on wheel delta
      const xAxis = chart.scales['x'];
      if (!xAxis) return;
      
      const range = xAxis.max - xAxis.min;
      const panPercent = 0.1; // 10% of visible range
      const panAmount = range * panPercent * Math.sign(event.deltaY);
      
      // Try different methods to pan the chart
      this.performPan(chart, panAmount);
    }, { passive: false });
  }

  private performPan(chart: Chart, panAmount: number): void {
    try {
      // Method 1: Try zoom plugin API
      if ((chart as any).zoom && typeof (chart as any).zoom.pan === 'function') {
        (chart as any).zoom.pan({ x: panAmount });
        return;
      }

      // Method 2: Try alternative zoom plugin API
      if ((chart as any).$zoom && typeof (chart as any).$zoom.pan === 'function') {
        (chart as any).$zoom.pan({ x: panAmount });
        return;
      }

      // Method 3: Try Chart.js zoom plugin helper
      if (typeof (chart as any).pan === 'function') {
        (chart as any).pan({ x: panAmount }, undefined, 'default');
        return;
      }

      // Method 4: Manual pan by updating scale limits (most reliable fallback)
      const xAxis = chart.scales['x'];
      if (xAxis && typeof xAxis.min === 'number' && typeof xAxis.max === 'number') {
        const newMin = xAxis.min + panAmount;
        const newMax = xAxis.max + panAmount;
        
        // Get the actual data range to prevent panning beyond data bounds
        const data = chart.data.datasets[0]?.data as any[];
        if (data && data.length > 0) {
          const dataStart = new Date(data[0].x).getTime();
          const dataEnd = new Date(data[data.length - 1].x).getTime();
          
          // Prevent panning beyond data boundaries
          const visibleRange = newMax - newMin;
          const clampedMin = Math.max(newMin, dataStart);
          const clampedMax = Math.min(newMax, dataEnd);
          
          // If we're at the boundaries, allow some padding
          const padding = visibleRange * 0.1;
          const finalMin = Math.max(clampedMin, dataStart - padding);
          const finalMax = Math.min(clampedMax, dataEnd + padding);
          
          xAxis.min = finalMin;
          xAxis.max = finalMax;
          chart.update('none');
          
          console.log('📊 Manual pan applied:', { 
            panAmount, 
            newRange: [finalMin, finalMax],
            method: 'manual_scale_update'
          });
        }
      } else {
        console.warn('⚠️ Unable to pan chart - no valid scale found');
      }

    } catch (error) {
      console.warn('⚠️ Chart panning failed:', error);
    }
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
    return new Chart(canvas, config);
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
  }

  private syncPanBetweenCharts(targetChart: Chart, deltaX: number): void {
    if (!targetChart) return;
    
    // Convert delta to actual pan amount
    const xAxis = targetChart.scales['x'];
    if (xAxis && typeof xAxis.min === 'number' && typeof xAxis.max === 'number') {
      const range = xAxis.max - xAxis.min;
      const panPercent = deltaX / (targetChart.canvas?.clientWidth || 800); // Normalize by canvas width
      const panAmount = range * panPercent;
      
      this.performPan(targetChart, panAmount);
    }
  }
}
