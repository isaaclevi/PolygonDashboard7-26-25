import { TestBed } from '@angular/core/testing';

import { ChartSync } from './chart-sync';

describe('ChartSync', () => {
  let service: ChartSync;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ChartSync);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
