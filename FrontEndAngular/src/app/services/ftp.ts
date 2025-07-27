import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class FtpService {
  private ftpProxyUrl = `${environment.apiUrl}/ftp-proxy`;

  constructor(private http: HttpClient) { }

  /**
   * Downloads a file from the FTP server via HTTP proxy.
   * This maintains FTP-first architecture while providing browser compatibility.
   * @param fileName The name of the file to download from the FTP server.
   * @returns A promise that resolves with the parsed JSON data from the file.
   */
  async downloadFile(fileName: string): Promise<any> {
    try {
      const response = await this.http.get(`${this.ftpProxyUrl}/${fileName}`).toPromise();
      return response;
    } catch (error) {
      console.error('FTP proxy download error:', error);
      throw error;
    }
  }

  /**
   * Downloads a file from the FTP server as an Observable.
   * @param fileName The name of the file to download from the FTP server.
   * @returns An Observable that emits the parsed JSON data from the file.
   */
  downloadFileObservable(fileName: string): Observable<any> {
    return this.http.get(`${this.ftpProxyUrl}/${fileName}`).pipe(
      catchError(error => {
        console.error('FTP proxy download error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Lists available files on the FTP server.
   * @returns A promise that resolves with an array of file names.
   */
  async listFiles(): Promise<string[]> {
    try {
      const response = await this.http.get<{ files: string[] }>(this.ftpProxyUrl).toPromise();
      return response?.files || [];
    } catch (error) {
      console.error('FTP proxy list error:', error);
      throw error;
    }
  }

  /**
   * Lists available files on the FTP server as an Observable.
   * @returns An Observable that emits an array of file names.
   */
  listFilesObservable(): Observable<string[]> {
    return this.http.get<{ files: string[] }>(this.ftpProxyUrl).pipe(
      map(response => response.files || []),
      catchError(error => {
        console.error('FTP proxy list error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Generates a file name based on stock data parameters.
   * Format: SYMBOL-TIMEFRAME-STARTDATE-ENDDATE.json
   */
  generateFileName(symbol: string, timeframe: string, startDate: string, endDate: string): string {
    return `${symbol}-${timeframe}-${startDate}-${endDate}.json`;
  }

  /**
   * Downloads stock data with specified parameters.
   * @param symbol Stock symbol (e.g., 'AAPL')
   * @param timeframe Data timeframe (e.g., '1min', '1hour', '1day')
   * @param startDate Start date in ISO format
   * @param endDate End date in ISO format
   */
  async downloadStockData(symbol: string, timeframe: string, startDate: string, endDate: string): Promise<any> {
    const fileName = this.generateFileName(symbol, timeframe, startDate, endDate);
    return this.downloadFile(fileName);
  }

  /**
   * Downloads stock data as an Observable.
   */
  downloadStockDataObservable(symbol: string, timeframe: string, startDate: string, endDate: string): Observable<any> {
    const fileName = this.generateFileName(symbol, timeframe, startDate, endDate);
    return this.downloadFileObservable(fileName);
  }
}
