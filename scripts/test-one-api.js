import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', 'src', 'config', '.env') });

const testConnection = async () => {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjksInVzZXJuYW1lIjoiYWRtaW4iLCJpYXQiOjE3NzUxOTY1MzksImV4cCI6MTc3NTIyNTMzOX0.v2_SSrpXujDTsY-Ky_zNiM0dsNg7QxOOIGi7Fd-yFB0';
  const baseUrl = process.env.ONE_API_BASE_URL;
  const userId = 9; // From the token payload you provided

  console.log('🔍 Testing connection to BIZPOLE ONE CRM...');
  console.log(`📡 Base URL: ${baseUrl}`);

  try {
    // 1. Test Auth Verification (Titled without /api/ based on app.use("/"))
    console.log('\n--- 1. Testing Auth Verification (/auth/verify) ---');
    const verifyUrl = `${baseUrl}/auth/verify`;
    const authResponse = await axios.get(verifyUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Auth API Response:', authResponse.data);

    // 2. Test Employee Metadata Fetch (/employees/:id or /employee/:id)
    console.log('\n--- 2. Testing Employee Profile Fetch (/employees/:id) ---');
    const employeeUrl = `${baseUrl}/employees/${userId}`;
    const empResponse = await axios.get(employeeUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Employee API Response:', empResponse.data);

  } catch (error) {
    console.error('\n❌ Connection Error:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Data:', error.response.data);
      console.error('Url:', error.config.url);
    } else {
      console.error(error.message);
    }
  }
};

testConnection();
