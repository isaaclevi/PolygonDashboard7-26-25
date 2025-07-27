import { TestBed } from '@angular/core/testing';

import { Ftp } from './ftp';

describe('Ftp', () => {
  let service: Ftp;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Ftp);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
