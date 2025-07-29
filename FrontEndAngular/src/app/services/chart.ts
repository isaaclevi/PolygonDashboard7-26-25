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

  constructor() {
    Chart.register(CandlestickController, CandlestickElement, OhlcController, OhlcElement, zoomPlugin, ...registerables);
  }

  createPriceChart(canvasId: string, data: DualChartData, colors: ChartColorConfig): Chart {
    // Validate data exists and is not empty
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
              modifierKey: 'shift'
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
                const xAxis = chart.scales.x;
                if (chart.volumeChart && !chart.volumeChartZoomEvent) {
                  (chart.volumeChart as any).zoomScale('x', { min: xAxis.min, max: xAxis.max }, 'none');
                }
                chart.priceChartZoomEvent = false;
                return undefined;
              }
            }
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
    
    return chart;
  }

  createVolumeChart(canvasId: string, data: DualChartData, colors: ChartColorConfig): Chart {
    // Validate data exists and is not empty
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
              modifierKey: 'shift'
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
                const xAxis = chart.scales.x;
                if (chart.priceChart && !chart.priceChartZoomEvent) {
                  (chart.priceChart as any).zoomScale('x', { min: xAxis.min, max: xAxis.max }, 'none');
                }
                chart.volumeChartZoomEvent = false;
                return undefined;
              }
            }
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
   * Establish cross-references between price and volume charts for synchronization
   */
  linkCharts(priceChart: Chart, volumeChart: Chart): void {
    (priceChart as any).volumeChart = volumeChart;
    (volumeChart as any).priceChart = priceChart;
  }
}
