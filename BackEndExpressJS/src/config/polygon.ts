import dotenv from 'dotenv';

dotenv.config();

export const polygonConfig = {
  apiKey: process.env.POLYGON_API_KEY,
};
