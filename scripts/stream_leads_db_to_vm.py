import os
import sys
import time
import subprocess
import zlib

sys.stdout.reconfigure(encoding='utf-8')

LOCAL_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'leads.db')
SSH_KEY = r'C:\Users\Krish Shah\.oci\smartreach_id_rsa'
SSH_HOST = 'ubuntu@130.61.146.177'
REMOTE_TEMP_PATH = '/home/ubuntu/chad-gtm/data/leads.db.new'
REMOTE_FINAL_PATH = '/home/ubuntu/chad-gtm/data/leads.db'

def main():
    if not os.path.exists(LOCAL_DB_PATH):
        print(f"Error: {LOCAL_DB_PATH} does not exist.")
        sys.exit(1)

    total_bytes = os.path.getsize(LOCAL_DB_PATH)
    total_gb = total_bytes / (1024 ** 3)
    print("=" * 65)
    print("CHADGTM HIGH-SPEED DATABASE STREAMING DEPLOYMENT")
    print(f"Local Source : {LOCAL_DB_PATH} ({total_gb:.2f} GB)")
    print(f"Destination  : {SSH_HOST}:{REMOTE_FINAL_PATH}")
    print("=" * 65)

    remote_shell_cmd = (
        f"gzip -dc > '{REMOTE_TEMP_PATH}' && "
        f"mv '{REMOTE_TEMP_PATH}' '{REMOTE_FINAL_PATH}'"
    )

    ssh_args = [
        'ssh',
        '-o', 'BatchMode=yes',
        '-o', 'StrictHostKeyChecking=no',
        '-i', SSH_KEY,
        SSH_HOST,
        remote_shell_cmd
    ]

    print("Opening encrypted SSH streaming tunnel with real-time gzip decompression...")
    proc = subprocess.Popen(ssh_args, stdin=subprocess.PIPE, stderr=subprocess.PIPE)

    compressor = zlib.compressobj(level=3, wbits=16 + zlib.MAX_WBITS) # standard gzip stream header

    chunk_size = 4 * 1024 * 1024 # 4 MB chunks
    read_bytes = 0
    sent_compressed_bytes = 0
    t_start = time.time()
    last_report = t_start

    try:
        with open(LOCAL_DB_PATH, 'rb') as f:
            while True:
                data = f.read(chunk_size)
                if not data:
                    break
                read_bytes += len(data)

                comp_chunk = compressor.compress(data)
                if comp_chunk:
                    proc.stdin.write(comp_chunk)
                    sent_compressed_bytes += len(comp_chunk)

                now = time.time()
                if now - last_report >= 5:
                    pct = (read_bytes / total_bytes) * 100
                    elapsed = now - t_start
                    mb_sent = sent_compressed_bytes / (1024 * 1024)
                    speed_mb = mb_sent / elapsed
                    orig_mb = read_bytes / (1024 * 1024)
                    eta_sec = (total_bytes - read_bytes) / (read_bytes / elapsed) if read_bytes > 0 else 0
                    print(
                        f"Progress: {pct:5.1f}% | Uncompressed: {orig_mb:6.0f}MB / {total_bytes/(1024*1024):.0f}MB | "
                        f"Sent: {mb_sent:5.0f}MB ({speed_mb:4.1f} MB/s) | ETA: {eta_sec:3.0f}s"
                    )
                    last_report = now

            final_comp = compressor.flush()
            if final_comp:
                proc.stdin.write(final_comp)
                sent_compressed_bytes += len(final_comp)

        proc.stdin.close()
        print("Finished local stream. Awaiting remote disk sync & swap...")
        _, stderr = proc.communicate()

        if proc.returncode != 0:
            print("ERROR during transfer:", stderr.decode('utf-8', errors='replace'))
            sys.exit(proc.returncode)

        elapsed = time.time() - t_start
        mb_sent = sent_compressed_bytes / (1024 * 1024)
        print("=" * 65)
        print(f"Transfer COMPLETE in {elapsed:.1f}s ({elapsed/60:.2f} min)!")
        print(f"Total Sent: {mb_sent:.1f} MB ({total_gb:.2f} GB uncompressed)")
        print(f"Average Transfer Speed: {mb_sent / elapsed:.2f} MB/s")
        print("=" * 65)

    except Exception as e:
        print("Exception during stream:", str(e))
        if proc.stdin:
            proc.stdin.close()
        proc.kill()
        sys.exit(1)

if __name__ == '__main__':
    main()
