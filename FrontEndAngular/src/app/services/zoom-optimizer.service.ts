import { Injectable } from '@angular/core';
import { Chart } from 'chart.js';

interface ZoomOperation {
  id: string;
  chart: Chart;
  operation: 'zoom' | 'pan' | 'reset';
  params: any;
  timestamp: number;
  priority: 'high' | 'normal' | 'low';
}

@Injectable({
  providedIn: 'root'
})
export class ZoomOptimizerService {
  private zoomQueue: ZoomOperation[] = [];
  private isProcessing = false;
  private frameId: number | null = null;
  private debounceTimers = new Map<string, number>();
  private lastProcessedTime = 0;
  private readonly MAX_FPS = 60;
  private readonly FRAME_TIME = 1000 / this.MAX_FPS;

  constructor() {}

  /**
   * Asynchronously schedule a zoom operation
   */
  async scheduleZoom(chart: Chart, operation: 'zoom' | 'pan' | 'reset', params: any, priority: 'high' | 'normal' | 'low' = 'normal'): Promise<void> {
    return new Promise((resolve) => {
      const zoomOp: ZoomOperation = {
        id: `${chart.id || 'chart'}_${operation}_${Date.now()}`,
        chart,
        operation,
        params,
        timestamp: Date.now(),
        priority
      };

      // Add to queue with priority sorting
      this.zoomQueue.push(zoomOp);
      this.zoomQueue.sort((a, b) => {
        const priorityOrder = { high: 3, normal: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority] || a.timestamp - b.timestamp;
      });

      // Start processing if not already running
      if (!this.isProcessing) {
        this.processQueue().then(() => resolve());
      } else {
        resolve(); // Resolve immediately for queued operations
      }
    });
  }

  /**
   * Process the zoom queue asynchronously using RAF
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.zoomQueue.length === 0) return;
    
    this.isProcessing = true;

    return new Promise((resolve) => {
      const processFrame = () => {
        const now = performance.now();
        
        // Throttle to maximum FPS
        if (now - this.lastProcessedTime < this.FRAME_TIME) {
          this.frameId = requestAnimationFrame(processFrame);
          return;
        }

        this.lastProcessedTime = now;

        // Process one operation per frame to maintain responsiveness
        const operation = this.zoomQueue.shift();
        if (operation) {
          this.executeZoomOperation(operation);
        }

        // Continue processing or finish
        if (this.zoomQueue.length > 0) {
          this.frameId = requestAnimationFrame(processFrame);
        } else {
          this.isProcessing = false;
          resolve();
        }
      };

      this.frameId = requestAnimationFrame(processFrame);
    });
  }

  /**
   * Execute a single zoom operation with optimizations
   */
  private executeZoomOperation(operation: ZoomOperation): void {
    try {
      const { chart, operation: op, params } = operation;
      
      switch (op) {
        case 'zoom':
          this.performOptimizedZoom(chart, params);
          break;
        case 'pan':
          this.performOptimizedPan(chart, params);
          break;
        case 'reset':
          this.performOptimizedReset(chart);
          break;
      }
    } catch (error) {
      console.warn('⚠️ Zoom operation failed:', error);
    }
  }

  /**
   * Optimized zoom with minimal reflow
   */
  private performOptimizedZoom(chart: Chart, params: any): void {
    const xAxis = chart.scales['x'];
    if (!xAxis) return;

    // Batch DOM updates
    chart.canvas.style.transform = 'scale(1)'; // Reset any CSS transforms
    
    // Use the most efficient update mode
    if ((chart as any).zoomScale) {
      (chart as any).zoomScale('x', params, 'none');
    } else {
      xAxis.min = params.min;
      xAxis.max = params.max;
      chart.update('none'); // Skip animations for performance
    }
  }

  /**
   * Optimized pan with boundary checking
   */
  private performOptimizedPan(chart: Chart, params: { deltaX: number }): void {
    const xAxis = chart.scales['x'];
    if (!xAxis || typeof xAxis.min !== 'number' || typeof xAxis.max !== 'number') return;

    const range = xAxis.max - xAxis.min;
    const panAmount = range * (params.deltaX / (chart.canvas?.clientWidth || 800));
    
    // Optimized boundary checking
    const data = chart.data.datasets[0]?.data as any[];
    if (data && data.length > 0) {
      const dataStart = new Date(data[0].x).getTime();
      const dataEnd = new Date(data[data.length - 1].x).getTime();
      
      const newMin = Math.max(xAxis.min + panAmount, dataStart - range * 0.05);
      const newMax = Math.min(xAxis.max + panAmount, dataEnd + range * 0.05);
      
      xAxis.min = newMin;
      xAxis.max = newMax;
      chart.update('none');
    }
  }

  /**
   * Optimized reset operation
   */
  private performOptimizedReset(chart: Chart): void {
    if ((chart as any).resetZoom) {
      (chart as any).resetZoom('none');
    }
  }

  /**
   * Debounced zoom for rapid consecutive operations
   */
  debounceZoom(chartId: string, callback: () => void, delay: number = 16): void {
    // Clear existing timer
    if (this.debounceTimers.has(chartId)) {
      clearTimeout(this.debounceTimers.get(chartId)!);
    }

    // Set new timer
    const timerId = window.setTimeout(() => {
      callback();
      this.debounceTimers.delete(chartId);
    }, delay);

    this.debounceTimers.set(chartId, timerId);
  }

  /**
   * Cleanup method
   */
  destroy(): void {
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
    }
    
    this.debounceTimers.forEach(timerId => clearTimeout(timerId));
    this.debounceTimers.clear();
    this.zoomQueue.length = 0;
    this.isProcessing = false;
  }
}