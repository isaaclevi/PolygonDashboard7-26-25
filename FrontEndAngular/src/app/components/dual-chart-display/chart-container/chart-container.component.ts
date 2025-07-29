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
    }, 200);
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
    // Update scrollbar positions every 100ms when charts change
    this.updateScrollbarInterval = setInterval(() => {
      this.updateScrollbarStates();
    }, 100);
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
        return;
      }

      const currentMin = xAxis.min;
      const currentMax = xAxis.max;
      const dataStart = new Date(data[0].x).getTime();
      const dataEnd = new Date(data[data.length - 1].x).getTime();
      
      const totalRange = dataEnd - dataStart;
      const visibleRange = currentMax - currentMin;
      
      // Calculate thumb size as percentage of visible vs total data
      scrollState.thumbSize = Math.max(5, Math.min(100, (visibleRange / totalRange) * 100));
      
      // Calculate position as percentage
      const visibleStart = Math.max(currentMin, dataStart);
      const position = ((visibleStart - dataStart) / totalRange) * 100;
      scrollState.position = Math.max(0, Math.min(100 - scrollState.thumbSize, position));

    } catch (error) {
      console.warn('Error updating scrollbar state:', error);
    }
  }

  startScrollbarDrag(event: MouseEvent | TouchEvent, chartType: 'price' | 'volume'): void {
    event.preventDefault();
    
    const scrollState = chartType === 'price' ? this.priceScrollState : this.volumeScrollState;
    const clientX = event instanceof MouseEvent ? event.clientX : event.touches[0].clientX;
    
    scrollState.isDragging = true;
    scrollState.dragStartX = clientX;
    scrollState.dragStartPosition = scrollState.position;

    // Add global event listeners for drag
    const handleDrag = (e: MouseEvent | TouchEvent) => {
      if (!scrollState.isDragging) return;
      
      const currentX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
      const deltaX = currentX - scrollState.dragStartX;
      
      // Get scrollbar width for percentage calculation
      const scrollbarElement = chartType === 'price' ? 
        this.priceScrollbarRef.nativeElement : 
        this.volumeScrollbarRef.nativeElement;
      
      const scrollbarWidth = scrollbarElement.offsetWidth;
      const deltaPercent = (deltaX / scrollbarWidth) * 100;
      
      const newPosition = Math.max(0, Math.min(
        100 - scrollState.thumbSize, 
        scrollState.dragStartPosition + deltaPercent
      ));
      
      scrollState.position = newPosition;
      this.applyScrollbarPosition(chartType, newPosition);
    };

    const handleDragEnd = () => {
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
      
    if (!chart) return;

    try {
      const data = chart.data.datasets[0]?.data as any[];
      if (!data || data.length === 0) return;

      const dataStart = new Date(data[0].x).getTime();
      const dataEnd = new Date(data[data.length - 1].x).getTime();
      const totalRange = dataEnd - dataStart;
      
      // Calculate the visible range based on current zoom level
      const xAxis = chart.scales['x'];
      const currentRange = xAxis.max - xAxis.min;
      
      // Calculate new start position based on scrollbar position
      const newStart = dataStart + (position / 100) * totalRange;
      const newEnd = newStart + currentRange;
      
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
        otherXAxis.min = newStart;
        otherXAxis.max = newEnd;
        otherChart.update('none');
        
        // Update the other scrollbar state
        const otherScrollState = chartType === 'price' ? this.volumeScrollState : this.priceScrollState;
        otherScrollState.position = position;
      }

    } catch (error) {
      console.warn('Error applying scrollbar position:', error);
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
    
    this.chartService.panLeft(priceChart, volumeChart, 0.2);
  }

  panRight(): void {
    const priceChart = this.priceChartComponent?.chart;
    const volumeChart = this.volumeChartComponent?.chart;
    
    this.chartService.panRight(priceChart, volumeChart, 0.2);
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
