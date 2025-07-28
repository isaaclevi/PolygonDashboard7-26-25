import { Injectable } from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { CandlestickController, CandlestickElement, OhlcController, OhlcElement } from 'chartjs-chart-financial';
import { DualChartData } from '../models/stock-data.interface';
import { ChartColorConfig } from '../models/chart-config.interface';

@Injectable({
  providedIn: 'root'
})
export class ChartService {

  constructor() {
    Chart.register(CandlestickController, CandlestickElement, OhlcController, OhlcElement, ...registerables);
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
    return new Chart(canvas, config);
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
    return new Chart(canvas, config);
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
}
