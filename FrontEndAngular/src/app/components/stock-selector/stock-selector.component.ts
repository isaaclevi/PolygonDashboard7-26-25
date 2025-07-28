import { Component, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatOptionModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SocketService } from '../../services/socket';
import { TickerStorageService, TickerStorageData } from '../../services/ticker-storage.service';
import { DataRefreshService } from '../../services/data-refresh.service';
import { Subscription, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

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
export class StockSelectorComponent implements OnInit, OnDestroy {
  @Output() stockSelected = new EventEmitter<StockSelectionEvent>();

  selectedStock: string = '';
  filterText: string = '';
  isDropdownOpen: boolean = false;
  isLoading: boolean = false;
  loadingError: string = '';

  // Ticker data from Polygon.io via FTP
  stockOptions: StockOption[] = [];
  filteredStocks: StockOption[] = [];

  // Performance optimization
  private filterSubject = new Subject<string>();
  private lastFilterText: string = '';
  private maxDisplayResults: number = 100; // Limit displayed results for performance

  // Synchronization tracking
  syncStatus: 'none' | 'loading' | 'syncing' | 'offline' | 'complete' = 'none';
  lastSyncInfo: { added: number; removed: number; total: number } = { added: 0, removed: 0, total: 0 };
  isUsingLocalData: boolean = false;

  // Change detection for smart reloading
  private lastTickerDataHash: string = '';
  private lastBackendTimestamp: string = '';
  private isInitialLoadComplete: boolean = false;

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

  // Add subscription for auto-refresh
  private tickerRefreshSubscription: Subscription | null = null;
  private filterSubscription: Subscription | null = null;

  constructor(
    private socketService: SocketService,
    private tickerStorage: TickerStorageService,
    private dataRefreshService: DataRefreshService
  ) {}

  async ngOnInit() {
    console.log('🚀 Stock Selector: Initializing on page load...');
    
    // Set up debounced filtering for better performance
    this.filterSubscription = this.filterSubject.pipe(
      debounceTime(150), // Wait 150ms after user stops typing
      distinctUntilChanged() // Only trigger if the filter text actually changed
    ).subscribe((filterText: string) => {
      this.performFiltering(filterText);
    });
    
    // Immediately start loading ticker data on page load (initial load)
    await this.loadTickerData();
    this.isInitialLoadComplete = true;
    
    // Force refresh dropdown to show all tickers
    this.forceRefreshDropdown();
    
    // Default to AAPL if available, otherwise use first available stock
    if (this.stockOptions.length > 0) {
      const appleStock = this.stockOptions.find(stock => stock.symbol === 'AAPL');
      this.selectedStock = appleStock ? 'AAPL' : this.stockOptions[0].symbol;
      
      // Emit initial selection to parent components
      if (appleStock) {
        this.stockSelected.emit({
          symbol: appleStock.symbol,
          name: appleStock.name,
          sector: appleStock.sector,
          description: appleStock.description,
          marketCap: appleStock.marketCap,
          exchange: appleStock.exchange
        });
      } else if (this.stockOptions[0]) {
        const firstStock = this.stockOptions[0];
        this.stockSelected.emit({
          symbol: firstStock.symbol,
          name: firstStock.name,
          sector: firstStock.sector,
          description: firstStock.description,
          marketCap: firstStock.marketCap,
          exchange: firstStock.exchange
        });
      }
      
      console.log(`✅ Stock Selector: Initial stock selected: ${this.selectedStock}`);
    } else {
      console.warn('⚠️ Stock Selector: No ticker data available on page load');
    }

    // Subscribe to automatic ticker data refresh notifications with smart change detection
    this.tickerRefreshSubscription = this.dataRefreshService.getTickerDataUpdates$()
      .subscribe(async () => {
        if (!this.isInitialLoadComplete) {
          console.log('🔄 Auto-refresh: Skipping update during initial load');
          return;
        }
        
        console.log('🔄 Auto-refresh: Checking for ticker data changes...');
        const hasChanges = await this.checkForTickerChanges();
        
        if (hasChanges) {
          console.log('📊 Auto-refresh: Changes detected - reloading ticker data');
          await this.loadTickerData();
        } else {
          console.log('✅ Auto-refresh: No changes detected - keeping current ticker data');
        }
      });
    
    // 🐛 DEBUG: Expose debug methods to global window for console access
    (window as any).debugTickers = () => this.debugPrintAllTickers();
    (window as any).debugSyncSafety = () => this.debugSyncSafety();
    (window as any).debugForceSync = () => this.debugForceSync();
    (window as any).forceRefreshDropdown = () => this.forceRefreshDropdown();
    (window as any).checkTickerChanges = () => this.checkForTickerChanges();
    (window as any).forceRefreshTickers = () => this.forceRefreshTickerData();
    (window as any).getChangeStatus = () => this.getChangeDetectionStatus();
    (window as any).testFilterPerformance = () => this.testFilterPerformance();
    
    console.log('🐛 DEBUG: Available console commands:');
    console.log('  window.debugTickers() - Print all ticker data and change detection status');
    console.log('  window.debugSyncSafety() - Check sync safety with backend');
    console.log('  window.debugForceSync() - Force sync bypassing safety checks');
    console.log('  window.forceRefreshDropdown() - Force refresh dropdown display');
    console.log('  window.checkTickerChanges() - Check for ticker changes without reloading');
    console.log('  window.forceRefreshTickers() - Force refresh ticker data (bypass change detection)');
    console.log('  window.getChangeStatus() - Get current change detection status');
    console.log('  window.testFilterPerformance() - Test filter performance with large datasets');
    console.log('🛡️ SAFETY: Ticker removal is now protected by validation checks');
    console.log('🔍 SMART LOADING: Ticker data only reloads when changes are detected');
    console.log('⚡ PERFORMANCE: Filter uses debounced input and result limiting for responsiveness');
  }

  ngOnDestroy() {
    if (this.tickerRefreshSubscription) {
      this.tickerRefreshSubscription.unsubscribe();
    }
    if (this.filterSubscription) {
      this.filterSubscription.unsubscribe();
    }
    this.filterSubject.complete();
  }

  /**
   * Loads ticker data with synchronization and local storage fallback
   */
  private async loadTickerData(): Promise<void> {
    this.isLoading = true;
    this.loadingError = '';
    this.syncStatus = 'loading';

    try {
      console.log('📊 Starting ticker data synchronization for page load...');

      // Step 1: Check if local data exists
      const localStorageInfo = await this.tickerStorage.getStorageInfo();
      console.log('💾 Local storage info:', localStorageInfo);
      
      // Step 2: Try to load from backend (with auto-transmission on connection)
      let backendData: TickerDataResponse | null = null;
      try {
        console.log('🌐 Attempting to fetch fresh ticker data from backend...');
                    backendData = await this.socketService.downloadFile('tickers.json');
        console.log('✅ Backend connection successful - received ticker data');
      } catch (backendError) {
        console.warn('❌ Backend connection failed:', backendError);
      }

      if (backendData && backendData.tickers && Array.isArray(backendData.tickers)) {
        // Step 3: Backend connection successful - perform synchronization
        this.syncStatus = 'syncing';
        console.log(`📈 Processing ${backendData.tickers.length} tickers from backend...`);
        
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
        
        // Update change tracking for smart reloading
        try {
          const status = await this.socketService.downloadFile('status.json');
          this.updateChangeTracking(backendData, status);
        } catch (statusError) {
          console.warn('⚠️ Could not fetch status for change tracking:', statusError);
          this.updateChangeTracking(backendData);
        }
        
        // 🖨️ CONSOLE OUTPUT: Print all tickers from backend
        console.log(`📊 TICKER DATA LOADED: ${this.stockOptions.length} total tickers available`);
        console.log('📈 SAMPLE TICKERS:', this.stockOptions.slice(0, 10).map(t => `${t.symbol} - ${t.name}`));
        console.log('🏢 POPULAR SYMBOLS:', this.stockOptions.filter(t => ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', 'AMZN', 'META'].includes(t.symbol)).map(t => t.symbol));

      } else if (localStorageInfo.hasData) {
        // Step 4: Backend failed but local data exists - use fallback
        console.log('📱 Backend unavailable, loading from local storage...');
        this.syncStatus = 'offline';
        
        const localData = await this.tickerStorage.loadTickerData();
        if (localData) {
          this.stockOptions = localData.tickers;
          this.isUsingLocalData = true;
          console.log(`💾 Using ${localData.tickers.length} cached tickers from ${localData.metadata.lastUpdated}`);
          
          // 🖨️ CONSOLE OUTPUT: Print all tickers from local storage
          console.log(`📊 CACHED TICKER DATA: ${this.stockOptions.length} total cached tickers`);
          console.log('📈 SAMPLE CACHED TICKERS:', this.stockOptions.slice(0, 10).map(t => `${t.symbol} - ${t.name}`));
          console.log('🏢 CACHED POPULAR SYMBOLS:', this.stockOptions.filter(t => ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', 'AMZN', 'META'].includes(t.symbol)).map(t => t.symbol));
        } else {
          throw new Error('Local storage data corrupted');
        }

      } else {
        // Step 5: No backend and no local data - use hardcoded fallback
        throw new Error('No backend connection and no local data available');
      }

      // Update filtered stocks to show all tickers with performance optimization
      this.performFiltering(this.filterText || '');
      console.log(`🎯 Dropdown updated with ${this.stockOptions.length} tickers ready for selection (${this.filteredStocks.length} displayed)`);

    } catch (error) {
      console.error('❌ Complete ticker loading failure:', error);
      this.loadingError = 'Failed to load ticker data. Using limited fallback set.';
      this.syncStatus = 'offline';
      
      // Final fallback to hardcoded popular stocks
      this.stockOptions = [...this.fallbackStocks];
      this.performFiltering(this.filterText || '');
      this.isUsingLocalData = false;
      
      console.warn(`🆘 Using minimal fallback ticker data: ${this.stockOptions.length} stocks`);
      console.log('🏢 FALLBACK SYMBOLS:', this.stockOptions.map(t => `${t.symbol} - ${t.name}`));
    } finally {
      this.isLoading = false;
      console.log(`🏁 Ticker loading complete: ${this.stockOptions.length} tickers available for stock selector`);
      
      // 🖨️ FINAL CONSOLE OUTPUT: Summary and force UI update
      console.log('🎯 FINAL TICKER COUNT:', this.stockOptions.length);
      console.log('🎯 FILTERED DISPLAY COUNT:', this.filteredStocks.length);
      console.log('🎯 DATA SOURCE:', this.isUsingLocalData ? 'LOCAL STORAGE' : (this.syncStatus === 'offline' ? 'FALLBACK' : 'BACKEND'));
      console.log('🎯 SYNC STATUS:', this.syncStatus);
      console.log('🎯 READY FOR USER INTERACTION');
      
      // Force Angular change detection
      setTimeout(() => {
        console.log('🔄 UI refresh completed - stock selector ready');
      }, 100);
    }
  }

  /**
   * Optimized filtering with debouncing and performance optimizations
   */
  private performFiltering(filterText: string): void {
    const startTime = performance.now();
    
    if (!filterText.trim()) {
      // Show limited results when no filter to prevent UI lag
      this.filteredStocks = this.stockOptions.slice(0, this.maxDisplayResults);
      console.log(`⚡ Filter cleared - showing first ${this.maxDisplayResults} results`);
      return;
    }

    const searchText = filterText.toLowerCase();
    const filtered = this.stockOptions.filter(stock => 
      stock.symbol.toLowerCase().includes(searchText) ||
      stock.name.toLowerCase().includes(searchText) ||
      stock.sector.toLowerCase().includes(searchText) ||
      (stock.description && stock.description.toLowerCase().includes(searchText)) ||
      (stock.exchange && stock.exchange.toLowerCase().includes(searchText))
    );

    // Limit results for performance - prioritize exact matches
    const exactMatches = filtered.filter(stock => 
      stock.symbol.toLowerCase().startsWith(searchText) ||
      stock.name.toLowerCase().startsWith(searchText)
    );
    
    const otherMatches = filtered.filter(stock => 
      !stock.symbol.toLowerCase().startsWith(searchText) &&
      !stock.name.toLowerCase().startsWith(searchText)
    );

    // Combine with exact matches first, then limit total results
    const combinedResults = [...exactMatches, ...otherMatches];
    this.filteredStocks = combinedResults.slice(0, this.maxDisplayResults);

    const endTime = performance.now();
    console.log(`⚡ Filter applied: "${filterText}" -> ${this.filteredStocks.length}/${filtered.length} results in ${(endTime - startTime).toFixed(2)}ms`);
  }

  /**
   * Performance-optimized filter getter
   */
  get filteredStockOptions(): StockOption[] {
    return this.filteredStocks;
  }

  /**
   * Optimized filter change handler with debouncing
   */
  onFilterChange(): void {
    // Don't trigger if the filter text hasn't actually changed
    if (this.filterText === this.lastFilterText) {
      return;
    }
    
    this.lastFilterText = this.filterText;
    this.filterSubject.next(this.filterText);
  }

  /**
   * Get popular stocks based on market cap and common symbols
   */
  private getPopularStocks(): StockOption[] {
    const popularSymbols = ['ACHR','JOBY','WULF','UVXY','UVIX','VXX','SVIX','AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'JPM', 'JNJ', 'V', 'UNH', 'HD', 'PG', 'MA', 'DIS', 'ADBE', 'NFLX', 'XOM', 'TMO', 'ABT'];
    
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
      // Show all tickers when dropdown opens
      this.filteredStocks = this.filteredStockOptions;
      console.log(`📋 Dropdown opened - showing ${this.filteredStocks.length} tickers`);
      // Focus the filter input when dropdown opens
      setTimeout(() => {
        const filterInput = document.getElementById('stock-filter') as HTMLInputElement;
        if (filterInput) {
          filterInput.focus();
        }
      }, 100);
    }
  }

  closeDropdown(): void {
    this.isDropdownOpen = false;
    this.filterText = '';
  }

  /**
   * Handle keyboard navigation in the dropdown
   */
  onKeyDown(event: KeyboardEvent): void {
    if (!this.isDropdownOpen) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
        event.preventDefault();
        this.toggleDropdown();
      }
      return;
    }

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.closeDropdown();
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.navigateOptions(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.navigateOptions(-1);
        break;
      case 'Enter':
        event.preventDefault();
        this.selectCurrentOption();
        break;
    }
  }

  /**
   * Navigate through options with arrow keys
   */
  private navigateOptions(direction: number): void {
    const options = document.querySelectorAll('.option-item');
    const currentIndex = Array.from(options).findIndex(option => 
      option.classList.contains('selected')
    );
    
    let newIndex = currentIndex + direction;
    if (newIndex < 0) newIndex = options.length - 1;
    if (newIndex >= options.length) newIndex = 0;
    
    // Remove current selection
    options.forEach(option => option.classList.remove('selected'));
    
    // Add selection to new option
    if (options[newIndex]) {
      options[newIndex].classList.add('selected');
      (options[newIndex] as HTMLElement).focus();
    }
  }

  /**
   * Select the currently highlighted option
   */
  private selectCurrentOption(): void {
    const selectedOption = document.querySelector('.option-item.selected') as HTMLElement;
    if (selectedOption) {
      const stockSymbol = selectedOption.getAttribute('data-symbol');
      if (stockSymbol) {
        const stock = this.stockOptions.find(s => s.symbol === stockSymbol);
        if (stock) {
          this.onStockSelect(stock);
        }
      }
    }
  }

  getSelectedStockInfo(): StockOption | undefined {
    return this.stockOptions.find(stock => stock.symbol === this.selectedStock);
  }

  /**
   * Clear filter with immediate update
   */
  clearFilter(): void {
    this.filterText = '';
    this.lastFilterText = '';
    this.performFiltering(''); // Immediate update for clear action
  }

  trackBySymbol(index: number, stock: StockOption): string {
    return stock.symbol;
  }

  /**
   * Force refresh dropdown to show all tickers with optimized filtering
   */
  forceRefreshDropdown(): void {
    // Use optimized filtering instead of direct assignment
    this.performFiltering(this.filterText);
    console.log(`🔄 Force refreshed dropdown - now showing ${this.filteredStocks.length} tickers (optimized)`);
  }

  /**
   * Refresh ticker data from server
   */
  async refreshTickerData(): Promise<void> {
    await this.loadTickerData();
  }

  /**
   * Manually trigger ticker data refresh (bypasses change detection)
   */
  async forceRefreshTickerData(): Promise<void> {
    console.log('🔄 Manual refresh: Force loading ticker data...');
    await this.loadTickerData();
  }

  /**
   * Get change detection status for debugging
   */
  getChangeDetectionStatus(): any {
    return {
      lastBackendTimestamp: this.lastBackendTimestamp,
      lastTickerDataHash: this.lastTickerDataHash.substring(0, 50) + '...',
      isInitialLoadComplete: this.isInitialLoadComplete,
      currentTickerCount: this.stockOptions.length,
      syncStatus: this.syncStatus,
      isUsingLocalData: this.isUsingLocalData
    };
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
    console.log('🔍 CHANGE DETECTION STATUS:', this.getChangeDetectionStatus());
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
   * Debug method to check sync safety with current backend data
   */
  async debugSyncSafety(): Promise<void> {
    try {
      console.log('🔍 DEBUG: Checking sync safety...');
      const backendData = await this.socketService.downloadFile('tickers.json');
      
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
      const backendData = await this.socketService.downloadFile('tickers.json');
      
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

  /**
   * Checks if there are any changes in the ticker data compared to the last loaded state.
   * This is a simplified check that compares hashes of the ticker data.
   * A more robust check would involve comparing timestamps and content.
   */
  private async checkForTickerChanges(): Promise<boolean> {
    try {
      console.log('🔍 Checking for ticker data changes...');
      
      // First check if backend data has changed via status.json
      const status = await this.socketService.downloadFile('status.json');
      const currentBackendTimestamp = status?.timestamp || '';
      
      if (this.lastBackendTimestamp && currentBackendTimestamp !== this.lastBackendTimestamp) {
        console.log('📅 Backend timestamp changed:', this.lastBackendTimestamp, '→', currentBackendTimestamp);
        return true;
      }
      
      // Check if available symbols in status have changed
      const currentSymbols = status?.dataFreshness?.availableSymbols || [];
      const currentSymbolsHash = JSON.stringify(currentSymbols.sort());
      
      // Also check ticker file metadata for changes
      try {
        const tickerData = await this.socketService.downloadFile('tickers.json');
        const currentDataHash = this.generateTickerDataHash(tickerData);
        
        if (this.lastTickerDataHash && currentDataHash !== this.lastTickerDataHash) {
          console.log('📊 Ticker data hash changed - changes detected');
          return true;
        }
        
        console.log('✅ No ticker changes detected');
        return false;
        
      } catch (tickerError) {
        console.warn('⚠️ Could not check ticker file for changes:', tickerError);
        // If we can't check the ticker file but status changed, assume changes
        return this.lastBackendTimestamp !== currentBackendTimestamp;
      }
      
    } catch (error) {
      console.warn('⚠️ Could not check for ticker changes:', error);
      // If we can't check for changes, err on the side of caution and reload
      return true;
    }
  }

  /**
   * Generate a hash of the ticker data for change detection
   */
  private generateTickerDataHash(tickerData: any): string {
    if (!tickerData || !tickerData.metadata || !tickerData.tickers) {
      return '';
    }
    
    // Create a hash based on metadata and ticker count/symbols
    const hashData = {
      generatedAt: tickerData.metadata.generatedAt,
      totalCount: tickerData.metadata.totalCount,
      version: tickerData.metadata.version,
      tickerCount: tickerData.tickers.length,
      sampleSymbols: tickerData.tickers.slice(0, 10).map((t: any) => t.symbol).sort()
    };
    
    return JSON.stringify(hashData);
  }

  /**
   * Update change tracking after successful data load
   */
  private updateChangeTracking(tickerData?: any, status?: any): void {
    if (status?.timestamp) {
      this.lastBackendTimestamp = status.timestamp;
    }
    
    if (tickerData) {
      this.lastTickerDataHash = this.generateTickerDataHash(tickerData);
    }
    
    console.log('🔄 Change tracking updated:', {
      timestamp: this.lastBackendTimestamp,
      dataHash: this.lastTickerDataHash.substring(0, 50) + '...'
    });
  }

  /**
   * Test filter performance for debugging
   */
  testFilterPerformance(): void {
    console.log('🧪 Testing filter performance...');
    
    const testCases = ['', 'A', 'APP', 'AAPL', 'Technology', 'Financial', 'Healthcare'];
    
    testCases.forEach(testFilter => {
      const startTime = performance.now();
      this.performFiltering(testFilter);
      const endTime = performance.now();
      
      console.log(`📊 Filter "${testFilter}": ${this.filteredStocks.length} results in ${(endTime - startTime).toFixed(2)}ms`);
    });
    
    // Reset to current filter
    this.performFiltering(this.filterText);
  }
}
