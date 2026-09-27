import subprocess
import os
import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

def run_remote(command_str):
    key_path = os.path.expanduser(r'~/.oci/smartreach_id_rsa')
    cmd = [
        'ssh',
        '-o', 'StrictHostKeyChecking=no',
        '-i', key_path,
        'ubuntu@130.61.146.177',
        f'cd /home/ubuntu/smart-reach && {command_str}'
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if res.stdout:
        print("STDOUT:\n" + res.stdout)
    if res.stderr:
        print("STDERR:\n" + res.stderr)
    return res.returncode

if __name__ == '__main__':
    cmd_to_run = sys.argv[1] if len(sys.argv) > 1 else 'node -v'
    sys.exit(run_remote(cmd_to_run))
