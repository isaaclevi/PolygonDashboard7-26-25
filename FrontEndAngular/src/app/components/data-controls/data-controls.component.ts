import { Component, EventEmitter, Output, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StockSelectorComponent, StockSelectionEvent } from '../stock-selector/stock-selector.component';

@Component({
  selector: 'app-data-controls',
  templateUrl: './data-controls.component.html',
  styleUrls: ['./data-controls.component.scss'],
  standalone: true,
  imports: [FormsModule, StockSelectorComponent]
})
export class DataControlsComponent implements OnInit {
  @Output() getData = new EventEmitter<{ symbol: string, timeframe: string, startDate: string, endDate: string }>();

  symbol = 'AAPL';
  timeframe = '1min';
  startDate = '2024-01-01';
  endDate = '2024-01-02';
  selectedStockInfo: StockSelectionEvent | null = null;
  
  private initialDataRequested = false;

  constructor() {
    // Set default dates to match sample data
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Format dates as YYYY-MM-DD for input[type="date"]
    this.endDate = today.toISOString().split('T')[0];
    this.startDate = yesterday.toISOString().split('T')[0];
  }

  ngOnInit() {
    console.log('🎛️ Data Controls: Component initialized, waiting for stock selection...');
  }

  onStockSelected(stockInfo: StockSelectionEvent): void {
    console.log('📈 Data Controls: Stock selected:', stockInfo);
    this.symbol = stockInfo.symbol;
    this.selectedStockInfo = stockInfo;
    
    // Automatically request data for the initially selected stock
    if (!this.initialDataRequested) {
      console.log('🚀 Data Controls: Requesting initial data for selected stock...');
      this.onGetData();
      this.initialDataRequested = true;
    }
  }

  onGetData(): void {
    const requestParams = {
      symbol: this.symbol,
      timeframe: this.timeframe,
      startDate: this.startDate,
      endDate: this.endDate
    };
    
    console.log('📊 Data Controls: Emitting data request:', requestParams);
    this.getData.emit(requestParams);
  }
}
