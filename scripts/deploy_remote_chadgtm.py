import subprocess
import os
import sys

key = os.path.expanduser('~/.oci/smartreach_id_rsa')
commands = r'''
set -e
cd /home/ubuntu/chad-gtm
echo "📥 Pulling latest main..."
git pull origin main

echo "📦 Installing workspace dependencies in /home/ubuntu/chad-gtm..."
npm install --no-audit

echo "🏗️ Building ChadGTM web application..."
npm run build --workspace=@smartreach/web

echo "🚀 Starting PM2 processes for ChadGTM..."
pm2 delete chadgtm-web 2>/dev/null || true
pm2 delete chadgtm-worker 2>/dev/null || true

cd /home/ubuntu/chad-gtm/apps/web
pm2 start "npx next start -p 3005" --name "chadgtm-web"

cd /home/ubuntu/chad-gtm/packages/email-engine
pm2 start "npm run worker" --name "chadgtm-worker"

pm2 save
pm2 status
echo "CHADGTM_DEPLOYED_SUCCESSFULLY"
'''

cmd = ['ssh', '-o', 'StrictHostKeyChecking=no', '-i', key, 'ubuntu@130.61.146.177', 'bash -s']
res = subprocess.run(cmd, input=commands.replace('\r', '').encode('utf-8'), capture_output=True)

out = res.stdout.decode('utf-8', errors='replace')
err = res.stderr.decode('utf-8', errors='replace')
sys.stdout.buffer.write(b"STDOUT:\n" + out.encode('utf-8') + b"\nSTDERR:\n" + err.encode('utf-8'))
