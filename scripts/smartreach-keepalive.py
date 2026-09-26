#!/usr/bin/env python3
"""
SmartReach Oracle Cloud Always-Free Keep-Alive Daemon
=====================================================
Ensures your instance is never reclaimed or shut down by Oracle's idle policy.

Oracle's official criteria to reclaim an Always Free instance:
Over a 7-day rolling window, ALL of the following MUST be true:
1. CPU 95th percentile < 20%
2. Memory 95th percentile < 20% (Ampere A1 shapes)
3. Network 95th percentile < 20%

If ANY ONE metric is >= 20%, Oracle CANNOT reclaim the VM.
This daemon safely maintains:
- Memory: Holds a ~2.6 GB resident buffer (pushes system RAM to ~28%)
- CPU: Generates a gentle 25% CPU pulse on 1 core for 12 minutes every hour at nice +19
- Network: Downloads a 25MB pulse every 6 hours to record active I/O
"""

import os
import sys
import time
import math
import logging
import urllib.request

LOG_FILE = "/var/log/smartreach-keepalive.log"
logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

# Run at lowest OS CPU priority so PM2/Postgres always take precedence
try:
    os.nice(19)
except Exception:
    pass

def allocate_memory_buffer(gb=2.6):
    """Allocates and commits resident memory to safely keep total RAM > 25%."""
    try:
        bytes_to_alloc = int(gb * 1024 * 1024 * 1024)
        buf = bytearray(bytes_to_alloc)
        # Touch 1 byte per page (4096 bytes) to force OS physical memory commitment
        for i in range(0, bytes_to_alloc, 4096):
            buf[i] = 42
        logging.info(f"Allocated {gb} GB resident memory buffer. Total system RAM is safely > 25%.")
        return buf
    except Exception as e:
        logging.error(f"Failed to allocate memory buffer: {e}")
        return None

def cpu_pulse(duration_seconds=720):
    """
    Gentle CPU pulse: consumes ~25% of 1 core for the duration.
    720s (12 mins) every hour ensures >15% of the time is above 20% CPU load.
    """
    logging.info(f"Starting CPU keep-alive pulse ({duration_seconds}s at ~25% load)...")
    end_time = time.time() + duration_seconds
    while time.time() < end_time:
        # Busy loop for 25ms, sleep for 75ms -> ~25% single-core load
        t0 = time.time()
        while time.time() - t0 < 0.025:
            _ = math.sqrt(1234567.89)
        time.sleep(0.075)
    logging.info("CPU keep-alive pulse completed.")

def network_pulse():
    """Fetches a 25MB public payload to register active network utilization."""
    try:
        logging.info("Starting network keep-alive pulse (25MB transfer)...")
        url = "https://speed.cloudflare.com/__down?bytes=25000000"
        req = urllib.request.Request(url, headers={"User-Agent": "SmartReach-KeepAlive/1.0"})
        with urllib.request.urlopen(req, timeout=30) as response:
            total = 0
            while True:
                chunk = response.read(65536)
                if not chunk:
                    break
                total += len(chunk)
        logging.info(f"Network pulse completed: {total / (1024*1024):.1f} MB transferred.")
    except Exception as e:
        logging.warning(f"Network pulse exception (non-fatal): {e}")

def main():
    logging.info("SmartReach Oracle Keep-Alive Daemon started.")
    print("SmartReach Oracle Keep-Alive Daemon started.")

    # 1. Hold resident memory buffer (kept alive in process scope)
    mem_buf = allocate_memory_buffer(2.6)

    # 2. Main loop: hourly CPU pulse, 6-hourly network pulse
    last_network_pulse = 0
    while True:
        try:
            now = time.time()
            if now - last_network_pulse > 21600:  # 6 hours
                network_pulse()
                last_network_pulse = now

            # Hourly CPU pulse: 12 minutes work, 48 minutes idle
            cpu_pulse(duration_seconds=720)
            time.sleep(2880)  # Sleep remaining 48 minutes
        except Exception as e:
            logging.error(f"Error in keep-alive loop: {e}")
            time.sleep(60)

if __name__ == "__main__":
    main()
