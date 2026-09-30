import subprocess
import os
import sys

key = os.path.expanduser('~/.oci/smartreach_id_rsa')
caddy_config = r'''
130-61-146-177.sslip.io {
    reverse_proxy 127.0.0.1:3000 {
        header_up Host {upstream_hostport}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}

chadgtm.130-61-146-177.sslip.io {
    reverse_proxy 127.0.0.1:3005 {
        header_up Host {upstream_hostport}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
'''

commands = f'''
set -e
cat << 'EOF' | sudo tee /etc/caddy/Caddyfile > /dev/null
{caddy_config}
EOF
sudo systemctl reload caddy
echo "CADDY_RELOAD_SUCCESS"
'''

cmd = ['ssh', '-o', 'StrictHostKeyChecking=no', '-i', key, 'ubuntu@130.61.146.177', 'bash -s']
res = subprocess.run(cmd, input=commands.replace('\r', '').encode('utf-8'), capture_output=True)

out = res.stdout.decode('utf-8', errors='replace')
err = res.stderr.decode('utf-8', errors='replace')
sys.stdout.buffer.write(b"STDOUT:\n" + out.encode('utf-8') + b"\nSTDERR:\n" + err.encode('utf-8'))
