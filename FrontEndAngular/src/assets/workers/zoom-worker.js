/**
 * Web Worker for heavy zoom calculations
 * Offloads data processing from the main thread
 */

class ZoomWorker {
  constructor() {
    this.dataCache = new Map();
    this.boundaryCache = new Map();
  }

  /**
   * Calculate visible data points for a given zoom level
   */
  calculateVisibleData(data, minTime, maxTime, decimationFactor = 1) {
    const startTime = performance.now();
    
    try {
      // Create cache key
      const cacheKey = `${minTime}-${maxTime}-${decimationFactor}`;
      
      // Check cache first
      if (this.dataCache.has(cacheKey)) {
        const cached = this.dataCache.get(cacheKey);
        postMessage({
          type: 'visibleData',
          data: cached.data,
          metadata: {
            ...cached.metadata,
            cached: true,
            processingTime: performance.now() - startTime
          }
        });
        return;
      }

      // Filter visible data points
      const visibleData = data.filter(point => {
        const pointTime = new Date(point.x).getTime();
        return pointTime >= minTime && pointTime <= maxTime;
      });

      // Apply decimation for performance (show every nth point when zoomed out)
      let processedData = visibleData;
      if (decimationFactor > 1) {
        processedData = visibleData.filter((_, index) => index % decimationFactor === 0);
      }

      // Calculate metadata
      const metadata = {
        totalPoints: data.length,
        visiblePoints: visibleData.length,
        renderedPoints: processedData.length,
        decimationFactor,
        processingTime: performance.now() - startTime,
        timeRange: { min: minTime, max: maxTime },
        cached: false
      };

      // Cache the result
      this.dataCache.set(cacheKey, { data: processedData, metadata });
      
      // Limit cache size
      if (this.dataCache.size > 50) {
        const firstKey = this.dataCache.keys().next().value;
        this.dataCache.delete(firstKey);
      }

      postMessage({
        type: 'visibleData',
        data: processedData,
        metadata
      });

    } catch (error) {
      postMessage({
        type: 'error',
        error: error.message,
        processingTime: performance.now() - startTime
      });
    }
  }

  /**
   * Calculate optimal zoom boundaries
   */
  calculateZoomBoundaries(data, currentMin, currentMax, zoomDirection, zoomFactor) {
    const startTime = performance.now();
    
    try {
      if (!data || data.length === 0) {
        throw new Error('No data available for boundary calculation');
      }

      const dataStart = new Date(data[0].x).getTime();
      const dataEnd = new Date(data[data.length - 1].x).getTime();
      const currentRange = currentMax - currentMin;
      
      let newMin, newMax;
      
      if (zoomDirection === 'in') {
        // Zoom in - reduce range
        const newRange = currentRange * (1 - zoomFactor);
        const center = (currentMin + currentMax) / 2;
        newMin = center - newRange / 2;
        newMax = center + newRange / 2;
      } else {
        // Zoom out - increase range
        const newRange = currentRange * (1 + zoomFactor);
        const center = (currentMin + currentMax) / 2;
        newMin = center - newRange / 2;
        newMax = center + newRange / 2;
      }

      // Apply boundaries with padding
      const padding = (dataEnd - dataStart) * 0.05;
      newMin = Math.max(newMin, dataStart - padding);
      newMax = Math.min(newMax, dataEnd + padding);

      // Calculate decimation factor based on zoom level
      const totalRange = dataEnd - dataStart;
      const visibleRange = newMax - newMin;
      const zoomRatio = totalRange / visibleRange;
      
      let decimationFactor = 1;
      if (zoomRatio < 0.1) decimationFactor = 10;
      else if (zoomRatio < 0.2) decimationFactor = 5;
      else if (zoomRatio < 0.5) decimationFactor = 2;

      postMessage({
        type: 'zoomBoundaries',
        boundaries: { min: newMin, max: newMax },
        decimationFactor,
        metadata: {
          zoomRatio,
          originalRange: currentRange,
          newRange: newMax - newMin,
          processingTime: performance.now() - startTime
        }
      });

    } catch (error) {
      postMessage({
        type: 'error',
        error: error.message,
        processingTime: performance.now() - startTime
      });
    }
  }

  /**
   * Precompute zoom levels for smooth interaction
   */
  precomputeZoomLevels(data, levels = [0.1, 0.25, 0.5, 0.75, 1.0]) {
    const startTime = performance.now();
    
    try {
      const dataStart = new Date(data[0].x).getTime();
      const dataEnd = new Date(data[data.length - 1].x).getTime();
      const totalRange = dataEnd - dataStart;
      
      const precomputedLevels = levels.map(level => {
        const rangeSize = totalRange * level;
        const center = (dataStart + dataEnd) / 2;
        const min = center - rangeSize / 2;
        const max = center + rangeSize / 2;
        
        // Calculate decimation factor
        let decimationFactor = 1;
        if (level < 0.1) decimationFactor = 10;
        else if (level < 0.2) decimationFactor = 5;
        else if (level < 0.5) decimationFactor = 2;
        
        return {
          level,
          boundaries: { min, max },
          decimationFactor,
          estimatedPoints: Math.floor(data.length * level / decimationFactor)
        };
      });

      postMessage({
        type: 'precomputedLevels',
        levels: precomputedLevels,
        metadata: {
          totalDataPoints: data.length,
          processingTime: performance.now() - startTime
        }
      });

    } catch (error) {
      postMessage({
        type: 'error',
        error: error.message,
        processingTime: performance.now() - startTime
      });
    }
  }
}

// Initialize worker
const zoomWorker = new ZoomWorker();

// Handle messages from main thread
self.onmessage = function(e) {
  const { type, data } = e.data;
  
  switch (type) {
    case 'calculateVisibleData':
      zoomWorker.calculateVisibleData(
        data.chartData,
        data.minTime,
        data.maxTime,
        data.decimationFactor
      );
      break;
      
    case 'calculateZoomBoundaries':
      zoomWorker.calculateZoomBoundaries(
        data.chartData,
        data.currentMin,
        data.currentMax,
        data.zoomDirection,
        data.zoomFactor
      );
      break;
      
    case 'precomputeZoomLevels':
      zoomWorker.precomputeZoomLevels(data.chartData, data.levels);
      break;
      
    default:
      postMessage({
        type: 'error',
        error: `Unknown message type: ${type}`
      });
  }
};