import subprocess
import os
import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

key_path = os.path.expanduser(r'~/.oci/smartreach_id_rsa')

remote_script = """
set -e
echo "=== COPYING LEADS DATA TO /home/ubuntu/smart-reach/data ==="
mkdir -p /home/ubuntu/smart-reach/data
cp -f /home/ubuntu/joyful-carson/data/leads.db /home/ubuntu/smart-reach/data/leads.db
cp -f /home/ubuntu/joyful-carson/data/leads.db.gz /home/ubuntu/smart-reach/data/leads.db.gz
ls -lh /home/ubuntu/smart-reach/data/

cd /home/ubuntu/smart-reach
echo "=== GIT STATUS ON SERVER ==="
git status
echo "=== PULLING LATEST CODE ==="
git fetch origin main
git reset --hard origin/main

echo "=== BUILDING NEXT.JS ON SERVER ==="
npm run build --workspace @smartreach/web

echo "=== RESTARTING WEB SERVICE & WORKER WITH PM2 ==="
pm2 reload smartreach-web || pm2 restart smartreach-web
pm2 restart smartreach-worker

echo "=== ALL DONE ==="
pm2 status
"""

cmd = [
    'ssh',
    '-o', 'StrictHostKeyChecking=no',
    '-i', key_path,
    'ubuntu@130.61.146.177',
    remote_script
]

print("Executing deploy on /home/ubuntu/smart-reach...")
res = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
print("STDOUT:\n", res.stdout)
print("STDERR:\n", res.stderr)
