import subprocess
import os

key_path = os.path.expanduser(r'~/.oci/smartreach_id_rsa')

sql = """
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS track_opens BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS data_removal_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  contact_email TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS data_removal_user_idx ON data_removal_requests(user_id);
CREATE INDEX IF NOT EXISTS data_removal_email_idx ON data_removal_requests(contact_email);
CREATE INDEX IF NOT EXISTS data_removal_status_idx ON data_removal_requests(status);
CREATE INDEX IF NOT EXISTS data_removal_created_idx ON data_removal_requests(created_at);

ALTER TABLE data_removal_requests OWNER TO smartreach_user;
GRANT ALL PRIVILEGES ON TABLE data_removal_requests TO smartreach_user;
"""

cmd = [
    'ssh',
    '-o', 'StrictHostKeyChecking=no',
    '-i', key_path,
    'ubuntu@130.61.146.177',
    f"sudo -u postgres psql -d smartreach -c \"{sql}\""
]

res = subprocess.run(cmd, capture_output=True, text=True)
print("STDOUT:\n", res.stdout)
print("STDERR:\n", res.stderr)
