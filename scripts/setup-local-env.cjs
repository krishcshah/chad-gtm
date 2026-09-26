const fs = require('fs');
let content = fs.readFileSync('apps/web/.env.local', 'utf8');
content = content.replace(/^APP_URL=.*/m, 'APP_URL="http://localhost:3005"');
content = content.replace(/^BETTER_AUTH_URL=.*/m, 'BETTER_AUTH_URL="http://localhost:3005"');
content = content.replace(/^BETTER_AUTH_TRUSTED_ORIGINS=.*/m, 'BETTER_AUTH_TRUSTED_ORIGINS="http://localhost:3005,http://127.0.0.1:3005"');
fs.writeFileSync('apps/web/.env.local', content);
console.log('apps/web/.env.local configured for localhost:3005');
