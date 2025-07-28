import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataControlsComponent } from '../data-controls/data-controls.component';
import { ChartContainerComponent } from '../dual-chart-display/chart-container/chart-container.component';
import { StockApiService } from '../../services/stock-api';
import { MockDataService, MockApiResponse } from '../../services/mock-data.service';
import { DualChartData, StockData } from '../../models/stock-data.interface';
import { ChartColorConfig } from '../../models/chart-config.interface';
import { DataRefreshService } from '../../services/data-refresh.service';
import { catchError } from 'rxjs/operators';
import { of, Subscription } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DataControlsComponent, ChartContainerComponent, CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy {
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

  // Current data parameters for auto-refresh
  private currentDataParams: { symbol: string, timeframe: string, startDate: string, endDate: string } | null = null;
  
  // Subscriptions for auto-refresh
  private chartRefreshSubscription: Subscription | null = null;
  private refreshStatusSubscription: Subscription | null = null;

  constructor(
    private stockApiService: StockApiService,
    private mockDataService: MockDataService,
    private dataRefreshService: DataRefreshService
  ) { }

  ngOnInit() {
    // Subscribe to automatic chart data refresh notifications
    this.chartRefreshSubscription = this.dataRefreshService.getChartDataUpdates$()
      .subscribe(params => {
        console.log('🔄 Auto-refresh: Chart data update notification received');
        // Only refresh if the parameters match current view
        if (this.currentDataParams && 
            this.currentDataParams.symbol === params.symbol &&
            this.currentDataParams.timeframe === params.timeframe &&
            this.currentDataParams.startDate === params.startDate &&
            this.currentDataParams.endDate === params.endDate) {
          this.loadDataWithParams(params);
        }
      });

    // Subscribe to refresh status for logging
    this.refreshStatusSubscription = this.dataRefreshService.getRefreshStatus$()
      .subscribe(status => {
        if (status.isEnabled) {
          console.log('📊 Auto-refresh enabled:', status);
        }
      });

    // Start automatic data refresh
    this.dataRefreshService.startAutoRefresh();
    console.log('🔄 Dashboard: Auto-refresh service started');
  }

  ngOnDestroy() {
    if (this.chartRefreshSubscription) {
      this.chartRefreshSubscription.unsubscribe();
    }
    if (this.refreshStatusSubscription) {
      this.refreshStatusSubscription.unsubscribe();
    }
    
    // Stop auto-refresh when component is destroyed
    this.dataRefreshService.stopAutoRefresh();
  }

  onGetData(event: { symbol: string, timeframe: string, startDate: string, endDate: string }) {
    console.log('📊 Dashboard: Data requested for', event);
    
    // Store current parameters for auto-refresh
    this.currentDataParams = { ...event };
    
    // Load the data
    this.loadDataWithParams(event);
  }

  private loadDataWithParams(params: { symbol: string, timeframe: string, startDate: string, endDate: string }) {
    // Try backend first, fallback to mock data if backend fails
    this.stockApiService.getStockData(params.symbol, params.timeframe, params.startDate, params.endDate)
      .pipe(
        catchError(error => {
          console.warn('🔄 Backend not available, using mock data:', error);
          // Convert mock data to StockData format
          return this.mockDataService.getMockStockData(params.symbol, params.timeframe, params.startDate, params.endDate)
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
          
          this.chartData = this.transformDataForChart(stockData, params.symbol, params.timeframe);
          console.log('📈 Chart data generated from mock service');
        } else if (Array.isArray(data)) {
          // Backend format (array of StockData)
          this.chartData = this.transformDataForChart(data as StockData[], params.symbol, params.timeframe);
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

  /**
   * Manually trigger a refresh of current chart data
   */
  refreshCurrentData(): void {
    if (this.currentDataParams) {
      console.log('🔄 Manual refresh of current chart data');
      this.loadDataWithParams(this.currentDataParams);
    }
  }

  /**
   * Get refresh status for display in UI
   */
  getRefreshStatus() {
    return this.dataRefreshService.getRefreshStatus$();
  }

  /**
   * Toggle auto-refresh on/off
   */
  toggleAutoRefresh(): void {
    if (this.dataRefreshService.isAutoRefreshEnabled()) {
      this.dataRefreshService.stopAutoRefresh();
      console.log('⏸️ Auto-refresh stopped by user');
    } else {
      this.dataRefreshService.startAutoRefresh();
      console.log('▶️ Auto-refresh started by user');
    }
  }
}
