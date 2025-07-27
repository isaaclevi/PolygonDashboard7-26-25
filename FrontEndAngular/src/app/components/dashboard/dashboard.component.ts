import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataControlsComponent } from '../data-controls/data-controls.component';
import { ChartContainerComponent } from '../dual-chart-display/chart-container/chart-container.component';
import { StockApiService } from '../../services/stock-api';
import { MockDataService, MockApiResponse } from '../../services/mock-data.service';
import { DualChartData, StockData } from '../../models/stock-data.interface';
import { ChartColorConfig } from '../../models/chart-config.interface';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DataControlsComponent, ChartContainerComponent, CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  chartData: DualChartData | null = null;
  chartColors: ChartColorConfig = {
    price: {
      up: '#00FF41',
      down: '#FF1744',
      wick: {
        up: '#00FF41',
        down: '#FF1744'
      }
    },
    volume: {
      buyDominant: '#2196F3',
      sellDominant: '#FF9500',
      gradient: {
        buyStart: '#1976D2',
        buyEnd: '#2196F3',
        sellStart: '#F57C00',
        sellEnd: '#FF9500'
      }
    },
    background: '#1a1a1a',
    grid: '#333333',
    text: '#FFFFFF'
  };

  constructor(
    private stockApiService: StockApiService,
    private mockDataService: MockDataService
  ) { }

  onGetData(event: { symbol: string, timeframe: string, startDate: string, endDate: string }) {
    console.log('📊 Dashboard: Data requested for', event);
    
    // Try backend first, fallback to mock data if backend fails
    this.stockApiService.getStockData(event.symbol, event.timeframe, event.startDate, event.endDate)
      .pipe(
        catchError(error => {
          console.warn('🔄 Backend not available, using mock data:', error);
          // Convert mock data to StockData format
          return this.mockDataService.getMockStockData(event.symbol, event.timeframe, event.startDate, event.endDate)
            .pipe(
              catchError(mockError => {
                console.error('❌ Mock data service failed:', mockError);
                return of([]); // Return empty array as last resort
              })
            );
        })
      )
      .subscribe(data => {
        console.log('✅ Data received:', data);
        
        // Handle different data formats (backend vs mock)
        if (data && typeof data === 'object' && 'data' in data) {
          // Mock data format with metadata wrapper
          const mockResponse = data as MockApiResponse;
          const stockData: StockData[] = mockResponse.data.map(item => ({
            symbol: mockResponse.metadata.symbol,
            timestamp: new Date(item.timestamp),
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            volume: item.volume,
            timeframe: mockResponse.metadata.timeframe as '1min' | '5min' | '1hour' | '1day'
          }));
          
          this.chartData = this.transformDataForChart(stockData, event.symbol, event.timeframe);
          console.log('📈 Chart data generated from mock service');
        } else if (Array.isArray(data)) {
          // Backend format (array of StockData)
          this.chartData = this.transformDataForChart(data as StockData[], event.symbol, event.timeframe);
          console.log('📈 Chart data generated from backend');
        } else {
          console.error('❌ Unknown data format received:', data);
        }
      });
  }

  private transformDataForChart(data: StockData[], symbol: string, timeframe: string): DualChartData {
    const priceData = data.map(d => ({ x: new Date(d.timestamp).getTime(), o: d.open, h: d.high, l: d.low, c: d.close }));
    const volumeData = data.map(d => ({
      x: new Date(d.timestamp).getTime(),
      y: d.volume,
      backgroundColor: d.close > d.open ? this.chartColors.volume.buyDominant : this.chartColors.volume.sellDominant,
      buyPressure: 0,
      sellPressure: 0,
      pressureType: d.close > d.open ? 'buying' : 'selling' as 'buying' | 'selling'
    }));

    return {
      priceData,
      volumeData,
      symbol,
      timeframe,
      colorTheme: {
        bullish: this.chartColors.price.up,
        bearish: this.chartColors.price.down,
        buyingPressure: this.chartColors.volume.buyDominant,
        sellingPressure: this.chartColors.volume.sellDominant
      }
    };
  }
}
