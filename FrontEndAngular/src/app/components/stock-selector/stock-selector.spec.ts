import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StockSelector } from './stock-selector';

describe('StockSelector', () => {
  let component: StockSelector;
  let fixture: ComponentFixture<StockSelector>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [StockSelector]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StockSelector);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
