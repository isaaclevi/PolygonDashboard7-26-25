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
    const config: ChartConfiguration = {
      type: 'candlestick',
      data: {
        datasets: [{
          label: `${data.symbol} Price`,
          data: data.priceData,
          borderColor: (ctx: any) => {
            const o = ctx.raw.o;
            const c = ctx.raw.c;
            return c >= o ? colors.price.up : colors.price.down;
          },
          backgroundColor: (ctx: any) => {
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
    return new Chart(canvas, config);
  }

  createVolumeChart(canvasId: string, data: DualChartData, colors: ChartColorConfig): Chart {
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
    return new Chart(canvas, config);
  }
}
