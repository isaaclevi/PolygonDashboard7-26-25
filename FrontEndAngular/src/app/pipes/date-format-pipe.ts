import { Pipe, PipeTransform } from '@angular/core';
import { format, isValid, parseISO } from 'date-fns';

@Pipe({
  name: 'dateFormat',
  standalone: false
})
export class DateFormatPipe implements PipeTransform {

  transform(value: unknown, formatString: string = 'MMM dd, yyyy HH:mm'): string {
    if (!value) {
      return '';
    }

    let date: Date;

    // Handle different input types
    if (typeof value === 'string') {
      // Try to parse ISO string first
      date = parseISO(value);
      if (!isValid(date)) {
        // Fallback to Date constructor
        date = new Date(value);
      }
    } else if (typeof value === 'number') {
      date = new Date(value);
    } else if (value instanceof Date) {
      date = value;
    } else {
      return '';
    }

    // Validate the date
    if (!isValid(date)) {
      return '';
    }

    try {
      return format(date, formatString);
    } catch (error) {
      console.error('Date formatting error:', error);
      return '';
    }
  }
}
