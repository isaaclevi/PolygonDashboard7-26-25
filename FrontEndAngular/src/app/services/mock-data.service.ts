import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';

export interface MockStockData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MockApiResponse {
  metadata: {
    symbol: string;
    timeframe: string;
    startDate: string;
    endDate: string;
    generatedAt: string;
    recordCount: number;
  };
  data: MockStockData[];
}

@Injectable({
  providedIn: 'root'
})
export class MockDataService {

  private mockData: { [key: string]: MockApiResponse } = {
    'AAPL': {
      metadata: {
        symbol: 'AAPL',
        timeframe: '1min',
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-01-02T00:00:00Z',
        generatedAt: new Date().toISOString(),
        recordCount: 10
      },
      data: [
        { timestamp: '2024-01-01T09:30:00-05:00', open: 150.00, high: 152.50, low: 149.75, close: 151.25, volume: 1000000 },
        { timestamp: '2024-01-01T09:31:00-05:00', open: 151.25, high: 153.00, low: 150.50, close: 152.75, volume: 950000 },
        { timestamp: '2024-01-01T09:32:00-05:00', open: 152.75, high: 153.25, low: 151.00, close: 151.50, volume: 1100000 },
        { timestamp: '2024-01-01T09:33:00-05:00', open: 151.50, high: 152.80, low: 150.90, close: 152.40, volume: 980000 },
        { timestamp: '2024-01-01T09:34:00-05:00', open: 152.40, high: 154.00, low: 152.10, close: 153.75, volume: 1200000 },
        { timestamp: '2024-01-01T09:35:00-05:00', open: 153.75, high: 155.00, low: 153.25, close: 154.50, volume: 1050000 },
        { timestamp: '2024-01-01T09:36:00-05:00', open: 154.50, high: 155.25, low: 153.80, close: 154.90, volume: 920000 },
        { timestamp: '2024-01-01T09:37:00-05:00', open: 154.90, high: 156.10, low: 154.20, close: 155.60, volume: 1080000 },
        { timestamp: '2024-01-01T09:38:00-05:00', open: 155.60, high: 156.80, low: 154.90, close: 156.25, volume: 1150000 },
        { timestamp: '2024-01-01T09:39:00-05:00', open: 156.25, high: 157.40, low: 155.75, close: 156.80, volume: 1030000 }
      ]
    },
    'TSLA': {
      metadata: {
        symbol: 'TSLA',
        timeframe: '1min',
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-01-02T00:00:00Z',
        generatedAt: new Date().toISOString(),
        recordCount: 8
      },
      data: [
        { timestamp: '2024-01-01T09:30:00-05:00', open: 250.00, high: 255.00, low: 248.50, close: 253.25, volume: 800000 },
        { timestamp: '2024-01-01T09:31:00-05:00', open: 253.25, high: 256.75, low: 252.00, close: 255.50, volume: 750000 },
        { timestamp: '2024-01-01T09:32:00-05:00', open: 255.50, high: 258.75, low: 254.20, close: 257.90, volume: 820000 },
        { timestamp: '2024-01-01T09:33:00-05:00', open: 257.90, high: 260.00, low: 256.50, close: 258.75, volume: 780000 },
        { timestamp: '2024-01-01T09:34:00-05:00', open: 258.75, high: 262.00, low: 257.80, close: 260.25, volume: 900000 },
        { timestamp: '2024-01-01T09:35:00-05:00', open: 260.25, high: 263.50, low: 259.40, close: 262.10, volume: 850000 },
        { timestamp: '2024-01-01T09:36:00-05:00', open: 262.10, high: 264.80, low: 261.25, close: 263.90, volume: 760000 },
        { timestamp: '2024-01-01T09:37:00-05:00', open: 263.90, high: 266.20, low: 262.75, close: 265.40, volume: 870000 }
      ]
    },
    'GOOGL': {
      metadata: {
        symbol: 'GOOGL',
        timeframe: '1min',
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-01-02T00:00:00Z',
        generatedAt: new Date().toISOString(),
        recordCount: 6
      },
      data: [
        { timestamp: '2024-01-01T09:30:00-05:00', open: 2800.00, high: 2825.00, low: 2790.00, close: 2815.50, volume: 500000 },
        { timestamp: '2024-01-01T09:31:00-05:00', open: 2815.50, high: 2830.00, low: 2810.00, close: 2822.75, volume: 480000 },
        { timestamp: '2024-01-01T09:32:00-05:00', open: 2822.75, high: 2840.50, low: 2818.20, close: 2835.90, volume: 520000 },
        { timestamp: '2024-01-01T09:33:00-05:00', open: 2835.90, high: 2850.00, low: 2830.40, close: 2842.60, volume: 490000 },
        { timestamp: '2024-01-01T09:34:00-05:00', open: 2842.60, high: 2858.75, low: 2838.90, close: 2851.25, volume: 530000 },
        { timestamp: '2024-01-01T09:35:00-05:00', open: 2851.25, high: 2865.40, low: 2847.80, close: 2860.50, volume: 510000 }
      ]
    },
    'MSFT': {
      metadata: {
        symbol: 'MSFT',
        timeframe: '1min',
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-01-02T00:00:00Z',
        generatedAt: new Date().toISOString(),
        recordCount: 7
      },
      data: [
        { timestamp: '2024-01-01T09:30:00-05:00', open: 380.00, high: 385.50, low: 378.25, close: 383.75, volume: 600000 },
        { timestamp: '2024-01-01T09:31:00-05:00', open: 383.75, high: 387.00, low: 382.50, close: 385.25, volume: 580000 },
        { timestamp: '2024-01-01T09:32:00-05:00', open: 385.25, high: 388.90, low: 384.10, close: 387.60, volume: 620000 },
        { timestamp: '2024-01-01T09:33:00-05:00', open: 387.60, high: 390.25, low: 386.75, close: 389.40, volume: 590000 },
        { timestamp: '2024-01-01T09:34:00-05:00', open: 389.40, high: 392.80, low: 388.20, close: 391.55, volume: 650000 },
        { timestamp: '2024-01-01T09:35:00-05:00', open: 391.55, high: 394.20, low: 390.80, close: 393.10, volume: 610000 },
        { timestamp: '2024-01-01T09:36:00-05:00', open: 393.10, high: 396.50, low: 392.40, close: 395.75, volume: 640000 }
      ]
    }
  };

  /**
   * Get mock stock data for demonstration purposes
   */
  getMockStockData(symbol: string, timeframe: string, startDate: string, endDate: string): Observable<MockApiResponse> {
    console.log(`🎭 Mock Data Service: Generating data for ${symbol} ${timeframe}`);
    
    // Use predefined data if available, otherwise generate new data
    const data = this.mockData[symbol] || this.generateMockData(symbol, timeframe, startDate, endDate);
    
    // Simulate network delay
    return of(data).pipe(delay(500));
  }

  /**
   * Generate mock data for any symbol
   */
  private generateMockData(symbol: string, timeframe: string, startDate: string, endDate: string): MockApiResponse {
    const basePrice = this.getBasePriceForSymbol(symbol);
    const data: MockStockData[] = [];
    
    // Generate 8-12 data points
    const pointCount = Math.floor(Math.random() * 5) + 8;
    
    for (let i = 0; i < pointCount; i++) {
      const date = new Date(startDate);
      date.setHours(9, 30 + i, 0, 0);
      
      const variation = (Math.random() - 0.5) * (basePrice * 0.02); // 2% max variation
      const open = basePrice + variation + (Math.random() - 0.5) * 5;
      const high = open + Math.random() * (basePrice * 0.01); // Up to 1% higher
      const low = open - Math.random() * (basePrice * 0.01); // Up to 1% lower
      const close = low + Math.random() * (high - low);
      const volume = Math.floor(500000 + Math.random() * 1000000);
      
      data.push({
        timestamp: date.toISOString(),
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(close * 100) / 100,
        volume
      });
    }

    return {
      metadata: {
        symbol,
        timeframe,
        startDate: `${startDate}T00:00:00Z`,
        endDate: `${endDate}T00:00:00Z`,
        generatedAt: new Date().toISOString(),
        recordCount: data.length
      },
      data
    };
  }

  /**
   * Get base price for different symbols
   */
  private getBasePriceForSymbol(symbol: string): number {
    const basePrices: { [key: string]: number } = {
      // Tech Giants - FAANG + Major Tech
      'AAPL': 150, 'MSFT': 380, 'GOOGL': 2800, 'GOOG': 2750, 'AMZN': 3200, 'META': 320, 'NVDA': 500, 'TSLA': 250, 'NFLX': 400,
      
      // Technology - Hardware & Software
      'CRM': 240, 'ORCL': 110, 'ADBE': 520, 'INTC': 45, 'AMD': 120, 'IBM': 140, 'CSCO': 55, 'AVGO': 600, 'QCOM': 160, 'TXN': 180, 'NOW': 650, 'SNOW': 200, 'PLTR': 25,
      
      // Electric Vehicles & Automotive
      'F': 12, 'GM': 40, 'RIVN': 35, 'LCID': 15, 'NIO': 20,
      
      // Financial Services - Major Banks
      'JPM': 140, 'BAC': 35, 'WFC': 45, 'GS': 380, 'MS': 90, 'C': 60, 'USB': 50, 'PNC': 170, 'COF': 130,
      
      // Financial Services - Investment & Insurance
      'BRK.A': 450000, 'BRK.B': 300, 'BLK': 750, 'AXP': 180, 'V': 220, 'MA': 380, 'PYPL': 80,
      
      // Healthcare - Pharmaceuticals
      'JNJ': 160, 'PFE': 30, 'UNH': 450, 'ABBV': 140, 'LLY': 580, 'MRK': 110, 'BMY': 70, 'AMGN': 260, 'GILD': 85, 'CVS': 75, 'MRNA': 120, 'BNTX': 130,
      
      // Consumer Goods & Retail
      'KO': 60, 'PEP': 170, 'WMT': 160, 'HD': 330, 'LOW': 220, 'TGT': 150, 'COST': 520, 'SBUX': 100, 'MCD': 280, 'NKE': 120, 'LULU': 380,
      
      // Energy & Oil
      'XOM': 100, 'CVX': 150, 'COP': 120, 'SLB': 45, 'EOG': 130, 'OXY': 65,
      
      // Entertainment & Media
      'DIS': 90, 'CMCSA': 45, 'T': 20, 'VZ': 40, 'ROKU': 65, 'SPOT': 120,
      
      // Airlines & Transportation
      'AAL': 15, 'UAL': 45, 'DAL': 40, 'LUV': 35, 'UBER': 45, 'LYFT': 15, 'FDX': 250, 'UPS': 180,
      
      // Real Estate & REITs
      'AMT': 220, 'PLD': 140, 'CCI': 180, 'EQIX': 750,
      
      // Industrial & Manufacturing
      'CAT': 280, 'BA': 220, 'GE': 110, 'MMM': 130, 'HON': 220, 'UNP': 240,
      
      // Cryptocurrency & Fintech
      'COIN': 80, 'SQ': 75, 'HOOD': 12,
      
      // Gaming & Social Media
      'RBLX': 40, 'EA': 130, 'ATVI': 80, 'TTWO': 140, 'SNAP': 12, 'TWTR': 45, 'PINS': 25,
      
      // Cloud & SaaS
      'OKTA': 90, 'ZM': 70, 'DOCU': 55, 'TWLO': 80, 'SHOP': 65,
      
      // Biotechnology
      'BIIB': 280, 'REGN': 750, 'VRTX': 320,
      
      // ETFs - Popular Index Funds
      'SPY': 420, 'QQQ': 380, 'IWM': 200, 'VTI': 240, 'VOO': 420,
      
      // Commodities & Materials
      'GLD': 190, 'SLV': 22, 'USO': 75
    };

    return basePrices[symbol] || 100; // Default to $100 if symbol not found
  }

  /**
   * Get status information
   */
  getStatus(): Observable<any> {
    const statusData = {
      system: 'StockTradingFrontend',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'mock',
        ftp: 'mock',
        websocket: 'mock'
      },
      dataFreshness: {
        lastUpdate: new Date().toISOString(),
        availableSymbols: Object.keys(this.mockData),
        mode: 'demonstration'
      }
    };

    return of(statusData).pipe(delay(200));
  }
} 