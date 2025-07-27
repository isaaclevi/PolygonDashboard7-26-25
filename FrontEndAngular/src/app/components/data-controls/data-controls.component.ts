import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StockSelectorComponent, StockSelectionEvent } from '../stock-selector/stock-selector.component';

@Component({
  selector: 'app-data-controls',
  templateUrl: './data-controls.component.html',
  styleUrls: ['./data-controls.component.scss'],
  standalone: true,
  imports: [FormsModule, StockSelectorComponent]
})
export class DataControlsComponent {
  @Output() getData = new EventEmitter<{ symbol: string, timeframe: string, startDate: string, endDate: string }>();

  symbol = 'AAPL';
  timeframe = '1min';
  startDate = '2024-01-01';
  endDate = '2024-01-02';
  selectedStockInfo: StockSelectionEvent | null = null;

  constructor() {
    // Set default dates to match sample data
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Format dates as YYYY-MM-DD for input[type="date"]
    this.startDate = '2024-01-01';
    this.endDate = '2024-01-02';
  }

  onStockSelected(stockInfo: StockSelectionEvent): void {
    this.symbol = stockInfo.symbol;
    this.selectedStockInfo = stockInfo;
    console.log('Stock selected:', stockInfo);
  }

  onGetData() {
    if (!this.symbol || !this.timeframe || !this.startDate || !this.endDate) {
      console.warn('Missing required data for stock request');
      return;
    }

    console.log('Requesting stock data:', {
      symbol: this.symbol,
      timeframe: this.timeframe,
      startDate: this.startDate,
      endDate: this.endDate
    });

    this.getData.emit({
      symbol: this.symbol,
      timeframe: this.timeframe,
      startDate: this.startDate,
      endDate: this.endDate
    });
  }
}
