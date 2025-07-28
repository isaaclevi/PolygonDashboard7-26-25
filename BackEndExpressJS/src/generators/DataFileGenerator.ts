import DatabaseService from '../services/DatabaseService';
import logger from '../utils/logger';
import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';
import PolygonService, { PolygonTicker } from '../services/PolygonService';

// Zod schema for file generation parameters
const FileGenerationParamsSchema = z.object({
  symbol: z.string().min(1).max(10),
  timeframe: z.enum(['1min', '5min', '1hour', '1day']),
  startDate: z.string().datetime(),
  endDate: z.string().datetime()
});

export type FileGenerationParams = z.infer<typeof FileGenerationParamsSchema>;

export interface TradeDataResponse {
  metadata: {
    symbol: string;
    timeframe: string;
    startDate: string;
    endDate: string;
    generatedAt: string;
    recordCount: number;
  };
  data: Array<{
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  error?: {
    message: string;
    code: string;
  };
}

/**
 * Data file generator for FTP-based frontend communication
 * Follows the factory design pattern as specified in user preferences
 */
class DataFileGenerator {
  private outputDirectory: string;

  constructor(outputDirectory: string = './ftp_data') {
    this.outputDirectory = outputDirectory;
    this.ensureOutputDirectory();
  }

  /**
   * Generate data file from filename
   * Parses filename format: SYMBOL-TIMEFRAME-STARTDATE-ENDDATE.json
   */
  async generateDataFile(fileName: string): Promise<void> {
    try {
      // Parse filename to extract parameters
      const parts = fileName.replace('.json', '').split('-');
      
      if (parts.length !== 4) {
        throw new Error(`Invalid filename format: ${fileName}. Expected: SYMBOL-TIMEFRAME-STARTDATE-ENDDATE.json`);
      }

      const [symbol, timeframe, startDate, endDate] = parts;

      // Validate timeframe
      const validTimeframes = ['1min', '5min', '1hour', '1day'];
      if (!validTimeframes.includes(timeframe)) {
        throw new Error(`Invalid timeframe: ${timeframe}. Valid options: ${validTimeframes.join(', ')}`);
      }

      // Parse and validate dates
      const parsedStartDate = new Date(startDate);
      const parsedEndDate = new Date(endDate);

      if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
        throw new Error(`Invalid date format in filename: ${fileName}`);
      }

      const params: FileGenerationParams = {
        symbol: symbol.toUpperCase(),
        timeframe: timeframe as any,
        startDate: parsedStartDate.toISOString(),
        endDate: parsedEndDate.toISOString()
      };

      logger.info('Generating data file from filename', { fileName, params });

      // Generate the trades file
      await this.generateTradesFile(params);

    } catch (error) {
      logger.error('Failed to generate data file from filename', { fileName, error });
      throw error;
    }
  }

  /**
   * Generate JSON file for trades data query
   * File naming: SYMBOL-TIMEFRAME-STARTDATE-ENDDATE.json
   */
  async generateTradesFile(params: FileGenerationParams): Promise<string> {
    try {
      // Validate input parameters
      const validatedParams = FileGenerationParamsSchema.parse(params);
      
      const fileName = this.generateFileName(validatedParams);
      const filePath = path.join(this.outputDirectory, fileName);

      logger.info('Generating trades file', { fileName, params: validatedParams });

      // Convert to TradesQueryParams format with Date objects
      const queryParams = {
        symbol: validatedParams.symbol,
        timeframe: validatedParams.timeframe,
        startDate: new Date(validatedParams.startDate),
        endDate: new Date(validatedParams.endDate)
      };

      // Query database for trades data
      const tradesData = await DatabaseService.getTradesData(queryParams);

      // Format response with metadata
      const response: TradeDataResponse = {
        metadata: {
          symbol: validatedParams.symbol,
          timeframe: validatedParams.timeframe,
          startDate: validatedParams.startDate,
          endDate: validatedParams.endDate,
          generatedAt: new Date().toISOString(),
          recordCount: tradesData.length
        },
        data: tradesData
      };

      // Write JSON file
      await fs.writeFile(filePath, JSON.stringify(response, null, 2));

      logger.info('Trades file generated successfully', { fileName, recordCount: tradesData.length });
      return fileName;

    } catch (error) {
      logger.error('Failed to generate trades file', { error, params });
      
      // Generate error file for frontend consumption
      await this.generateErrorFile(params, error as Error);
      throw error;
    }
  }

  /**
   * Generate error file with JSON error information
   */
  private async generateErrorFile(params: Partial<FileGenerationParams>, error: Error): Promise<void> {
    try {
      const errorFileName = `error-${Date.now()}.json`;
      const errorFilePath = path.join(this.outputDirectory, errorFileName);

      const errorResponse: TradeDataResponse = {
        metadata: {
          symbol: params.symbol || 'UNKNOWN',
          timeframe: params.timeframe || 'UNKNOWN',
          startDate: params.startDate || '',
          endDate: params.endDate || '',
          generatedAt: new Date().toISOString(),
          recordCount: 0
        },
        data: [],
        error: {
          message: error.message,
          code: 'GENERATION_ERROR'
        }
      };

      await fs.writeFile(errorFilePath, JSON.stringify(errorResponse, null, 2));
      logger.info('Error file generated', { errorFileName });
    } catch (writeError) {
      logger.error('Failed to generate error file', { writeError });
    }
  }

  /**
   * Generate status file for system health monitoring
   */
  async generateStatusFile(): Promise<void> {
    try {
      const statusFileName = 'status.json';
      const statusFilePath = path.join(this.outputDirectory, statusFileName);

      // Get real data from database
      const availableSymbols = await DatabaseService.getAvailableSymbols();
      const lastUpdate = await DatabaseService.getLatestTimestamp();

      // Check if tickers.json exists to include its timestamp
      const tickersPath = path.join(this.outputDirectory, 'tickers.json');
      let tickerFileTimestamp = null;
      try {
        const tickerStats = await fs.stat(tickersPath);
        tickerFileTimestamp = tickerStats.mtime.toISOString();
      } catch {
        // File doesn't exist yet
      }

      const status = {
        system: 'StockTradingBackend',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          database: 'connected',
          ftp: 'running',
          websocket: 'connected'
        },
        dataFreshness: {
          lastUpdate: lastUpdate?.toISOString() || null,
          availableSymbols: availableSymbols,
          tickerFileLastUpdated: tickerFileTimestamp,
          tickerFileGeneration: new Date().toISOString() // Always update this to trigger change detection
        }
      };

      await fs.writeFile(statusFilePath, JSON.stringify(status, null, 2));
      logger.info('Status file generated', { statusFileName });
    } catch (error) {
      logger.error('Failed to generate status file', { error });
    }
  }

  /**
   * Clean up old files to prevent directory bloat
   */
  async cleanupOldFiles(maxAgeHours: number = 24): Promise<void> {
    try {
      const files = await fs.readdir(this.outputDirectory);
      const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);

      for (const file of files) {
        const filePath = path.join(this.outputDirectory, file);
        const stats = await fs.stat(filePath);

        if (stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(filePath);
          logger.info('Cleaned up old file', { file });
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup old files', { error });
    }
  }

  /**
   * Generate consistent file naming: SYMBOL-TIMEFRAME-STARTDATE-ENDDATE.json
   */
  private generateFileName(params: FileGenerationParams): string {
    const startDate = new Date(params.startDate).toISOString().split('T')[0];
    const endDate = new Date(params.endDate).toISOString().split('T')[0];
    
    return `${params.symbol}-${params.timeframe}-${startDate}-${endDate}.json`;
  }

  /**
   * Ensure FTP data directory exists
   */
  private async ensureOutputDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.outputDirectory, { recursive: true });
    } catch (error) {
      logger.error('Failed to create FTP data directory', { error });
    }
  }

  /**
   * Generates a comprehensive tickers.json file with all available tickers from Polygon.io
   * The file includes ticker symbols, company names, descriptions, and market information
   * @param market Market type to filter by (default: 'stocks')
   * @param activeOnly Whether to only include actively traded tickers (default: true)
   * @returns Promise resolving to the path of the generated file
   */
  public async generateTickersFile(
    market: string = 'stocks',
    activeOnly: boolean = true
  ): Promise<string> {
    try {
      logger.info('Starting ticker data generation from Polygon.io');

      // Fetch all tickers from Polygon.io
      const tickers = await PolygonService.fetchAllTickers(market, activeOnly);

      // Transform ticker data for frontend consumption
      const transformedTickers = tickers.map(ticker => ({
        symbol: ticker.ticker,
        name: ticker.name || ticker.ticker,
        description: ticker.description || `${ticker.name} (${ticker.ticker})`,
        sector: this.deriveSectorFromDescription(ticker.description, ticker.sic_description),
        market: ticker.market,
        exchange: ticker.primary_exchange,
        active: ticker.active,
        currency: ticker.currency_name || 'USD',
        marketCap: ticker.market_cap,
        listDate: ticker.list_date,
        type: ticker.type,
        website: ticker.homepage_url,
        logo: ticker.branding?.logo_url,
        icon: ticker.branding?.icon_url,
        employees: ticker.total_employees,
        address: ticker.address ? {
          street: ticker.address.address1,
          city: ticker.address.city,
          state: ticker.address.state,
          zipCode: ticker.address.postal_code
        } : undefined,
        sicCode: ticker.sic_code,
        sicDescription: ticker.sic_description
      }));

      // Add manual fallback symbols for popular tickers that might be missing from Polygon.io
      const manualSymbols = this.getManualFallbackSymbols();
      const polygonSymbols = new Set(transformedTickers.map(t => t.symbol));
      
      // Add symbols that are not already present from Polygon.io
      const additionalSymbols = manualSymbols.filter(manual => !polygonSymbols.has(manual.symbol));
      const finalTickers = [...transformedTickers, ...additionalSymbols];

      logger.info(`Combined ticker data: ${transformedTickers.length} from Polygon.io + ${additionalSymbols.length} manual fallback = ${finalTickers.length} total`);

      // Create the JSON file structure
      const fileData = {
        metadata: {
          generatedAt: new Date().toISOString(),
          source: 'polygon.io',
          market: market,
          activeOnly: activeOnly,
          totalCount: finalTickers.length,
          polygonCount: transformedTickers.length,
          manualCount: additionalSymbols.length,
          apiEndpoint: '/v3/reference/tickers',
          version: '1.1'
        },
        tickers: finalTickers
      };

      // Write the file
      const fileName = 'tickers.json';
      const filePath = path.join(this.outputDirectory, fileName);
      
      await fs.writeFile(filePath, JSON.stringify(fileData, null, 2), 'utf8');
      
      // Update status file after ticker generation to trigger frontend refresh
      await this.generateStatusFile();
      
      logger.info(`Successfully generated ${fileName} with ${finalTickers.length} tickers`, {
        fileName,
        tickerCount: finalTickers.length,
        polygonTickers: transformedTickers.length,
        manualTickers: additionalSymbols.length,
        market,
        activeOnly
      });

      return filePath;

    } catch (error) {
      logger.error('Error generating tickers file', { error });
      throw error;
    }
  }

  /**
   * Manual fallback symbols for popular tickers that might be missing from Polygon.io
   * This ensures the dropdown includes symbols users expect to see even if they're not
   * available in the Polygon.io API results
   */
  private getManualFallbackSymbols(): any[] {
    return [
      {
        symbol: 'VXX',
        name: 'iPath Series B S&P 500 VIX Short-Term Futures ETN',
        description: 'VIX Short-Term Futures ETN (subject to reverse splits)',
        sector: 'ETF',
        market: 'stocks',
        exchange: 'CBOE',
        active: true,
        currency: 'USD',
        type: 'ETN',
        listDate: '2009-01-30'
      },
      {
        symbol: 'UVXY',
        name: 'ProShares Ultra VIX Short-Term Futures ETF',
        description: '1.5x Leveraged VIX Short-Term Futures ETF',
        sector: 'ETF',
        market: 'stocks',
        exchange: 'CBOE',
        active: true,
        currency: 'USD',
        type: 'ETF',
        listDate: '2011-10-03'
      },
      {
        symbol: 'VIXY',
        name: 'ProShares VIX Short-Term Futures ETF',
        description: 'VIX Short-Term Futures ETF (1x exposure)',
        sector: 'ETF',
        market: 'stocks',
        exchange: 'CBOE',
        active: true,
        currency: 'USD',
        type: 'ETF',
        listDate: '2011-01-03'
      },
      {
        symbol: 'TVIX',
        name: 'VelocityShares Daily 2x VIX Short-Term ETN',
        description: '2x Leveraged VIX Short-Term Futures ETN (delisted but popular)',
        sector: 'ETF',
        market: 'stocks',
        exchange: 'NASDAQ',
        active: false,
        currency: 'USD',
        type: 'ETN',
        listDate: '2010-11-30'
      },
      {
        symbol: 'SPXS',
        name: 'Direxion Daily S&P 500 Bear 3X Shares',
        description: '3x Inverse S&P 500 ETF',
        sector: 'ETF',
        market: 'stocks',
        exchange: 'NYSE',
        active: true,
        currency: 'USD',
        type: 'ETF',
        listDate: '2008-11-05'
      },
      {
        symbol: 'SPXU',
        name: 'ProShares UltraPro Short S&P500',
        description: '3x Inverse S&P 500 ETF',
        sector: 'ETF',
        market: 'stocks',
        exchange: 'NYSE',
        active: true,
        currency: 'USD',
        type: 'ETF',
        listDate: '2009-06-25'
      },
      {
        symbol: 'SQQQ',
        name: 'ProShares UltraPro Short QQQ',
        description: '3x Inverse NASDAQ-100 ETF',
        sector: 'ETF',
        market: 'stocks',
        exchange: 'NASDAQ',
        active: true,
        currency: 'USD',
        type: 'ETF',
        listDate: '2010-02-09'
      },
      {
        symbol: 'WULF',
        name: 'TeraWulf Inc.',
        description: 'Bitcoin mining company with environmentally clean facilities',
        sector: 'Technology',
        market: 'stocks',
        exchange: 'NASDAQ',
        active: true,
        currency: 'USD',
        type: 'CS',
        listDate: '2021-02-08'
      }
    ];
  }

  /**
   * Derives a sector classification from ticker description and SIC description
   * @param description Company description
   * @param sicDescription SIC industry description
   * @returns Sector classification string
   */
  private deriveSectorFromDescription(description?: string, sicDescription?: string): string {
    const text = `${description || ''} ${sicDescription || ''}`.toLowerCase();

    // Technology sector keywords
    if (text.includes('software') || text.includes('technology') || text.includes('internet') || 
        text.includes('computer') || text.includes('electronic') || text.includes('semiconductor') ||
        text.includes('cloud') || text.includes('digital') || text.includes('tech')) {
      return 'Technology';
    }

    // Healthcare sector keywords
    if (text.includes('pharmaceutical') || text.includes('healthcare') || text.includes('medical') ||
        text.includes('biotech') || text.includes('drug') || text.includes('hospital')) {
      return 'Healthcare';
    }

    // Financial sector keywords
    if (text.includes('bank') || text.includes('financial') || text.includes('insurance') ||
        text.includes('credit') || text.includes('investment') || text.includes('capital')) {
      return 'Financial';
    }

    // Energy sector keywords
    if (text.includes('oil') || text.includes('energy') || text.includes('gas') ||
        text.includes('petroleum') || text.includes('renewable')) {
      return 'Energy';
    }

    // Consumer sector keywords
    if (text.includes('retail') || text.includes('consumer') || text.includes('restaurant') ||
        text.includes('food') || text.includes('beverage') || text.includes('apparel')) {
      return 'Consumer Goods';
    }

    // Industrial sector keywords
    if (text.includes('manufacturing') || text.includes('industrial') || text.includes('aerospace') ||
        text.includes('defense') || text.includes('construction') || text.includes('machinery')) {
      return 'Industrial';
    }

    // Transportation sector keywords
    if (text.includes('airline') || text.includes('transportation') || text.includes('shipping') ||
        text.includes('logistics') || text.includes('freight')) {
      return 'Transportation';
    }

    // Real Estate sector keywords
    if (text.includes('real estate') || text.includes('property') || text.includes('reit')) {
      return 'Real Estate';
    }

    // Entertainment sector keywords
    if (text.includes('entertainment') || text.includes('media') || text.includes('gaming') ||
        text.includes('streaming') || text.includes('broadcasting')) {
      return 'Entertainment';
    }

    // Telecommunications sector keywords
    if (text.includes('telecommunication') || text.includes('wireless') || text.includes('cellular') ||
        text.includes('telecom')) {
      return 'Telecommunications';
    }

    // Utilities sector keywords
    if (text.includes('utility') || text.includes('electric') || text.includes('water') ||
        text.includes('power')) {
      return 'Utilities';
    }

    // ETF classification
    if (text.includes('etf') || text.includes('exchange traded fund') || text.includes('index fund')) {
      return 'ETF';
    }

    // Default classification
    return 'Other';
  }

  /**
   * Generates a search-optimized ticker index for fast frontend filtering
   * @returns Promise resolving to the path of the generated index file
   */
  public async generateTickerIndex(): Promise<string> {
    try {
      const tickersFilePath = path.join(this.outputDirectory, 'tickers.json');
      const tickersData = JSON.parse(await fs.readFile(tickersFilePath, 'utf8'));

      // Create search index with simplified structure for fast filtering
      const searchIndex = tickersData.tickers.map((ticker: any) => ({
        symbol: ticker.symbol,
        name: ticker.name,
        sector: ticker.sector,
        searchText: `${ticker.symbol} ${ticker.name} ${ticker.sector}`.toLowerCase()
      }));

      const indexData = {
        metadata: {
          generatedAt: new Date().toISOString(),
          source: 'derived_from_tickers',
          totalCount: searchIndex.length,
          version: '1.0'
        },
        index: searchIndex
      };

      const fileName = 'ticker-index.json';
      const filePath = path.join(this.outputDirectory, fileName);
      
      await fs.writeFile(filePath, JSON.stringify(indexData, null, 2), 'utf8');
      
      logger.info(`Successfully generated ${fileName} with ${searchIndex.length} ticker entries`);

      return filePath;

    } catch (error) {
      logger.error('Error generating ticker index', { error });
      throw error;
    }
  }

  /**
   * Generate trades data as JSON (for socket communication)
   */
  async generateTradesData(params: FileGenerationParams): Promise<TradeDataResponse> {
    try {
      // Validate input parameters
      const validatedParams = FileGenerationParamsSchema.parse(params);
      
      logger.info('Generating trades data for socket', { params: validatedParams });

      // Convert to TradesQueryParams format with Date objects
      const queryParams = {
        symbol: validatedParams.symbol,
        timeframe: validatedParams.timeframe,
        startDate: new Date(validatedParams.startDate),
        endDate: new Date(validatedParams.endDate)
      };

      // Query database for trades data
      const tradesData = await DatabaseService.getTradesData(queryParams);

      // Format response with metadata
      const response: TradeDataResponse = {
        metadata: {
          symbol: validatedParams.symbol,
          timeframe: validatedParams.timeframe,
          startDate: validatedParams.startDate,
          endDate: validatedParams.endDate,
          generatedAt: new Date().toISOString(),
          recordCount: tradesData.length
        },
        data: tradesData
      };

      logger.info('Trades data generated for socket', { recordCount: tradesData.length });
      return response;

    } catch (error) {
      logger.error('Failed to generate trades data for socket', { error, params });
      throw error;
    }
  }

  /**
   * Generate status data as JSON (for socket communication)
   */
  async generateStatusData(): Promise<any> {
    try {
      // Get real data from database
      const availableSymbols = await DatabaseService.getAvailableSymbols();
      const lastUpdate = await DatabaseService.getLatestTimestamp();

      const status = {
        system: 'StockTradingBackend',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          database: 'connected',
          socket: 'running',
          polygon: 'subscribed'
        },
        dataFreshness: {
          lastUpdate: lastUpdate?.toISOString() || null,
          availableSymbols: availableSymbols,
          generatedAt: new Date().toISOString()
        }
      };

      logger.info('Status data generated for socket', { symbolCount: availableSymbols.length });
      return status;

    } catch (error) {
      logger.error('Failed to generate status data for socket', { error });
      throw error;
    }
  }

  /**
   * Generate tickers data as JSON (for socket communication)
   */
  async generateTickersData(): Promise<any> {
    try {
      logger.info('Generating tickers data for socket');

      // Fetch all tickers from Polygon.io
      const tickers = await PolygonService.fetchAllTickers('stocks', true);

      // Transform ticker data for frontend consumption
      const transformedTickers = tickers.map(ticker => ({
        symbol: ticker.ticker,
        name: ticker.name || ticker.ticker,
        description: ticker.description || `${ticker.name} (${ticker.ticker})`,
        sector: this.deriveSectorFromDescription(ticker.description, ticker.sic_description),
        market: ticker.market,
        exchange: ticker.primary_exchange,
        active: ticker.active,
        currency: ticker.currency_name || 'USD',
        marketCap: ticker.market_cap,
        listDate: ticker.list_date,
        type: ticker.type,
        website: ticker.homepage_url,
        logo: ticker.branding?.logo_url,
        icon: ticker.branding?.icon_url,
        employees: ticker.total_employees,
        address: ticker.address ? {
          street: ticker.address.address1,
          city: ticker.address.city,
          state: ticker.address.state,
          zipCode: ticker.address.postal_code
        } : undefined,
        sicCode: ticker.sic_code,
        sicDescription: ticker.sic_description
      }));

      // Add manual fallback symbols for popular tickers
      const manualSymbols = this.getManualFallbackSymbols();
      const polygonSymbols = new Set(transformedTickers.map(t => t.symbol));
      
      // Add symbols that are not already present from Polygon.io
      const additionalSymbols = manualSymbols.filter(manual => !polygonSymbols.has(manual.symbol));
      const finalTickers = [...transformedTickers, ...additionalSymbols];

      logger.info(`Tickers data generated for socket: ${transformedTickers.length} from Polygon.io + ${additionalSymbols.length} manual = ${finalTickers.length} total`);

      // Create the JSON response structure
      const response = {
        metadata: {
          generatedAt: new Date().toISOString(),
          source: 'polygon.io',
          market: 'stocks',
          activeOnly: true,
          totalCount: finalTickers.length,
          polygonCount: transformedTickers.length,
          manualCount: additionalSymbols.length,
          apiEndpoint: '/v3/reference/tickers',
          version: '1.1'
        },
        tickers: finalTickers
      };

      logger.info('Tickers data generated for socket', { tickerCount: finalTickers.length });
      return response;

    } catch (error) {
      logger.error('Failed to generate tickers data for socket', { error });
      throw error;
    }
  }
}

/**
 * Factory for creating DataFileGenerator instances
 * Follows the factory design pattern as specified in user preferences
 */
class DataFileGeneratorFactory {
  private static instance: DataFileGenerator | null = null;

  /**
   * Creates or returns existing DataFileGenerator instance
   * @param outputDirectory Directory for generated files
   * @returns DataFileGenerator instance
   */
  public static create(outputDirectory?: string): DataFileGenerator {
    if (!this.instance) {
      this.instance = new DataFileGenerator(outputDirectory);
    }
    return this.instance;
  }

  /**
   * Creates a new DataFileGenerator instance (for testing or multiple directories)
   * @param outputDirectory Directory for generated files
   * @returns New DataFileGenerator instance
   */
  public static createNew(outputDirectory?: string): DataFileGenerator {
    return new DataFileGenerator(outputDirectory);
  }
}

export default DataFileGeneratorFactory;