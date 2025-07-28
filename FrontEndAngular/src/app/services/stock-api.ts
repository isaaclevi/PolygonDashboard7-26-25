import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { StockData, DualChartData } from '../models/stock-data.interface';
import { SocketService } from './socket';

@Injectable({
  providedIn: 'root'
})
export class StockApiService {

  constructor(private socketService: SocketService) { }

  /**
   * Gets stock data from Socket service (replacing HTTP endpoint).
   * This maintains socket-first architecture while providing the same interface.
   */
  getStockData(symbol: string, timeframe: string, startDate: string, endDate: string): Observable<StockData[]> {
    return new Observable(observer => {
      this.socketService.downloadStockData(symbol, timeframe, startDate, endDate)
        .then(response => {
          if (response.error) {
            observer.error(new Error(response.error.message));
          } else {
            // Transform the Socket response data to match StockData interface
            const stockData: StockData[] = response.data.map((item: any) => ({
              timestamp: item.timestamp,
              open: item.open,
              high: item.high,
              low: item.low,
              close: item.close,
              volume: item.volume
            }));
            observer.next(stockData);
          }
          observer.complete();
        })
        .catch(error => {
          observer.error(error);
        });
    });
  }

  /**
   * Gets stock data using Observable pattern from Socket service.
   */
  getStockDataObservable(symbol: string, timeframe: string, startDate: string, endDate: string): Observable<StockData[]> {
    return this.socketService.downloadStockDataObservable(symbol, timeframe, startDate, endDate)
      .pipe(
        // Transform response to StockData array
        // Handle errors in component
      );
  }

  /**
   * Gets dual chart data (price + volume) for chart display.
   */
  getDualChartData(symbol: string, timeframe: string, startDate: string, endDate: string): Observable<DualChartData> {
    return new Observable(observer => {
      this.socketService.downloadStockData(symbol, timeframe, startDate, endDate)
        .then(response => {
          if (response.error) {
            observer.error(new Error(response.error.message));
          } else {
            // Transform data for dual chart display
            const dualChartData: DualChartData = {
              symbol: response.metadata.symbol,
              timeframe: response.metadata.timeframe || timeframe,
              colorTheme: {
                bullish: '#00FF41',     // Bright green for price increases
                bearish: '#FF1744',     // Bright red for price decreases
                buyingPressure: '#2196F3',  // Blue for buying pressure
                sellingPressure: '#FF9500'  // Orange for selling pressure
              },
              priceData: response.data.map((item: any) => ({
                x: item.timestamp,
                o: item.open,
                h: item.high,
                l: item.low,
                c: item.close
              })),
              volumeData: response.data.map((item: any) => ({
                x: item.timestamp,
                y: item.volume,
                backgroundColor: item.volume > 1000000 ? '#2196F3' : '#FF9500', // Blue for high volume, orange for low
                buyPressure: 60, // Mock data - should come from trade analysis
                sellPressure: 40,
                pressureType: item.volume > 1000000 ? 'buying' : 'selling'
              }))
            };
            observer.next(dualChartData);
          }
          observer.complete();
        })
        .catch(error => {
          observer.error(error);
        });
    });
  }

  /**
   * Lists available stock symbols from Socket service.
   */
  getAvailableSymbols(): Observable<string[]> {
    return new Observable(observer => {
      this.socketService.listFiles()
        .then(files => {
          // Extract unique symbols from file names (format: SYMBOL-TIMEFRAME-STARTDATE-ENDDATE.json)
          const symbols = new Set<string>();
          files.forEach(file => {
            if (file.includes('-') && file.endsWith('.json') && file !== 'status.json') {
              const symbol = file.split('-')[0];
              symbols.add(symbol);
            }
          });
          observer.next(Array.from(symbols));
          observer.complete();
        })
        .catch(error => {
          observer.error(error);
        });
    });
  }

  /**
   * Gets server status from Socket service.
   */
  getStatus(): Observable<any> {
    return this.socketService.downloadFileObservable('status.json');
  }
}
