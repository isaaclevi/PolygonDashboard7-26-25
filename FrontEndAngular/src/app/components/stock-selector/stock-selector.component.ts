import { Component, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatOptionModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FtpService } from '../../services/ftp';
import { TickerStorageService, TickerStorageData } from '../../services/ticker-storage.service';

// Enhanced interface for comprehensive ticker data from Polygon.io
export interface StockOption {
  symbol: string;
  name: string;
  description: string;
  sector: string;
  market?: string;
  exchange?: string;
  active?: boolean;
  currency?: string;
  marketCap?: number;
  listDate?: string;
  type?: string;
  website?: string;
  logo?: string;
  icon?: string;
  employees?: number;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  sicCode?: string;
  sicDescription?: string;
}

export interface StockSelectionEvent {
  symbol: string;
  name: string;
  sector: string;
  description?: string;
  marketCap?: number;
  exchange?: string;
}

// Interface for ticker data from FTP
interface TickerDataResponse {
  metadata: {
    generatedAt: string;
    source: string;
    market: string;
    activeOnly: boolean;
    totalCount: number;
    apiEndpoint: string;
    version: string;
  };
  tickers: StockOption[];
}

@Component({
  selector: 'app-stock-selector',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatOptionModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './stock-selector.component.html',
  styleUrl: './stock-selector.component.scss'
})
export class StockSelectorComponent implements OnInit {
  @Output() stockSelected = new EventEmitter<StockSelectionEvent>();

  selectedStock: string = '';
  filterText: string = '';
  isDropdownOpen: boolean = false;
  isLoading: boolean = false;
  loadingError: string = '';

  // Ticker data from Polygon.io via FTP
  stockOptions: StockOption[] = [];
  filteredStocks: StockOption[] = [];

  // Synchronization tracking
  syncStatus: 'none' | 'loading' | 'syncing' | 'offline' | 'complete' = 'none';
  lastSyncInfo: { added: number; removed: number; total: number } = { added: 0, removed: 0, total: 0 };
  isUsingLocalData: boolean = false;

  // Fallback popular stocks (used if FTP data loading fails)
  private fallbackStocks: StockOption[] = [
    { symbol: 'AAPL', name: 'Apple Inc.', description: 'Apple designs and manufactures consumer electronics, software, and services.', sector: 'Technology' },
    { symbol: 'MSFT', name: 'Microsoft Corporation', description: 'Microsoft develops and licenses software and hardware.', sector: 'Technology' },
    { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', description: 'Alphabet is a technology company operating through Google and other subsidiaries.', sector: 'Technology' },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', description: 'Amazon operates an online marketplace and cloud computing platform.', sector: 'Technology' },
    { symbol: 'TSLA', name: 'Tesla Inc.', description: 'Tesla designs, develops, manufactures, and sells electric vehicles.', sector: 'Automotive' },
    { symbol: 'META', name: 'Meta Platforms Inc.', description: 'Meta operates social networking platforms including Facebook and Instagram.', sector: 'Technology' },
    { symbol: 'NVDA', name: 'NVIDIA Corporation', description: 'NVIDIA designs graphics processing units for gaming and professional markets.', sector: 'Technology' },
    { symbol: 'JPM', name: 'JPMorgan Chase & Co.', description: 'JPMorgan Chase provides investment banking and financial services.', sector: 'Financial' },
    { symbol: 'JNJ', name: 'Johnson & Johnson', description: 'Johnson & Johnson researches, develops, and manufactures pharmaceuticals.', sector: 'Healthcare' },
    { symbol: 'V', name: 'Visa Inc.', description: 'Visa operates a payment card network facilitating electronic funds transfers.', sector: 'Financial' }
  ];

  constructor(
    private ftpService: FtpService,
    private tickerStorage: TickerStorageService
  ) {}

  async ngOnInit() {
    await this.loadTickerData();
    // Default to AAPL if available
    if (this.stockOptions.length > 0) {
      const appleStock = this.stockOptions.find(stock => stock.symbol === 'AAPL');
      this.selectedStock = appleStock ? 'AAPL' : this.stockOptions[0].symbol;
    }
    
    // 🐛 DEBUG: Expose debug methods to global window for console access
    (window as any).debugTickers = () => this.debugPrintAllTickers();
    (window as any).debugSyncSafety = () => this.debugSyncSafety();
    (window as any).debugForceSync = () => this.debugForceSync();
    
    console.log('🐛 DEBUG: Available console commands:');
    console.log('  window.debugTickers() - Print all ticker data');
    console.log('  window.debugSyncSafety() - Check sync safety with backend');
    console.log('  window.debugForceSync() - Force sync bypassing safety checks');
    console.log('🛡️ SAFETY: Ticker removal is now protected by validation checks');
  }

  /**
   * Loads ticker data with synchronization and local storage fallback
   */
  private async loadTickerData(): Promise<void> {
    this.isLoading = true;
    this.loadingError = '';
    this.syncStatus = 'loading';

    try {
      console.log('Starting ticker data synchronization...');

      // Step 1: Check if local data exists
      const localStorageInfo = await this.tickerStorage.getStorageInfo();
      
      // Step 2: Try to load from backend (with auto-transmission on connection)
      let backendData: TickerDataResponse | null = null;
      try {
        console.log('Attempting to fetch fresh ticker data from backend...');
        backendData = await this.ftpService.downloadFile('tickers.json');
      } catch (backendError) {
        console.warn('Backend connection failed:', backendError);
      }

      if (backendData && backendData.tickers && Array.isArray(backendData.tickers)) {
        // Step 3: Backend connection successful - perform synchronization
        this.syncStatus = 'syncing';
        
        const syncResult = await this.tickerStorage.synchronizeTickers(backendData.tickers);
        this.lastSyncInfo = {
          added: syncResult.added.length,
          removed: syncResult.removed.length,
          total: syncResult.total
        };

        // 🛡️ SAFETY CHECK: Only proceed with sync if it's safe
        if (syncResult.safeToSync) {
          // Save updated data to local storage
          const storageData: TickerStorageData = {
            metadata: {
              lastUpdated: new Date().toISOString(),
              source: backendData.metadata.source,
              totalCount: backendData.metadata.totalCount,
              version: backendData.metadata.version
            },
            tickers: backendData.tickers
          };

          await this.tickerStorage.saveTickerData(storageData);

          // Use backend data
          this.stockOptions = backendData.tickers;
          this.isUsingLocalData = false;
          this.syncStatus = 'complete';

          console.log(`✅ Safe synchronization complete: ${syncResult.added.length} added, ${syncResult.removed.length} removed, ${backendData.tickers.length} total`);
        } else {
          // 🚨 UNSAFE TO SYNC: Use backend data but don't remove local tickers
          console.warn('🚨 Unsafe to sync - using incremental update only:', syncResult.reason);
          
          // Load existing local data
          const localData = await this.tickerStorage.loadTickerData();
          if (localData) {
            // Merge: Keep all local tickers + add new backend tickers
            const localSymbols = new Set(localData.tickers.map(t => t.symbol));
            const newTickers = backendData.tickers.filter(t => !localSymbols.has(t.symbol));
            const mergedTickers = [...localData.tickers, ...newTickers];
            
            const mergedStorageData: TickerStorageData = {
              metadata: {
                lastUpdated: new Date().toISOString(),
                source: `${backendData.metadata.source} (incremental)`,
                totalCount: mergedTickers.length,
                version: backendData.metadata.version
              },
              tickers: mergedTickers
            };

            await this.tickerStorage.saveTickerData(mergedStorageData);
            this.stockOptions = mergedTickers;
            this.isUsingLocalData = false;
            this.syncStatus = 'complete';
            
            console.log(`⚠️ Incremental sync complete: ${newTickers.length} new tickers added, 0 removed (unsafe), ${mergedTickers.length} total`);
          } else {
            // No local data, use backend data as-is
            this.stockOptions = backendData.tickers;
            this.isUsingLocalData = false;
            this.syncStatus = 'complete';
            console.log(`⚠️ No local data - using backend data despite safety warning`);
          }
        }
        
        // 🖨️ CONSOLE OUTPUT: Print all tickers from backend
        console.log('📊 ALL TICKERS FROM BACKEND:', this.stockOptions);
        console.log('📈 SAMPLE TICKERS:', this.stockOptions.slice(0, 10));
        console.log('🏢 TICKER SYMBOLS:', this.stockOptions.map(t => t.symbol).slice(0, 50));

      } else if (localStorageInfo.hasData) {
        // Step 4: Backend failed but local data exists - use fallback
        console.log('Backend unavailable, loading from local storage...');
        this.syncStatus = 'offline';
        
        const localData = await this.tickerStorage.loadTickerData();
        if (localData) {
          this.stockOptions = localData.tickers;
          this.isUsingLocalData = true;
          console.log(`📱 Using ${localData.tickers.length} cached tickers from ${localData.metadata.lastUpdated}`);
          
          // 🖨️ CONSOLE OUTPUT: Print all tickers from local storage
          console.log('💾 ALL TICKERS FROM LOCAL STORAGE:', this.stockOptions);
          console.log('📈 SAMPLE CACHED TICKERS:', this.stockOptions.slice(0, 10));
          console.log('🏢 CACHED TICKER SYMBOLS:', this.stockOptions.map(t => t.symbol).slice(0, 50));
          console.log('📊 TICKER DATA STRUCTURE:', this.stockOptions[0]);
        } else {
          throw new Error('Local storage data corrupted');
        }

      } else {
        // Step 5: No backend and no local data - use hardcoded fallback
        throw new Error('No backend connection and no local data available');
      }

      this.filteredStocks = [...this.stockOptions];

    } catch (error) {
      console.error('Complete ticker loading failure:', error);
      this.loadingError = 'Failed to load ticker data. Using limited fallback set.';
      this.syncStatus = 'offline';
      
      // Final fallback to hardcoded popular stocks
      this.stockOptions = [...this.fallbackStocks];
      this.filteredStocks = [...this.stockOptions];
      this.isUsingLocalData = false;
      
      console.warn('⚠️ Using minimal fallback ticker data', { count: this.stockOptions.length });
      
      // 🖨️ CONSOLE OUTPUT: Print fallback tickers
      console.log('🆘 FALLBACK TICKERS:', this.stockOptions);
      console.log('🏢 FALLBACK SYMBOLS:', this.stockOptions.map(t => t.symbol));
    } finally {
      this.isLoading = false;
      console.log(`📊 Ticker loading complete: ${this.stockOptions.length} tickers available`);
      
      // 🖨️ FINAL CONSOLE OUTPUT: Summary and force UI update
      console.log('🎯 FINAL TICKER COUNT:', this.stockOptions.length);
      console.log('🎯 FINAL TICKER LIST (first 20):', this.stockOptions.slice(0, 20).map(t => `${t.symbol} - ${t.name}`));
      console.log('🎯 DATA SOURCE:', this.isUsingLocalData ? 'LOCAL STORAGE' : 'BACKEND');
      console.log('🎯 SYNC STATUS:', this.syncStatus);
      
      // Force Angular change detection
      setTimeout(() => {
        console.log('🔄 UI should now be updated with', this.stockOptions.length, 'tickers');
      }, 100);
    }
  }

  get filteredStockOptions(): StockOption[] {
    if (!this.filterText) {
      // For performance with large datasets, limit initial display to 100 most popular stocks
      if (this.stockOptions.length > 100 && !this.isDropdownOpen) {
        return this.getPopularStocks().slice(0, 100);
      }
      return this.stockOptions;
    }

    const searchText = this.filterText.toLowerCase();
    const filtered = this.stockOptions.filter(stock => 
      stock.symbol.toLowerCase().includes(searchText) ||
      stock.name.toLowerCase().includes(searchText) ||
      stock.sector.toLowerCase().includes(searchText) ||
      (stock.description && stock.description.toLowerCase().includes(searchText)) ||
      (stock.exchange && stock.exchange.toLowerCase().includes(searchText))
    );

    // Limit filtered results to 500 for performance
    return filtered.slice(0, 500);
  }

  /**
   * Get popular stocks based on market cap and common symbols
   */
  private getPopularStocks(): StockOption[] {
    const popularSymbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'JPM', 'JNJ', 'V', 'UNH', 'HD', 'PG', 'MA', 'DIS', 'ADBE', 'NFLX', 'XOM', 'TMO', 'ABT'];
    
    // First, get stocks that match popular symbols
    const popular = this.stockOptions.filter(stock => 
      popularSymbols.includes(stock.symbol)
    );

    // Then add others sorted by market cap
    const others = this.stockOptions
      .filter(stock => !popularSymbols.includes(stock.symbol))
      .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));

    return [...popular, ...others];
  }

  onFilterChange(): void {
    this.filteredStocks = this.filteredStockOptions;
  }

  onStockSelect(stock: StockOption): void {
    this.selectedStock = stock.symbol;
    this.isDropdownOpen = false;
    this.filterText = '';
    
    this.stockSelected.emit({
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      description: stock.description,
      marketCap: stock.marketCap,
      exchange: stock.exchange
    });
  }

  toggleDropdown(): void {
    this.isDropdownOpen = !this.isDropdownOpen;
    if (this.isDropdownOpen) {
      this.filteredStocks = this.filteredStockOptions;
    }
  }

  closeDropdown(): void {
    this.isDropdownOpen = false;
    this.filterText = '';
  }

  getSelectedStockInfo(): StockOption | undefined {
    return this.stockOptions.find(stock => stock.symbol === this.selectedStock);
  }

  clearFilter(): void {
    this.filterText = '';
    this.onFilterChange();
  }

  trackBySymbol(index: number, stock: StockOption): string {
    return stock.symbol;
  }

  /**
   * Refresh ticker data from server
   */
  async refreshTickerData(): Promise<void> {
    await this.loadTickerData();
  }

  /**
   * Get market cap display string
   */
  getMarketCapDisplay(marketCap?: number): string {
    if (!marketCap) return '';
    
    if (marketCap >= 1e12) {
      return `$${(marketCap / 1e12).toFixed(2)}T`;
    } else if (marketCap >= 1e9) {
      return `$${(marketCap / 1e9).toFixed(2)}B`;
    } else if (marketCap >= 1e6) {
      return `$${(marketCap / 1e6).toFixed(2)}M`;
    }
    return `$${marketCap.toLocaleString()}`;
  }

  /**
   * Get loading progress for better UX with large datasets
   */
  getLoadingProgress(): string {
    if (this.stockOptions.length === 0) {
      switch (this.syncStatus) {
        case 'loading': return 'Connecting to backend...';
        case 'syncing': return 'Synchronizing ticker data...';
        case 'offline': return 'Loading from local storage...';
        default: return 'Initializing...';
      }
    }
    return `Loaded ${this.stockOptions.length.toLocaleString()} tickers`;
  }

  /**
   * Check if we have comprehensive ticker data
   */
  hasComprehensiveData(): boolean {
    return this.stockOptions.length > 1000; // Indicates we loaded from Polygon.io
  }

  /**
   * Get sync status display text
   */
  getSyncStatusDisplay(): string {
    switch (this.syncStatus) {
      case 'complete':
        if (this.lastSyncInfo.added > 0 || this.lastSyncInfo.removed > 0) {
          const safetyNote = this.lastSyncInfo.removed === 0 && this.lastSyncInfo.added > 0 ? ' (safe sync)' : '';
          return `Updated: +${this.lastSyncInfo.added} new, -${this.lastSyncInfo.removed} removed${safetyNote}`;
        }
        return this.isUsingLocalData ? 'Using cached data (safe)' : 'Data synchronized (safe)';
      case 'offline':
        return this.isUsingLocalData ? 'Using cached data (offline)' : 'Limited offline data';
      case 'syncing':
        return 'Synchronizing (validating safety)...';
      case 'loading':
        return 'Connecting to backend...';
      default:
        return '';
    }
  }

  /**
   * Get data source display with sync info
   */
  getDataSourceDisplay(): string {
    if (this.isUsingLocalData) {
      return '📱 Offline Mode';
    } else if (this.hasComprehensiveData()) {
      return '✓ Live Data';
    } else {
      return '⚠ Limited Data';
    }
  }

  /**
   * Clear local storage and force refresh
   */
  async clearLocalData(): Promise<void> {
    try {
      await this.tickerStorage.clearStoredData();
      console.log('Local ticker data cleared');
      await this.refreshTickerData();
    } catch (error) {
      console.error('Failed to clear local data:', error);
    }
  }

  /**
   * Get storage statistics for debugging
   */
  async getStorageStats(): Promise<any> {
    return await this.tickerStorage.getStorageStats();
  }

  /**
   * Manual console debug method - can be called from browser console
   */
  debugPrintAllTickers(): void {
    console.log('🐛 DEBUG: Manual ticker dump requested');
    console.log('📊 TOTAL TICKERS:', this.stockOptions.length);
    console.log('📋 ALL TICKER DATA:', this.stockOptions);
    console.log('🏢 ALL SYMBOLS:', this.stockOptions.map(t => t.symbol));
    console.log('📈 SAMPLE TICKERS WITH DETAILS:', this.stockOptions.slice(0, 5));
    console.log('💾 USING LOCAL DATA:', this.isUsingLocalData);
    console.log('🔄 SYNC STATUS:', this.syncStatus);
    console.log('📊 LAST SYNC INFO:', this.lastSyncInfo);
  }

  /**
   * Debug method to check sync safety with current backend data
   */
  async debugSyncSafety(): Promise<void> {
    try {
      console.log('🔍 DEBUG: Checking sync safety...');
      const backendData = await this.ftpService.downloadFile('tickers.json');
      
      if (backendData && backendData.tickers) {
        const diagnostics = await this.tickerStorage.getSyncDiagnostics(backendData.tickers);
        const safetyConfig = this.tickerStorage.getSafetyConfig();
        
        console.log('🛡️ SYNC SAFETY DIAGNOSTICS:', diagnostics);
        console.log('⚙️ SAFETY CONFIGURATION:', safetyConfig);
        console.log('✅ SAFE TO SYNC:', diagnostics.wouldBeSafe);
        
        if (!diagnostics.wouldBeSafe) {
          console.warn('🚨 SYNC WOULD BE UNSAFE:', diagnostics.validationResult.reason);
          console.log('💡 TIP: You can call window.debugForceSync() to override safety checks');
        }
      }
    } catch (error) {
      console.error('❌ DEBUG: Failed to check sync safety:', error);
    }
  }

  /**
   * Force synchronization bypassing safety checks (use with caution)
   */
  async debugForceSync(): Promise<void> {
    try {
      console.warn('🚨 DEBUG: FORCE SYNC initiated - bypassing safety checks!');
      const backendData = await this.ftpService.downloadFile('tickers.json');
      
      if (backendData && backendData.tickers) {
        const syncResult = await this.tickerStorage.forceSynchronizeTickers(backendData.tickers);
        
        // Force save the data
        const storageData = {
          metadata: {
            lastUpdated: new Date().toISOString(),
            source: `${backendData.metadata.source} (FORCED)`,
            totalCount: backendData.metadata.totalCount,
            version: backendData.metadata.version
          },
          tickers: backendData.tickers
        };

        await this.tickerStorage.saveTickerData(storageData);
        this.stockOptions = backendData.tickers;
        this.filteredStocks = [...this.stockOptions];
        this.isUsingLocalData = false;
        this.syncStatus = 'complete';
        
        console.log('🚨 FORCE SYNC COMPLETE:', syncResult);
        console.log('🔄 UI updated with forced sync data');
      }
    } catch (error) {
      console.error('❌ DEBUG: Force sync failed:', error);
    }
  }
}
