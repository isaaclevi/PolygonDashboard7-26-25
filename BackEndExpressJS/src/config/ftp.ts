import dotenv from 'dotenv';

dotenv.config();

export const ftpConfig = {
  port: Number(process.env.FTP_PORT),
  user: process.env.FTP_USER,
  pass: process.env.FTP_PASS,
};
