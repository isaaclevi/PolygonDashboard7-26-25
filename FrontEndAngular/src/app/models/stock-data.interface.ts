export interface StockData {
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timeframe: '1min' | '5min' | '1hour' | '1day';
}

export interface ChartDataPoint {
  x: number;
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
}

export interface VolumeDataPoint {
  x: number;
  y: number; // volume
  backgroundColor: string; // orange for selling pressure, blue for buying pressure
  buyPressure: number; // percentage of buying pressure (0-100)
  sellPressure: number; // percentage of selling pressure (0-100)
  pressureType: 'buying' | 'selling'; // dominant pressure type
}

export interface DualChartData {
  priceData: ChartDataPoint[];
  volumeData: VolumeDataPoint[];
  symbol: string;
  timeframe: string;
  colorTheme: {
    bullish: string; // #00FF41
    bearish: string; // #FF1744
    buyingPressure: string; // #2196F3
    sellingPressure: string; // #FF9500
  };
}
