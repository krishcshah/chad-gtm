import subprocess
import os

key_path = os.path.expanduser(r'~/.oci/smartreach_id_rsa')

sql = """
CREATE TABLE IF NOT EXISTS page_views (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  path TEXT NOT NULL,
  page_title TEXT,
  referrer TEXT,
  user_agent TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS page_views_user_idx ON page_views(user_id);
CREATE INDEX IF NOT EXISTS page_views_path_idx ON page_views(path);
CREATE INDEX IF NOT EXISTS page_views_created_at_idx ON page_views(created_at);
CREATE INDEX IF NOT EXISTS page_views_user_created_idx ON page_views(user_id, created_at);

ALTER TABLE page_views OWNER TO smartreach_user;
GRANT ALL PRIVILEGES ON TABLE page_views TO smartreach_user;
"""

cmd = [
    'ssh',
    '-o', 'StrictHostKeyChecking=no',
    '-i', key_path,
    'ubuntu@130.61.146.177',
    f"sudo -u postgres psql -d smartreach -c \"{sql}\""
]

print("Executing migration on Oracle Cloud DB...")
res = subprocess.run(cmd, capture_output=True, text=True)
print("STDOUT:\n", res.stdout)
if res.stderr:
    print("STDERR:\n", res.stderr)
