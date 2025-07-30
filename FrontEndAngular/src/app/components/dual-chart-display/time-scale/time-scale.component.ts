import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

interface TimeScaleTick {
  position: number; // Percentage position (0-100)
  label: string;
  timestamp: number;
  isMinor?: boolean;
}

@Component({
  selector: 'app-time-scale',
  templateUrl: './time-scale.component.html',
  styleUrls: ['./time-scale.component.scss'],
  standalone: true,
  imports: [CommonModule]
})
export class TimeScaleComponent implements OnChanges {
  @Input() startTime!: number; // Start timestamp in milliseconds
  @Input() endTime!: number;   // End timestamp in milliseconds
  @Input() totalDataStart!: number; // Full data range start
  @Input() totalDataEnd!: number;   // Full data range end
  @Input() width: number = 800;     // Chart width in pixels

  ticks: TimeScaleTick[] = [];
  
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['startTime'] || changes['endTime'] || changes['width']) {
      this.generateTicks();
    }
  }

  private generateTicks(): void {
    if (!this.startTime || !this.endTime || this.endTime <= this.startTime) {
      this.ticks = [];
      return;
    }

    const visibleRange = this.endTime - this.startTime;
    const timeInterval = this.calculateOptimalInterval(visibleRange);
    
    console.log('📊 Time Scale: Generating ticks', {
      startTime: new Date(this.startTime).toISOString(),
      endTime: new Date(this.endTime).toISOString(),
      visibleRange: Math.round(visibleRange / 1000 / 60), // minutes
      timeInterval: timeInterval / 1000 / 60 // minutes
    });

    this.ticks = this.generateTicksForInterval(timeInterval);
  }

  private calculateOptimalInterval(visibleRange: number): number {
    // Convert to minutes for easier calculation
    const visibleMinutes = visibleRange / (1000 * 60);
    
    // Define intervals in milliseconds
    const intervals = [
      { label: '1min', value: 1 * 60 * 1000 },
      { label: '5min', value: 5 * 60 * 1000 },
      { label: '15min', value: 15 * 60 * 1000 },
      { label: '30min', value: 30 * 60 * 1000 },
      { label: '1hour', value: 60 * 60 * 1000 },
      { label: '2hour', value: 2 * 60 * 60 * 1000 },
      { label: '4hour', value: 4 * 60 * 60 * 1000 },
      { label: '6hour', value: 6 * 60 * 60 * 1000 },
      { label: '12hour', value: 12 * 60 * 60 * 1000 },
      { label: '1day', value: 24 * 60 * 60 * 1000 },
      { label: '1week', value: 7 * 24 * 60 * 60 * 1000 },
      { label: '1month', value: 30 * 24 * 60 * 60 * 1000 }
    ];

    // Target 6-12 ticks on screen
    const targetTicks = 8;
    const idealInterval = visibleRange / targetTicks;

    // Find the closest interval
    let bestInterval = intervals[0];
    let minDifference = Math.abs(idealInterval - bestInterval.value);

    for (const interval of intervals) {
      const difference = Math.abs(idealInterval - interval.value);
      if (difference < minDifference) {
        minDifference = difference;
        bestInterval = interval;
      }
    }

    console.log('📊 Time Scale: Selected interval', {
      visibleMinutes: Math.round(visibleMinutes),
      selectedInterval: bestInterval.label,
      expectedTicks: Math.round(visibleRange / bestInterval.value)
    });

    return bestInterval.value;
  }

  private generateTicksForInterval(interval: number): TimeScaleTick[] {
    const ticks: TimeScaleTick[] = [];
    
    // Round start time to nearest interval boundary
    const startBoundary = Math.ceil(this.startTime / interval) * interval;
    
    // Generate major ticks
    let currentTime = startBoundary;
    while (currentTime <= this.endTime) {
      if (currentTime >= this.startTime) {
        const position = ((currentTime - this.startTime) / (this.endTime - this.startTime)) * 100;
        
        ticks.push({
          position: Math.max(0, Math.min(100, position)),
          label: this.formatTickLabel(currentTime, interval),
          timestamp: currentTime,
          isMinor: false
        });
      }
      currentTime += interval;
    }

    // Generate minor ticks for very zoomed-in views
    if (interval <= 5 * 60 * 1000 && ticks.length < 15) { // 5 minutes or less
      this.addMinorTicks(ticks, interval / 5); // Minor ticks every 1/5 of major interval
    }

    return ticks.sort((a, b) => a.position - b.position);
  }

  private addMinorTicks(majorTicks: TimeScaleTick[], minorInterval: number): void {
    const minorTicks: TimeScaleTick[] = [];
    
    // Round start time to nearest minor interval boundary
    const startBoundary = Math.ceil(this.startTime / minorInterval) * minorInterval;
    
    let currentTime = startBoundary;
    while (currentTime <= this.endTime) {
      if (currentTime >= this.startTime) {
        // Only add if not already a major tick
        const isMajorTick = majorTicks.some(tick => 
          Math.abs(tick.timestamp - currentTime) < minorInterval / 2
        );
        
        if (!isMajorTick) {
          const position = ((currentTime - this.startTime) / (this.endTime - this.startTime)) * 100;
          
          minorTicks.push({
            position: Math.max(0, Math.min(100, position)),
            label: '', // Minor ticks don't have labels
            timestamp: currentTime,
            isMinor: true
          });
        }
      }
      currentTime += minorInterval;
    }

    majorTicks.push(...minorTicks);
  }

  private formatTickLabel(timestamp: number, interval: number): string {
    const date = new Date(timestamp);
    
    // Choose format based on interval
    if (interval < 60 * 60 * 1000) { // Less than 1 hour
      // Show time only: "09:30", "10:15"
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    } else if (interval < 24 * 60 * 60 * 1000) { // Less than 1 day
      // Show time with AM/PM: "9:30 AM", "2:15 PM"
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    } else if (interval < 7 * 24 * 60 * 60 * 1000) { // Less than 1 week
      // Show date: "Jan 15", "Feb 3"
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    } else {
      // Show date with year: "Jan 15, 2023"
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
      });
    }
  }

  /**
   * Handle click on time scale to jump to that time
   */
  onTimeScaleClick(event: MouseEvent): void {
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickPercent = (clickX / rect.width) * 100;
    
    const targetTime = this.startTime + ((this.endTime - this.startTime) * (clickPercent / 100));
    
    console.log('📊 Time Scale: Click at', {
      clickPercent: clickPercent.toFixed(1),
      targetTime: new Date(targetTime).toISOString()
    });

    // Emit event that parent components can listen to
    // This would need to be implemented with @Output() EventEmitter in a real implementation
  }

  /**
   * Get the current visible time range as a readable string
   */
  getVisibleRangeLabel(): string {
    if (!this.startTime || !this.endTime) return '';
    
    const startDate = new Date(this.startTime);
    const endDate = new Date(this.endTime);
    const duration = this.endTime - this.startTime;
    
    // Format duration
    const minutes = Math.round(duration / (1000 * 60));
    const hours = Math.round(duration / (1000 * 60 * 60));
    const days = Math.round(duration / (1000 * 60 * 60 * 24));
    
    let durationStr = '';
    if (days > 1) {
      durationStr = `${days} days`;
    } else if (hours > 1) {
      durationStr = `${hours} hours`;
    } else {
      durationStr = `${minutes} minutes`;
    }
    
    return `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()} (${durationStr})`;
  }
}