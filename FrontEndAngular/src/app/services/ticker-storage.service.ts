import { Injectable } from '@angular/core';
import { StockOption } from '../components/stock-selector/stock-selector.component';

export interface TickerStorageMetadata {
  lastUpdated: string;
  source: string;
  totalCount: number;
  version: string;
}

export interface TickerStorageData {
  metadata: TickerStorageMetadata;
  tickers: StockOption[];
}

@Injectable({
  providedIn: 'root'
})
export class TickerStorageService {
  private readonly DB_NAME = 'StockDashboardDB';
  private readonly DB_VERSION = 1;
  private readonly TICKER_STORE = 'tickers';
  private readonly METADATA_KEY = 'ticker_metadata';

  // 🛡️ Safety configuration for synchronization
  private readonly SYNC_SAFETY_CONFIG = {
    MIN_EXPECTED_TICKERS: 1000,           // Minimum tickers expected from Polygon.io
    MAX_REMOVAL_PERCENTAGE: 0.1,         // Max 10% of tickers can be removed in one sync
    MAX_REMOVAL_ABSOLUTE: 100,           // Max 100 tickers can be removed in one sync
    MAX_REDUCTION_PERCENTAGE: 0.5,       // Max 50% total reduction allowed
    VALIDATION_SAMPLE_SIZE: 10           // Sample size for data structure validation
  };

  constructor() {
    this.initializeDB();
  }

  /**
   * Initialize IndexedDB database for ticker storage
   */
  private async initializeDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create ticker object store
        if (!db.objectStoreNames.contains(this.TICKER_STORE)) {
          const tickerStore = db.createObjectStore(this.TICKER_STORE, { keyPath: 'symbol' });
          tickerStore.createIndex('symbol', 'symbol', { unique: true });
          tickerStore.createIndex('sector', 'sector', { unique: false });
          tickerStore.createIndex('exchange', 'exchange', { unique: false });
        }
      };
    });
  }

  /**
   * Save ticker data to local storage with metadata
   */
  async saveTickerData(tickerData: TickerStorageData): Promise<void> {
    try {
      const db = await this.initializeDB();
      const transaction = db.transaction([this.TICKER_STORE], 'readwrite');
      const store = transaction.objectStore(this.TICKER_STORE);

      // Clear existing data
      await this.clearStore(store);

      // Save new tickers
      const savePromises = tickerData.tickers.map(ticker => 
        this.putData(store, ticker)
      );

      await Promise.all(savePromises);

      // Save metadata to localStorage (faster access)
      localStorage.setItem(this.METADATA_KEY, JSON.stringify(tickerData.metadata));

      console.log(`Saved ${tickerData.tickers.length} tickers to local storage`);
    } catch (error) {
      console.error('Failed to save ticker data:', error);
      throw error;
    }
  }

  /**
   * Load ticker data from local storage
   */
  async loadTickerData(): Promise<TickerStorageData | null> {
    try {
      const db = await this.initializeDB();
      const transaction = db.transaction([this.TICKER_STORE], 'readonly');
      const store = transaction.objectStore(this.TICKER_STORE);

      const tickers = await this.getAllData(store);
      const metadataJson = localStorage.getItem(this.METADATA_KEY);

      if (!metadataJson || tickers.length === 0) {
        return null;
      }

      const metadata: TickerStorageMetadata = JSON.parse(metadataJson);

      console.log(`Loaded ${tickers.length} tickers from local storage`);
      return { metadata, tickers };
    } catch (error) {
      console.error('Failed to load ticker data:', error);
      return null;
    }
  }

  /**
   * Synchronize local tickers with backend data
   * Returns arrays of added and removed tickers
   * Includes safety checks to prevent premature ticker removal
   */
  async synchronizeTickers(backendTickers: StockOption[]): Promise<{
    added: StockOption[];
    removed: StockOption[];
    total: number;
    safeToSync: boolean;
    reason?: string;
  }> {
    try {
      const localData = await this.loadTickerData();
      const localTickers = localData?.tickers || [];

      // 🛡️ SAFETY CHECK 1: Validate backend response completeness
      const validationResult = this.validateBackendResponse(backendTickers, localTickers);
      if (!validationResult.isValid) {
        console.warn('🚨 Backend response validation failed:', validationResult.reason);
        return {
          added: [],
          removed: [],
          total: backendTickers.length,
          safeToSync: false,
          reason: validationResult.reason
        };
      }

      // Create symbol sets for comparison
      const localSymbols = new Set(localTickers.map(t => t.symbol));
      const backendSymbols = new Set(backendTickers.map(t => t.symbol));

      // Find new tickers (in backend but not local)
      const added = backendTickers.filter(ticker => !localSymbols.has(ticker.symbol));

      // 🛡️ SAFETY CHECK 2: Conservative ticker removal with threshold
      const potentiallyRemoved = localTickers.filter(ticker => !backendSymbols.has(ticker.symbol));
      const removalThreshold = Math.min(
        localTickers.length * this.SYNC_SAFETY_CONFIG.MAX_REMOVAL_PERCENTAGE, 
        this.SYNC_SAFETY_CONFIG.MAX_REMOVAL_ABSOLUTE
      );
      
      let removed: StockOption[] = [];
      let safeToSync = true;
      let reason = '';

      if (potentiallyRemoved.length > removalThreshold) {
        console.warn(`🚨 Large ticker removal detected: ${potentiallyRemoved.length} tickers would be removed (threshold: ${removalThreshold})`);
        removed = []; // Don't remove any tickers
        safeToSync = false;
        reason = `Too many tickers to remove (${potentiallyRemoved.length} > ${removalThreshold}). Possible incomplete backend response.`;
      } else {
        removed = potentiallyRemoved;
      }

      console.log(`📊 Ticker sync analysis: ${added.length} added, ${removed.length} removed (${potentiallyRemoved.length} candidates), safe: ${safeToSync}`);

      return {
        added,
        removed,
        total: backendTickers.length,
        safeToSync,
        reason
      };
    } catch (error) {
      console.error('Failed to synchronize tickers:', error);
      return { 
        added: [], 
        removed: [], 
        total: 0, 
        safeToSync: false, 
        reason: `Synchronization error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Validate backend response to ensure it's complete and safe to sync
   */
  private validateBackendResponse(backendTickers: StockOption[], localTickers: StockOption[]): {
    isValid: boolean;
    reason?: string;
  } {
    // 1. Check minimum ticker count
    if (backendTickers.length < this.SYNC_SAFETY_CONFIG.MIN_EXPECTED_TICKERS) {
      return {
        isValid: false,
        reason: `Backend response too small: ${backendTickers.length} tickers (expected ≥ ${this.SYNC_SAFETY_CONFIG.MIN_EXPECTED_TICKERS})`
      };
    }

    // 2. Check for major reduction (more than configured threshold)
    if (localTickers.length > 0) {
      const reductionRatio = (localTickers.length - backendTickers.length) / localTickers.length;
      if (reductionRatio > this.SYNC_SAFETY_CONFIG.MAX_REDUCTION_PERCENTAGE) {
        return {
          isValid: false,
          reason: `Major ticker count reduction: ${Math.round(reductionRatio * 100)}% (${localTickers.length} → ${backendTickers.length}), threshold: ${this.SYNC_SAFETY_CONFIG.MAX_REDUCTION_PERCENTAGE * 100}%`
        };
      }
    }

    // 3. Check for data structure completeness
    const sampleSize = Math.min(this.SYNC_SAFETY_CONFIG.VALIDATION_SAMPLE_SIZE, backendTickers.length);
    const incompleteTickers = backendTickers.slice(0, sampleSize).filter(ticker => 
      !ticker.symbol || !ticker.name || ticker.symbol.trim() === ''
    );
    
    if (incompleteTickers.length > 0) {
      return {
        isValid: false,
        reason: `Incomplete ticker data detected: ${incompleteTickers.length} of ${sampleSize} sample tickers missing required fields`
      };
    }

    // 4. Check for duplicate symbols
    const symbols = new Set();
    const duplicates = backendTickers.filter(ticker => {
      if (symbols.has(ticker.symbol)) {
        return true;
      }
      symbols.add(ticker.symbol);
      return false;
    });

    if (duplicates.length > 0) {
      return {
        isValid: false,
        reason: `Duplicate symbols detected: ${duplicates.length} duplicates found`
      };
    }

    return { isValid: true };
  }

  /**
   * Force synchronization with reduced safety checks (for manual override)
   */
  async forceSynchronizeTickers(backendTickers: StockOption[]): Promise<{
    added: StockOption[];
    removed: StockOption[];
    total: number;
    safeToSync: boolean;
    reason?: string;
  }> {
    console.warn('🚨 FORCE SYNC: Bypassing safety checks - use with caution!');
    
    const localData = await this.loadTickerData();
    const localTickers = localData?.tickers || [];
    
    const localSymbols = new Set(localTickers.map(t => t.symbol));
    const backendSymbols = new Set(backendTickers.map(t => t.symbol));

    const added = backendTickers.filter(ticker => !localSymbols.has(ticker.symbol));
    const removed = localTickers.filter(ticker => !backendSymbols.has(ticker.symbol));

    console.log(`🚨 FORCE SYNC: ${added.length} added, ${removed.length} removed, ${backendTickers.length} total`);

    return {
      added,
      removed,
      total: backendTickers.length,
      safeToSync: true, // Force to true
      reason: 'Manual override - safety checks bypassed'
    };
  }

  /**
   * Get current safety configuration
   */
  getSafetyConfig() {
    return { ...this.SYNC_SAFETY_CONFIG };
  }

  /**
   * Get detailed sync statistics for debugging
   */
  async getSyncDiagnostics(backendTickers: StockOption[]): Promise<{
    localCount: number;
    backendCount: number;
    validationResult: { isValid: boolean; reason?: string };
    potentialAdded: number;
    potentialRemoved: number;
    removalThreshold: number;
    wouldBeSafe: boolean;
  }> {
    const localData = await this.loadTickerData();
    const localTickers = localData?.tickers || [];
    
    const localSymbols = new Set(localTickers.map(t => t.symbol));
    const backendSymbols = new Set(backendTickers.map(t => t.symbol));
    
    const potentialAdded = backendTickers.filter(ticker => !localSymbols.has(ticker.symbol));
    const potentialRemoved = localTickers.filter(ticker => !backendSymbols.has(ticker.symbol));
    
    const removalThreshold = Math.min(
      localTickers.length * this.SYNC_SAFETY_CONFIG.MAX_REMOVAL_PERCENTAGE,
      this.SYNC_SAFETY_CONFIG.MAX_REMOVAL_ABSOLUTE
    );
    
    const validationResult = this.validateBackendResponse(backendTickers, localTickers);
    const wouldBeSafe = validationResult.isValid && potentialRemoved.length <= removalThreshold;
    
    return {
      localCount: localTickers.length,
      backendCount: backendTickers.length,
      validationResult,
      potentialAdded: potentialAdded.length,
      potentialRemoved: potentialRemoved.length,
      removalThreshold,
      wouldBeSafe
    };
  }

  /**
   * Check if local ticker data exists and get metadata
   */
  async getStorageInfo(): Promise<{ hasData: boolean; metadata?: TickerStorageMetadata }> {
    try {
      const metadataJson = localStorage.getItem(this.METADATA_KEY);
      if (!metadataJson) {
        return { hasData: false };
      }

      const metadata: TickerStorageMetadata = JSON.parse(metadataJson);
      return { hasData: true, metadata };
    } catch (error) {
      console.error('Failed to get storage info:', error);
      return { hasData: false };
    }
  }

  /**
   * Clear all stored ticker data
   */
  async clearStoredData(): Promise<void> {
    try {
      const db = await this.initializeDB();
      const transaction = db.transaction([this.TICKER_STORE], 'readwrite');
      const store = transaction.objectStore(this.TICKER_STORE);

      await this.clearStore(store);
      localStorage.removeItem(this.METADATA_KEY);

      console.log('Cleared all stored ticker data');
    } catch (error) {
      console.error('Failed to clear stored data:', error);
      throw error;
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    tickerCount: number;
    lastUpdated?: string;
    source?: string;
    storageSize: number;
  }> {
    try {
      const localData = await this.loadTickerData();
      const storageSize = this.estimateStorageSize();

      return {
        tickerCount: localData?.tickers.length || 0,
        lastUpdated: localData?.metadata.lastUpdated,
        source: localData?.metadata.source,
        storageSize
      };
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      return { tickerCount: 0, storageSize: 0 };
    }
  }

  // Helper methods for IndexedDB operations
  private clearStore(store: IDBObjectStore): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private putData(store: IDBObjectStore, data: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = store.put(data);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private getAllData(store: IDBObjectStore): Promise<StockOption[]> {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private estimateStorageSize(): number {
    try {
      const metadataJson = localStorage.getItem(this.METADATA_KEY);
      return metadataJson ? new Blob([metadataJson]).size : 0;
    } catch {
      return 0;
    }
  }
} 