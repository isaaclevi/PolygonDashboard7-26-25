import { Component, Input, ViewChild, AfterViewInit, OnDestroy, OnChanges, SimpleChanges, HostListener, ElementRef } from '@angular/core';
import { PriceChartComponent } from '../price-chart/price-chart.component';
import { VolumeChartComponent } from '../volume-chart/volume-chart.component';
import { TimeScaleComponent } from '../time-scale/time-scale.component';
import { DualChartData } from '../../../models/stock-data.interface';
import { ChartColorConfig } from '../../../models/chart-config.interface';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import { ChartService } from '../../../services/chart';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import 'chartjs-adapter-date-fns';

Chart.register(...registerables);

interface ScrollbarState {
  position: number; // Percentage position (0-100)
  thumbSize: number; // Percentage size (0-100)
  isDragging: boolean;
  dragStartX: number;
  dragStartPosition: number;
}

interface TimeRange {
  start: number;
  end: number;
}

@Component({
  selector: 'app-chart-container',
  templateUrl: './chart-container.component.html',
  styleUrls: ['./chart-container.component.scss'],
  standalone: true,
  imports: [PriceChartComponent, VolumeChartComponent, TimeScaleComponent, CommonModule, MatButtonModule, MatIconModule, MatTooltipModule]
})
export class ChartContainerComponent implements AfterViewInit, OnDestroy, OnChanges {
  @Input() chartData!: DualChartData;
  @Input() chartColors!: ChartColorConfig;
  
  @ViewChild(PriceChartComponent) priceChartComponent!: PriceChartComponent;
  @ViewChild(VolumeChartComponent) volumeChartComponent!: VolumeChartComponent;
  @ViewChild('priceScrollbar') priceScrollbarRef!: ElementRef<HTMLDivElement>;
  @ViewChild('volumeScrollbar') volumeScrollbarRef!: ElementRef<HTMLDivElement>;

  priceScrollState: ScrollbarState = {
    position: 0,
    thumbSize: 100,
    isDragging: false,
    dragStartX: 0,
    dragStartPosition: 0
  };

  volumeScrollState: ScrollbarState = {
    position: 0,
    thumbSize: 100,
    isDragging: false,
    dragStartX: 0,
    dragStartPosition: 0
  };

  private updateScrollbarInterval: any;
  private currentlyDragging: 'price' | 'volume' | null = null;

  // Total data time range
  totalTimeRange: TimeRange = { start: 0, end: 0 };

  // Individual chart time ranges for precise tracking
  priceTimeRange: TimeRange = { start: 0, end: 0 };
  volumeTimeRange: TimeRange = { start: 0, end: 0 };
  priceChartWidth: number = 800;
  volumeChartWidth: number = 800;

  constructor(private chartService: ChartService) {}

  ngAfterViewInit(): void {
    // Wait a bit for charts to be created, then link them
    setTimeout(() => {
      this.linkCharts();
      this.startScrollbarSync();
      this.debugScrollbarSetup();
      this.initializeTimeRanges();
      this.startTimeRangeSync();
    }, 200);
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Update time ranges when chart data changes
    if (changes['chartData'] && this.chartData) {
      this.updateTotalTimeRange();
    }
  }
  
  private debugScrollbarSetup(): void {
    console.log('📊 Scrollbar setup debugging:');
    console.log('Price scrollbar element:', this.priceScrollbarRef?.nativeElement);
    console.log('Volume scrollbar element:', this.volumeScrollbarRef?.nativeElement);
    console.log('Price chart:', this.priceChartComponent?.chart);
    console.log('Volume chart:', this.volumeChartComponent?.chart);
    
    // Test scrollbar functionality
    if (this.priceScrollbarRef?.nativeElement) {
      console.log('✅ Price scrollbar element is accessible');
    } else {
      console.error('❌ Price scrollbar element not found');
    }
    
    if (this.volumeScrollbarRef?.nativeElement) {
      console.log('✅ Volume scrollbar element is accessible');
    } else {
      console.error('❌ Volume scrollbar element not found');
    }
  }

  ngOnDestroy(): void {
    if (this.updateScrollbarInterval) {
      clearInterval(this.updateScrollbarInterval);
    }
  }

  private initializeTimeRanges(): void {
    this.updateTotalTimeRange();
    this.updateIndividualChartTimeRanges();
    this.updateIndividualChartWidths();
    
    console.log('📊 Time ranges initialized:', {
      total: {
        start: new Date(this.totalTimeRange.start).toISOString(),
        end: new Date(this.totalTimeRange.end).toISOString()
      },
      price: {
        start: new Date(this.priceTimeRange.start).toISOString(),
        end: new Date(this.priceTimeRange.end).toISOString()
      },
      volume: {
        start: new Date(this.volumeTimeRange.start).toISOString(),
        end: new Date(this.volumeTimeRange.end).toISOString()
      },
      priceChartWidth: this.priceChartWidth,
      volumeChartWidth: this.volumeChartWidth
    });
  }

  private updateTotalTimeRange(): void {
    if (!this.chartData || !this.chartData.priceData || this.chartData.priceData.length === 0) {
      this.totalTimeRange = { start: 0, end: 0 };
      return;
    }

    const priceData = this.chartData.priceData;
    this.totalTimeRange = {
      start: priceData[0].x,
      end: priceData[priceData.length - 1].x
    };
  }


  private updateIndividualChartTimeRanges(): void {
    // Update price chart time range
    const priceChart = this.priceChartComponent?.chart;
    if (priceChart) {
      const xAxis = priceChart.scales['x'];
      if (xAxis && typeof xAxis.min === 'number' && typeof xAxis.max === 'number') {
        this.priceTimeRange = {
          start: xAxis.min,
          end: xAxis.max
        };
      } else {
        this.priceTimeRange = { ...this.totalTimeRange };
      }
    }

    // Update volume chart time range
    const volumeChart = this.volumeChartComponent?.chart;
    if (volumeChart) {
      const xAxis = volumeChart.scales['x'];
      if (xAxis && typeof xAxis.min === 'number' && typeof xAxis.max === 'number') {
        this.volumeTimeRange = {
          start: xAxis.min,
          end: xAxis.max
        };
      } else {
        this.volumeTimeRange = { ...this.totalTimeRange };
      }
    }
  }

  private updateIndividualChartWidths(): void {
    // Update price chart width
    const priceChart = this.priceChartComponent?.chart;
    if (priceChart && priceChart.canvas) {
      this.priceChartWidth = priceChart.canvas.clientWidth || 800;
    }

    // Update volume chart width
    const volumeChart = this.volumeChartComponent?.chart;
    if (volumeChart && volumeChart.canvas) {
      this.volumeChartWidth = volumeChart.canvas.clientWidth || 800;
    }
  }

  private startTimeRangeSync(): void {
    // Update time ranges more frequently than scrollbar sync for smoother updates
    setInterval(() => {
      if (!this.priceScrollState.isDragging && !this.volumeScrollState.isDragging) {
        this.updateIndividualChartTimeRanges();
        this.updateIndividualChartWidths();
      }
    }, 100); // Update every 100ms
  }

  private linkCharts(): void {
    const priceChart = this.priceChartComponent?.chart;
    const volumeChart = this.volumeChartComponent?.chart;
    
    if (priceChart && volumeChart) {
      this.chartService.linkCharts(priceChart, volumeChart);
      console.log('Charts linked for synchronized zooming and scrolling');
      
      // Add event listeners for time range changes
      this.setupTimeRangeListeners(priceChart);
      this.setupTimeRangeListeners(volumeChart);
    }
  }

  private setupTimeRangeListeners(chart: Chart): void {
    if (!chart.canvas) return;

    chart.canvas.addEventListener('timeRangeChanged', (event: any) => {
      const detail = event.detail;
      console.log('📊 Time range changed:', detail);
      
      // Update individual chart time ranges immediately
      if (detail.chartType === 'price') {
        this.priceTimeRange = {
          start: detail.timeRange.min,
          end: detail.timeRange.max
        };
      } else if (detail.chartType === 'volume') {
        this.volumeTimeRange = {
          start: detail.timeRange.min,
          end: detail.timeRange.max
        };
      }
      
      // Update chart widths if needed
      this.updateIndividualChartWidths();
      
      // Ensure both charts are perfectly synchronized
      const priceChart = this.priceChartComponent?.chart;
      const volumeChart = this.volumeChartComponent?.chart;
      
      if (priceChart && volumeChart) {
        // Sync the other chart and update its time range
        if (detail.chartType === 'price') {
          this.chartService.synchronizeChartTimeRanges(priceChart, volumeChart);
          // Volume chart should match price chart exactly
          this.volumeTimeRange = { ...this.priceTimeRange };
        } else if (detail.chartType === 'volume') {
          this.chartService.synchronizeChartTimeRanges(volumeChart, priceChart);
          // Price chart should match volume chart exactly
          this.priceTimeRange = { ...this.volumeTimeRange };
        }
      }
    });
  }

  private startScrollbarSync(): void {
    // Update scrollbar positions less frequently to avoid interference with pan events
    this.updateScrollbarInterval = setInterval(() => {
      // Only update if neither scrollbar is being dragged
      if (!this.priceScrollState.isDragging && !this.volumeScrollState.isDragging) {
        this.updateScrollbarStates();
      }
    }, 250); // Reduced from 100ms to 250ms for better pan responsiveness
  }

  private updateScrollbarStates(): void {
    const priceChart = this.priceChartComponent?.chart;
    const volumeChart = this.volumeChartComponent?.chart;

    if (priceChart) {
      this.updateScrollbarState(priceChart, this.priceScrollState);
    }

    if (volumeChart) {
      this.updateScrollbarState(volumeChart, this.volumeScrollState);
    }
  }

  private updateScrollbarState(chart: Chart, scrollState: ScrollbarState): void {
    if (!chart || scrollState.isDragging) return;

    try {
      const xAxis = chart.scales['x'];
      const data = chart.data.datasets[0]?.data as any[];
      
      if (!xAxis || !data || data.length === 0) {
        scrollState.thumbSize = 100;
        scrollState.position = 0;
        console.log('📊 Scrollbar state reset: no data or axis');
        return;
      }

      const currentMin = xAxis.min;
      const currentMax = xAxis.max;
      const dataStart = new Date(data[0].x).getTime();
      const dataEnd = new Date(data[data.length - 1].x).getTime();
      
      const totalRange = dataEnd - dataStart;
      const visibleRange = currentMax - currentMin;
      
      if (totalRange <= 0 || visibleRange <= 0) {
        scrollState.thumbSize = 100;
        scrollState.position = 0;
        return;
      }
      
      // Calculate thumb size as percentage of visible vs total data
      const thumbSizePercent = (visibleRange / totalRange) * 100;
      scrollState.thumbSize = Math.max(5, Math.min(100, thumbSizePercent));
      
      // Calculate position as percentage - ensure it represents the actual visible start
      const visibleStart = Math.max(currentMin, dataStart);
      let positionPercent = 0;
      
      // Avoid division by zero when fully zoomed out
      if (totalRange > visibleRange && totalRange > 0) {
        positionPercent = ((visibleStart - dataStart) / totalRange) * 100;
      }
      
      // Clamp position to valid range considering thumb size
      scrollState.position = Math.max(0, Math.min(100 - scrollState.thumbSize, positionPercent));
      
      // Log scrollbar state for debugging (reduce frequency)
      if (Math.random() < 0.05) { // Log only 5% of the time to reduce noise
        console.log('📊 Scrollbar state updated:', {
          chartType: (chart as any).chartType || 'unknown',
          thumbSize: scrollState.thumbSize.toFixed(1),
          position: scrollState.position.toFixed(1),
          visibleRange: Math.round(visibleRange),
          totalRange: Math.round(totalRange),
          visibleStart: new Date(visibleStart).toISOString(),
          currentMin: new Date(currentMin).toISOString(),
          currentMax: new Date(currentMax).toISOString()
        });
      }

    } catch (error) {
      console.warn('⚠️ Error updating scrollbar state:', error);
    }
  }

  startScrollbarDrag(event: MouseEvent | TouchEvent, chartType: 'price' | 'volume'): void {
    event.preventDefault();
    event.stopPropagation();
    
    console.log(`👆 Starting scrollbar drag for ${chartType} chart`);
    
    const scrollState = chartType === 'price' ? this.priceScrollState : this.volumeScrollState;
    const clientX = event instanceof MouseEvent ? event.clientX : event.touches[0].clientX;
    
    // Verify chart is available
    const chart = chartType === 'price' ? 
      this.priceChartComponent?.chart : 
      this.volumeChartComponent?.chart;
      
    if (!chart) {
      console.error(`❌ ${chartType} chart not available for scrollbar drag`);
      return;
    }
    
    scrollState.isDragging = true;
    scrollState.dragStartX = clientX;
    scrollState.dragStartPosition = scrollState.position;
    this.currentlyDragging = chartType;
    
    console.log(`📊 Initial scroll state:`, {
      position: scrollState.position,
      thumbSize: scrollState.thumbSize,
      dragStartX: scrollState.dragStartX
    });

    // Add global event listeners for drag
    const handleDrag = (e: MouseEvent | TouchEvent) => {
      if (!scrollState.isDragging) return;
      e.preventDefault();
      
      const currentX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
      const deltaX = currentX - scrollState.dragStartX;
      
      // Get scrollbar width for percentage calculation
      const scrollbarElement = chartType === 'price' ? 
        this.priceScrollbarRef.nativeElement : 
        this.volumeScrollbarRef.nativeElement;
      
      if (!scrollbarElement) {
        console.error(`❌ Scrollbar element not found for ${chartType}`);
        return;
      }
      
      const scrollbarWidth = scrollbarElement.offsetWidth;
      const deltaPercent = (deltaX / scrollbarWidth) * 100;
      
      const newPosition = Math.max(0, Math.min(
        100 - scrollState.thumbSize, 
        scrollState.dragStartPosition + deltaPercent
      ));
      
      console.log(`📊 Scrollbar drag:`, {
        deltaX,
        deltaPercent,
        newPosition,
        scrollbarWidth
      });
      
      scrollState.position = newPosition;
      this.applyScrollbarPosition(chartType, newPosition);
    };

    const handleDragEnd = () => {
      console.log(`✅ Ending scrollbar drag for ${chartType} chart`);
      scrollState.isDragging = false;
      this.currentlyDragging = null;
      document.removeEventListener('mousemove', handleDrag as any);
      document.removeEventListener('mouseup', handleDragEnd);
      document.removeEventListener('touchmove', handleDrag as any);
      document.removeEventListener('touchend', handleDragEnd);
    };

    document.addEventListener('mousemove', handleDrag as any);
    document.addEventListener('mouseup', handleDragEnd);
    document.addEventListener('touchmove', handleDrag as any);
    document.addEventListener('touchend', handleDragEnd);
  }

  private applyScrollbarPosition(chartType: 'price' | 'volume', position: number): void {
    const chart = chartType === 'price' ? 
      this.priceChartComponent?.chart : 
      this.volumeChartComponent?.chart;
      
    if (!chart) {
      console.error(`❌ ${chartType} chart not available for position update`);
      return;
    }

    try {
      const data = chart.data.datasets[0]?.data as any[];
      if (!data || data.length === 0) {
        console.warn(`⚠️ No data available for ${chartType} chart`);
        return;
      }

      const dataStart = new Date(data[0].x).getTime();
      const dataEnd = new Date(data[data.length - 1].x).getTime();
      const totalRange = dataEnd - dataStart;
      
      const xAxis = chart.scales['x'];
      if (!xAxis) {
        console.error(`❌ X-axis not found for ${chartType} chart`);
        return;
      }
      
      // Get the scrollbar state to determine the visible range
      const scrollState = chartType === 'price' ? this.priceScrollState : this.volumeScrollState;
      
      // Calculate visible range based on thumb size percentage
      const visibleRange = (scrollState.thumbSize / 100) * totalRange;
      
      // Calculate new start position based on scrollbar position
      // Ensure the visible range stays within data bounds
      const maxStartPosition = totalRange - visibleRange;
      const newStart = dataStart + Math.min((position / 100) * totalRange, maxStartPosition);
      const newEnd = newStart + visibleRange;
      
      // Ensure we don't go beyond data bounds
      const clampedStart = Math.max(dataStart, Math.min(dataEnd - visibleRange, newStart));
      const clampedEnd = clampedStart + visibleRange;
      
      console.log(`📊 Applying scrollbar position for ${chartType}:`, {
        position,
        thumbSize: scrollState.thumbSize,
        visibleRange: Math.round(visibleRange),
        totalRange: Math.round(totalRange),
        dataStart: new Date(dataStart).toISOString(),
        dataEnd: new Date(dataEnd).toISOString(),
        newStart: new Date(clampedStart).toISOString(),
        newEnd: new Date(clampedEnd).toISOString()
      });
      
      // Update both charts simultaneously for perfect synchronization
      if (this.currentlyDragging === chartType) {
        const priceChart = this.priceChartComponent?.chart;
        const volumeChart = this.volumeChartComponent?.chart;
        
        // Use the chart service method to sync both charts to the exact same time range
        this.chartService.syncBothChartsToTimeRange(priceChart, volumeChart, clampedStart, clampedEnd);
        
        // Update both scrollbar states to match
        this.priceScrollState.position = position;
        this.priceScrollState.thumbSize = scrollState.thumbSize;
        this.volumeScrollState.position = position;
        this.volumeScrollState.thumbSize = scrollState.thumbSize;
        
        // Update individual chart time ranges immediately
        this.priceTimeRange = {
          start: clampedStart,
          end: clampedEnd
        };
        
        this.volumeTimeRange = {
          start: clampedStart,
          end: clampedEnd
        };
        
        console.log(`🔄 Both charts synchronized from ${chartType} scrollbar drag`);
      }

    } catch (error) {
      console.error(`❌ Error applying scrollbar position for ${chartType}:`, error);
    }
  }

  // Handle clicking on scrollbar track (not on thumb)
  @HostListener('document:click', ['$event'])
  onScrollbarTrackClick(event: MouseEvent): void {
    if (!event.target) return;
    
    const target = event.target as HTMLElement;
    if (!target.classList.contains('scrollbar-track')) return;
    
    const scrollbarContainer = target.closest('.chart-scrollbar');
    if (!scrollbarContainer) return;
    
    // Determine which chart's scrollbar was clicked
    const chartType = scrollbarContainer.closest('.price-chart-container') ? 'price' : 'volume';
    const scrollState = chartType === 'price' ? this.priceScrollState : this.volumeScrollState;
    
    // Calculate click position as percentage
    const rect = target.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickPercent = (clickX / rect.width) * 100;
    
    // Center the thumb on the click position
    const newPosition = Math.max(0, Math.min(
      100 - scrollState.thumbSize, 
      clickPercent - (scrollState.thumbSize / 2)
    ));
    
    scrollState.position = newPosition;
    this.applyScrollbarPosition(chartType, newPosition);
  }

  resetZoom(): void {
    const priceChart = this.priceChartComponent?.chart;
    const volumeChart = this.volumeChartComponent?.chart;
    
    this.chartService.resetZoomBoth(priceChart, volumeChart);
    
    // Reset scrollbar states
    this.priceScrollState.position = 0;
    this.priceScrollState.thumbSize = 100;
    this.volumeScrollState.position = 0;
    this.volumeScrollState.thumbSize = 100;
    
    // Update time scales to show full range
    this.updateTotalTimeRange();
    this.priceTimeRange = { ...this.totalTimeRange };
    this.volumeTimeRange = { ...this.totalTimeRange };
  }

  panLeft(): void {
    const priceChart = this.priceChartComponent?.chart;
    const volumeChart = this.volumeChartComponent?.chart;
    
    // Reduced pan distance for more responsive control
    this.chartService.panLeft(priceChart, volumeChart, 0.15);
    
    // Update time scales immediately
    setTimeout(() => {
      this.updateIndividualChartTimeRanges();
    }, 50);
  }

  panRight(): void {
    const priceChart = this.priceChartComponent?.chart;
    const volumeChart = this.volumeChartComponent?.chart;
    
    // Reduced pan distance for more responsive control  
    this.chartService.panRight(priceChart, volumeChart, 0.15);
    
    // Update time scales immediately
    setTimeout(() => {
      this.updateIndividualChartTimeRanges();
    }, 50);
  }

  zoomToLast24Hours(): void {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    
    const priceChart = this.priceChartComponent?.chart;
    const volumeChart = this.volumeChartComponent?.chart;
    
    this.chartService.panToDateRange(priceChart, volumeChart, startDate, endDate);
    
    // Update time scales to reflect new range
    const timeRange = {
      start: startDate.getTime(),
      end: endDate.getTime()
    };
    this.priceTimeRange = { ...timeRange };
    this.volumeTimeRange = { ...timeRange };
  }

  zoomToLastWeek(): void {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const priceChart = this.priceChartComponent?.chart;
    const volumeChart = this.volumeChartComponent?.chart;
    
    this.chartService.panToDateRange(priceChart, volumeChart, startDate, endDate);
    
    // Update time scales to reflect new range
    const timeRange = {
      start: startDate.getTime(),
      end: endDate.getTime()
    };
    this.priceTimeRange = { ...timeRange };
    this.volumeTimeRange = { ...timeRange };
  }

  zoomToLastMonth(): void {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const priceChart = this.priceChartComponent?.chart;
    const volumeChart = this.volumeChartComponent?.chart;
    
    this.chartService.panToDateRange(priceChart, volumeChart, startDate, endDate);
    
    // Update time scales to reflect new range
    const timeRange = {
      start: startDate.getTime(),
      end: endDate.getTime()
    };
    this.priceTimeRange = { ...timeRange };
    this.volumeTimeRange = { ...timeRange };
  }
}
