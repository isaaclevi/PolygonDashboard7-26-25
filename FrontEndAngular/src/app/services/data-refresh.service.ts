import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, interval, Observable, Subject, Subscription } from 'rxjs';
import { switchMap, catchError, takeUntil } from 'rxjs/operators';
import { SocketService } from './socket';
import { environment } from '../../environments/environment';

export interface DataRefreshStatus {
  isEnabled: boolean;
  lastRefresh: Date | null;
  nextRefresh: Date | null;
  failureCount: number;
  lastError: string | null;
}

export interface BackendStatus {
  system: string;
  status: string;
  timestamp: string;
  services: {
    database: string;
    socket: string;
    websocket: string;
  };
  dataFreshness: {
    lastUpdate: string | null;
    availableSymbols: string[];
    tickerFileLastUpdated?: string | null;
    tickerFileGeneration?: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class DataRefreshService implements OnDestroy {
  private destroy$ = new Subject<void>();
  private refreshInterval = environment.chartRefreshInterval || 30000; // 30 seconds default
  private statusCheckInterval = environment.statusCheckInterval || 10000; // 10 seconds for status checks
  private maxRetries = environment.autoRefresh?.maxRetries || 5;
  private backoffMultiplier = environment.autoRefresh?.backoffMultiplier || 1.5;
  
  // Status tracking
  private refreshStatus$ = new BehaviorSubject<DataRefreshStatus>({
    isEnabled: false,
    lastRefresh: null,
    nextRefresh: null,
    failureCount: 0,
    lastError: null
  });

  // Backend status tracking
  private backendStatus$ = new BehaviorSubject<BackendStatus | null>(null);
  
  // Data update notifications
  private tickerDataUpdated$ = new Subject<void>();
  private chartDataUpdated$ = new Subject<{symbol: string, timeframe: string, startDate: string, endDate: string}>();
  
  private refreshSubscription: Subscription | null = null;
  private statusSubscription: Subscription | null = null;

  constructor(private socketService: SocketService) {
    this.startStatusMonitoring();
    
    // Auto-start if configured, but delay to allow components to initialize first
    if (environment.autoRefresh?.enableOnStartup) {
      console.log('🚀 Auto-refresh: Scheduling startup after component initialization');
      setTimeout(() => {
        console.log('🚀 Auto-refresh: Starting on service initialization');
        this.startAutoRefresh();
      }, 3000); // 3 second delay to ensure components are fully loaded
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopAutoRefresh();
  }

  /**
   * Start automatic data refresh
   */
  startAutoRefresh(): void {
    if (this.refreshSubscription) {
      this.stopAutoRefresh();
    }

    console.log(`🔄 Starting auto-refresh with interval: ${this.refreshInterval}ms`);
    
    this.refreshSubscription = interval(this.refreshInterval)
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => this.performDataRefresh()),
        catchError(error => {
          console.error('❌ Auto-refresh error:', error);
          this.updateRefreshStatus({ lastError: error.message, failureCount: this.getStatus().failureCount + 1 });
          return [];
        })
      )
      .subscribe();

    this.updateRefreshStatus({ 
      isEnabled: true, 
      nextRefresh: new Date(Date.now() + this.refreshInterval),
      failureCount: 0,
      lastError: null
    });
  }

  /**
   * Stop automatic data refresh
   */
  stopAutoRefresh(): void {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
      this.refreshSubscription = null;
    }

    this.updateRefreshStatus({ 
      isEnabled: false, 
      nextRefresh: null 
    });
    
    console.log('⏸️ Auto-refresh stopped');
  }

  /**
   * Start monitoring backend status
   */
  private startStatusMonitoring(): void {
    this.statusSubscription = interval(this.statusCheckInterval)
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => this.checkBackendStatus()),
        catchError(error => {
          console.warn('⚠️ Status check failed:', error);
          return [];
        })
      )
      .subscribe();
  }

  /**
   * Perform a complete data refresh cycle
   */
  private async performDataRefresh(): Promise<void> {
    try {
      console.log('🔄 Performing scheduled data refresh...');
      
      // Check if backend has new data
      const status = await this.checkBackendStatus();
      if (status) {
        // Check if ticker data might be outdated
        const currentStatus = this.backendStatus$.value;
        if (!currentStatus || status.dataFreshness.lastUpdate !== currentStatus.dataFreshness.lastUpdate) {
          console.log('📊 Backend data freshness changed - refreshing ticker data');
          this.tickerDataUpdated$.next();
        }

        // Check available symbols and notify if they've changed
        if (!currentStatus || 
            JSON.stringify(status.dataFreshness.availableSymbols.sort()) !== 
            JSON.stringify(currentStatus.dataFreshness.availableSymbols.sort())) {
          console.log('📈 Available symbols changed - refreshing ticker data');
          this.tickerDataUpdated$.next();
        }

        // Check ticker file generation timestamp for changes
        if (!currentStatus || 
            status.dataFreshness.tickerFileGeneration !== currentStatus.dataFreshness.tickerFileGeneration) {
          console.log('📁 Ticker file generation timestamp changed - refreshing ticker data');
          this.tickerDataUpdated$.next();
        }

        // Check ticker file last updated timestamp for changes
        if (!currentStatus || 
            status.dataFreshness.tickerFileLastUpdated !== currentStatus.dataFreshness.tickerFileLastUpdated) {
          console.log('📄 Ticker file modification time changed - refreshing ticker data');
          this.tickerDataUpdated$.next();
        }
      }

      this.updateRefreshStatus({ 
        lastRefresh: new Date(),
        nextRefresh: new Date(Date.now() + this.refreshInterval),
        failureCount: 0,
        lastError: null
      });

    } catch (error) {
      console.error('❌ Data refresh failed:', error);
      const currentStatus = this.getStatus();
      const newFailureCount = currentStatus.failureCount + 1;
      
      // Implement exponential backoff for retries
      if (environment.autoRefresh?.retryOnFailure && newFailureCount < this.maxRetries) {
        const backoffDelay = this.refreshInterval * Math.pow(this.backoffMultiplier, newFailureCount - 1);
        console.log(`🔄 Retry ${newFailureCount}/${this.maxRetries} in ${backoffDelay}ms`);
        
        this.updateRefreshStatus({ 
          lastError: error instanceof Error ? error.message : 'Unknown error',
          failureCount: newFailureCount,
          nextRefresh: new Date(Date.now() + backoffDelay)
        });
      } else {
        console.error(`❌ Max retries (${this.maxRetries}) reached, stopping auto-refresh`);
        this.stopAutoRefresh();
        this.updateRefreshStatus({ 
          lastError: `Max retries reached: ${error instanceof Error ? error.message : 'Unknown error'}`,
          failureCount: newFailureCount
        });
      }
    }
  }

  /**
   * Check backend status and data freshness
   */
  private async checkBackendStatus(): Promise<BackendStatus | null> {
    try {
      const status: BackendStatus = await this.socketService.downloadFile('status.json');
      this.backendStatus$.next(status);
      return status;
    } catch (error) {
      console.warn('⚠️ Could not fetch backend status:', error);
      return null;
    }
  }

  /**
   * Manually trigger data refresh
   */
  async refreshNow(): Promise<void> {
    console.log('🔄 Manual refresh triggered');
    await this.performDataRefresh();
  }

  /**
   * Notify that chart data should be refreshed for specific parameters
   */
  requestChartDataRefresh(symbol: string, timeframe: string, startDate: string, endDate: string): void {
    console.log(`📈 Requesting chart data refresh for ${symbol} ${timeframe}`);
    this.chartDataUpdated$.next({ symbol, timeframe, startDate, endDate });
  }

  /**
   * Get refresh status as observable
   */
  getRefreshStatus$(): Observable<DataRefreshStatus> {
    return this.refreshStatus$.asObservable();
  }

  /**
   * Get current refresh status
   */
  getStatus(): DataRefreshStatus {
    return this.refreshStatus$.value;
  }

  /**
   * Get backend status as observable
   */
  getBackendStatus$(): Observable<BackendStatus | null> {
    return this.backendStatus$.asObservable();
  }

  /**
   * Get ticker data update notifications
   */
  getTickerDataUpdates$(): Observable<void> {
    return this.tickerDataUpdated$.asObservable();
  }

  /**
   * Get chart data update notifications
   */
  getChartDataUpdates$(): Observable<{symbol: string, timeframe: string, startDate: string, endDate: string}> {
    return this.chartDataUpdated$.asObservable();
  }

  /**
   * Update refresh status
   */
  private updateRefreshStatus(updates: Partial<DataRefreshStatus>): void {
    const current = this.refreshStatus$.value;
    this.refreshStatus$.next({ ...current, ...updates });
  }

  /**
   * Check if auto-refresh is currently enabled
   */
  isAutoRefreshEnabled(): boolean {
    return this.getStatus().isEnabled;
  }

  /**
   * Set refresh interval dynamically
   */
  setRefreshInterval(intervalMs: number): void {
    this.refreshInterval = intervalMs;
    
    if (this.isAutoRefreshEnabled()) {
      // Restart with new interval
      this.stopAutoRefresh();
      this.startAutoRefresh();
    }
    
    console.log(`⏱️ Refresh interval updated to: ${intervalMs}ms`);
  }
} 