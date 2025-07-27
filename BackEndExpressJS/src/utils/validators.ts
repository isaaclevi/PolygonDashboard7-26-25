import { z } from 'zod';

export const getStockDataSchema = z.object({
  symbol: z.string().min(1).max(10),
  timeframe: z.enum(['1min', '5min', '1hour', '1day']),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});
