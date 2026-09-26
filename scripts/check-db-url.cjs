require('dotenv').config({ path: '.env.live.production' });
const url = process.env.DATABASE_URL;
console.log('Length:', url?.length);
console.log('Starts with:', url?.slice(0, 15));
const { neon } = require('@neondatabase/serverless');
const sql = neon(url);
sql`SELECT 1 as val`.then(r => {
  console.log('Production Neon DB connected successfully! Result:', r);
}).catch(e => {
  console.error('DB error:', e.message);
});
