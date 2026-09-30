import subprocess
import os
import sys

key = os.path.expanduser('~/.oci/smartreach_id_rsa')
commands = r'''
set -e
# Setup env for chad-gtm
cp /home/ubuntu/smart-reach/apps/web/.env.local /home/ubuntu/chad-gtm/apps/web/.env.local
sed -i 's|APP_URL=.*|APP_URL="https://chadgtm.130-61-146-177.sslip.io"|' /home/ubuntu/chad-gtm/apps/web/.env.local
sed -i 's|BETTER_AUTH_URL=.*|BETTER_AUTH_URL="https://chadgtm.130-61-146-177.sslip.io"|' /home/ubuntu/chad-gtm/apps/web/.env.local
echo 'PORT="3005"' >> /home/ubuntu/chad-gtm/apps/web/.env.local

cp /home/ubuntu/smart-reach/packages/email-engine/.env /home/ubuntu/chad-gtm/packages/email-engine/.env
sed -i 's|APP_URL=.*|APP_URL="https://chadgtm.130-61-146-177.sslip.io"|' /home/ubuntu/chad-gtm/packages/email-engine/.env

# Setup leads.db
mkdir -p /home/ubuntu/chad-gtm/data
if [ -f /home/ubuntu/smart-reach/data/leads.db ]; then
  cp -u /home/ubuntu/smart-reach/data/leads.db /home/ubuntu/chad-gtm/data/leads.db
elif [ -f /home/ubuntu/chad-gtm/data/leads.db.gz ]; then
  gzip -d -k /home/ubuntu/chad-gtm/data/leads.db.gz
fi

echo "CHADGTM_ENV_AND_LEADS_READY"
'''

cmd = ['ssh', '-o', 'StrictHostKeyChecking=no', '-i', key, 'ubuntu@130.61.146.177', 'bash -s']
res = subprocess.run(cmd, input=commands.replace('\r', '').encode('utf-8'), capture_output=True)

out = res.stdout.decode('utf-8', errors='replace')
err = res.stderr.decode('utf-8', errors='replace')
sys.stdout.buffer.write(b"STDOUT:\n" + out.encode('utf-8') + b"\nSTDERR:\n" + err.encode('utf-8'))
