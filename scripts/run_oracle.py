import subprocess
import os

key_path = os.path.expanduser(r'~/.oci/smartreach_id_rsa')

def run(cmd_str):
    cmd = [
        'ssh',
        '-o', 'StrictHostKeyChecking=no',
        '-i', key_path,
        'ubuntu@130.61.146.177',
        f'cd /home/ubuntu/smart-reach && {cmd_str}'
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    print("STDOUT:\n", res.stdout)
    if res.stderr:
        print("STDERR:\n", res.stderr)
    return res.returncode

if __name__ == '__main__':
    run("sudo -u postgres psql -d smartreach -c '\\d suppressions'")
