import { Component, Input, ViewChild, AfterViewInit, OnDestroy, HostListener, ElementRef } from '@angular/core';
import { PriceChartComponent } from '../price-chart/price-chart.component';
import { VolumeChartComponent } from '../volume-chart/volume-chart.component';
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

@Component({
  selector: 'app-chart-container',
  templateUrl: './chart-container.component.html',
  styleUrls: ['./chart-container.component.scss'],
  standalone: true,
  imports: [PriceChartComponent, VolumeChartComponent, CommonModule, MatButtonModule, MatIconModule, MatTooltipModule]
})
export class ChartContainerComponent implements AfterViewInit, OnDestroy {
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

  constructor(private chartService: ChartService) {}

  ngAfterViewInit(): void {
    // Wait a bit for charts to be created, then link them
    setTimeout(() => {
      this.linkCharts();
      this.startScrollbarSync();
      this.debugScrollbarSetup();
    }, 200);
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

  private linkCharts(): void {
    const priceChart = this.priceChartComponent?.chart;
    const volumeChart = this.volumeChartComponent?.chart;
    
    if (priceChart && volumeChart) {
      this.chartService.linkCharts(priceChart, volumeChart);
      console.log('Charts linked for synchronized zooming and scrolling');
    }
  }

  private startScrollbarSync(): void {
    // Update scrollbar positions less frequently to avoid interference with pan events
    this.updateScrollbarInterval = setInterval(() => {
      this.updateScrollbarStates();
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
      
      // Calculate position as percentage
      const visibleStart = Math.max(currentMin, dataStart);
      const positionPercent = ((visibleStart - dataStart) / totalRange) * 100;
      scrollState.position = Math.max(0, Math.min(100 - scrollState.thumbSize, positionPercent));
      
      // Log scrollbar state for debugging (reduce frequency)
      if (Math.random() < 0.1) { // Log only 10% of the time to reduce noise
        console.log('📊 Scrollbar state updated:', {
          chartType: (chart as any).chartType || 'unknown',
          thumbSize: scrollState.thumbSize.toFixed(1),
          position: scrollState.position.toFixed(1),
          visibleRange: Math.round(visibleRange),
          totalRange: Math.round(totalRange)
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
      
      // Calculate the visible range based on current zoom level
      const xAxis = chart.scales['x'];
      if (!xAxis) {
        console.error(`❌ X-axis not found for ${chartType} chart`);
        return;
      }
      
      const currentRange = xAxis.max - xAxis.min;
      
      // Calculate new start position based on scrollbar position
      const newStart = dataStart + (position / 100) * totalRange;
      const newEnd = newStart + currentRange;
      
      console.log(`📊 Applying scrollbar position for ${chartType}:`, {
        position,
        dataStart: new Date(dataStart).toISOString(),
        dataEnd: new Date(dataEnd).toISOString(),
        newStart: new Date(newStart).toISOString(),
        newEnd: new Date(newEnd).toISOString(),
        currentRange
      });
      
      // Update chart scale
      xAxis.min = newStart;
      xAxis.max = newEnd;
      chart.update('none');

      // Sync with the other chart
      const otherChart = chartType === 'price' ? 
        this.volumeChartComponent?.chart : 
        this.priceChartComponent?.chart;
        
      if (otherChart) {
        const otherXAxis = otherChart.scales['x'];
        if (otherXAxis) {
          otherXAxis.min = newStart;
          otherXAxis.max = newEnd;
          otherChart.update('none');
          
          // Update the other scrollbar state
          const otherScrollState = chartType === 'price' ? this.volumeScrollState : this.priceScrollState;
          otherScrollState.position = position;
          
          console.log(`🔄 Synced ${chartType === 'price' ? 'volume' : 'price'} chart`);
        }
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
  }

  panLeft(): void {
    const priceChart = this.priceChartComponent?.chart;
    const volumeChart = this.volumeChartComponent?.chart;
    
    // Reduced pan distance for more responsive control
    this.chartService.panLeft(priceChart, volumeChart, 0.15);
  }

  panRight(): void {
    const priceChart = this.priceChartComponent?.chart;
    const volumeChart = this.volumeChartComponent?.chart;
    
    // Reduced pan distance for more responsive control  
    this.chartService.panRight(priceChart, volumeChart, 0.15);
  }

  zoomToLast24Hours(): void {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    
    const priceChart = this.priceChartComponent?.chart;
    const volumeChart = this.volumeChartComponent?.chart;
    
    this.chartService.panToDateRange(priceChart, volumeChart, startDate, endDate);
  }

  zoomToLastWeek(): void {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const priceChart = this.priceChartComponent?.chart;
    const volumeChart = this.volumeChartComponent?.chart;
    
    this.chartService.panToDateRange(priceChart, volumeChart, startDate, endDate);
  }

  zoomToLastMonth(): void {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const priceChart = this.priceChartComponent?.chart;
    const volumeChart = this.volumeChartComponent?.chart;
    
    this.chartService.panToDateRange(priceChart, volumeChart, startDate, endDate);
  }
}
