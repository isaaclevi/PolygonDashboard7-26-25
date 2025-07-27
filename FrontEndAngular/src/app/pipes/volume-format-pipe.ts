import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'volumeFormat',
  standalone: false
})
export class VolumeFormatPipe implements PipeTransform {

  transform(value: unknown, decimals: number = 1): string {
    if (value === null || value === undefined || value === '') {
      return '';
    }

    const num = Number(value);
    
    if (isNaN(num)) {
      return '';
    }

    if (num === 0) {
      return '0';
    }

    const abs = Math.abs(num);
    const sign = num < 0 ? '-' : '';

    // Format based on magnitude
    if (abs >= 1e9) {
      // Billions
      return sign + (abs / 1e9).toFixed(decimals) + 'B';
    } else if (abs >= 1e6) {
      // Millions
      return sign + (abs / 1e6).toFixed(decimals) + 'M';
    } else if (abs >= 1e3) {
      // Thousands
      return sign + (abs / 1e3).toFixed(decimals) + 'K';
    } else {
      // Less than 1000
      return sign + abs.toFixed(0);
    }
  }
}
