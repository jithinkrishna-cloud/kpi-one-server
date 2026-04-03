import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', 'src', 'config', '.env') });

const discoverEndpoints = async () => {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjksInVzZXJuYW1lIjoiYWRtaW4iLCJpYXQiOjE3NzUxOTY1MzksImV4cCI6MTc3NTIyNTMzOX0.v2_SSrpXujDTsY-Ky_zNiM0dsNg7QxOOIGi7Fd-yFB0';
  const baseUrl = 'https://api.bizpoleindia.in';
  const userId = 9;

  const endpoints = [
    '/api/employees/9',
    '/employees/9',
    '/api/employee/9',
    '/employee/9',
    '/api/auth/verify',
    '/auth/verify',
    '/api/profile',
    '/profile'
  ];

  console.log('🔍 Endpoint Discovery on ' + baseUrl);

  for (const endpoint of endpoints) {
    try {
      const url = baseUrl + endpoint;
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log(`✅ [${res.status}] FOUND: ${endpoint}`);
      console.log('Payload:', res.data);
      return; // Stop after first success
    } catch (err) {
      const status = err.response ? err.response.status : 'ERR';
      console.log(`❌ [${status}] ${endpoint}`);
    }
  }
};

discoverEndpoints();
