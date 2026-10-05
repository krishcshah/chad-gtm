import os
import sys
import sqlite3
import csv
import json
import time

sys.stdout.reconfigure(encoding='utf-8')

CSV_PATH = r'C:\Users\Krish Shah\Documents\antigravity\beautiful-shannon\apollo_leads_delivery\master_valid_only.csv'
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'leads.db')

def extract_domain(email):
    if not email or '@' not in email:
        return ''
    domain = email.split('@')[-1].strip().lower()
    return domain

def run_ingestion(limit=None):
    print("=" * 60)
    print("CHADGTM B2B DIRECTORY INGESTION ENGINE")
    print(f"Source: {CSV_PATH}")
    print(f"Target DB: {DB_PATH}")
    print("=" * 60)

    if not os.path.exists(CSV_PATH):
        print(f"ERROR: CSV file not found at {CSV_PATH}")
        sys.exit(1)

    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Optimizing SQLite performance for multi-million row batch writes
    cur.execute("PRAGMA journal_mode = WAL;")
    cur.execute("PRAGMA synchronous = OFF;")
    cur.execute("PRAGMA cache_size = -128000;") # 128MB RAM cache
    cur.execute("PRAGMA temp_store = MEMORY;")

    # Ensure schema exists
    cur.execute("""
    CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id TEXT,
        first_name TEXT,
        last_name TEXT,
        full_name TEXT,
        job_title TEXT,
        company_name TEXT,
        company_website TEXT,
        linkedin_url TEXT,
        location TEXT,
        city TEXT,
        state TEXT,
        country TEXT,
        industry TEXT,
        team_size TEXT,
        revenue_range TEXT,
        email TEXT,
        email_status TEXT,
        phone TEXT,
        email_count INTEGER DEFAULT 0,
        phone_count INTEGER DEFAULT 0,
        source_file TEXT,
        raw_data TEXT,
        work_email TEXT,
        personal_email TEXT,
        seniority TEXT,
        department TEXT
    );
    """)

    # Check and add columns if upgrading
    cur.execute("PRAGMA table_info(leads);")
    existing_cols = {c[1] for c in cur.fetchall()}
    if 'seniority' not in existing_cols:
        cur.execute("ALTER TABLE leads ADD COLUMN seniority TEXT;")
    if 'department' not in existing_cols:
        cur.execute("ALTER TABLE leads ADD COLUMN department TEXT;")
    conn.commit()

    cur.execute("SELECT COUNT(*) FROM leads;")
    pre_count = cur.fetchone()[0]
    print(f"Current leads in database: {pre_count:,}")

    # Drop existing indexes for massive insert speedup
    print("Dropping indexes for high-speed sequential bulk insert...")
    indexes = [
        "idx_leads_industry", "idx_leads_country", "idx_leads_company",
        "idx_leads_job_title", "idx_leads_email", "idx_leads_work_email",
        "idx_leads_personal_email", "idx_leads_seniority", "idx_leads_department"
    ]
    for idx in indexes:
        cur.execute(f"DROP INDEX IF EXISTS {idx};")
    conn.commit()

    insert_sql = """
    INSERT INTO leads (
        lead_id, first_name, last_name, full_name, job_title,
        company_name, company_website, linkedin_url, location,
        city, state, country, industry, team_size, revenue_range,
        email, email_status, phone, email_count, phone_count,
        source_file, raw_data, work_email, personal_email,
        seniority, department
    ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?
    );
    """

    print("Beginning CSV stream and batch insertion...")
    start_time = time.time()
    batch = []
    batch_size = 50000
    total_inserted = 0

    with open(CSV_PATH, mode='r', encoding='utf-8', errors='replace') as f:
        reader = csv.reader(f)
        header = next(reader) # skip header

        for row in reader:
            if not row or len(row) < 5:
                continue

            first_name = row[0].strip() if len(row) > 0 else ''
            last_name = row[1].strip() if len(row) > 1 else ''
            full_name = row[2].strip() if len(row) > 2 else ''
            if not full_name:
                full_name = f"{first_name} {last_name}".strip()

            work_email = row[3].strip().lower() if len(row) > 3 else ''
            if not work_email:
                continue

            job_title = row[4].strip() if len(row) > 4 else ''
            company = row[5].strip() if len(row) > 5 else ''
            country = row[6].strip() if len(row) > 6 else ''
            city = row[7].strip() if len(row) > 7 else ''
            state = row[8].strip() if len(row) > 8 else ''

            loc_parts = [p for p in [city, state, country] if p]
            location = ", ".join(loc_parts)

            phone = row[9].strip().lstrip("'") if len(row) > 9 else ''
            linkedin_url = row[10].strip() if len(row) > 10 else ''
            seniority = row[11].strip() if len(row) > 11 else ''
            department = row[12].strip() if len(row) > 12 else ''

            # Map primary department to industry facet
            if department:
                primary_dept = department.split(',')[0].strip()
            else:
                primary_dept = ''

            company_website = extract_domain(work_email)
            validity_status = row[13].strip() if len(row) > 13 else 'VALID'
            apollo_status = row[14].strip() if len(row) > 14 else 'Verified'

            raw_dict = {
                "seniority": seniority,
                "department": department,
                "validity_status": validity_status,
                "apollo_status": apollo_status
            }
            raw_data = json.dumps(raw_dict, ensure_ascii=False)

            lead_id = f"apollo_{pre_count + total_inserted + len(batch) + 1}"

            batch.append((
                lead_id, first_name, last_name, full_name, job_title,
                company, company_website, linkedin_url, location,
                city, state, country, primary_dept, '', '',
                work_email, validity_status, phone, 1, (1 if phone else 0),
                'master_valid_only.csv', raw_data, work_email, '',
                seniority, department
            ))

            if len(batch) >= batch_size:
                cur.executemany(insert_sql, batch)
                conn.commit()
                total_inserted += len(batch)
                batch = []
                elapsed = time.time() - start_time
                rate = total_inserted / elapsed
                print(f"  -> Ingested {total_inserted:,} leads ({rate:,.0f} leads/sec, elapsed: {elapsed:.1f}s)...")

            if limit and total_inserted >= limit:
                break

        if batch:
            cur.executemany(insert_sql, batch)
            conn.commit()
            total_inserted += len(batch)
            batch = []

    elapsed = time.time() - start_time
    print(f"Bulk insert complete! Ingested {total_inserted:,} leads in {elapsed:.1f}s ({total_inserted/elapsed:,.0f} leads/sec).")

    # Rebuilding indexes
    print("\nRebuilding optimized database indexes...")
    idx_start = time.time()
    
    cur.execute("CREATE INDEX IF NOT EXISTS idx_leads_industry ON leads(industry);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_leads_country ON leads(country);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_leads_company ON leads(company_name);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_leads_job_title ON leads(job_title);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_leads_work_email ON leads(work_email);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_leads_seniority ON leads(seniority);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_leads_department ON leads(department);")
    conn.commit()
    print(f"Indexes built successfully in {time.time() - idx_start:.1f}s!")

    # Precomputing facets cache for sub-millisecond query speed
    print("\nPrecomputing directory facets cache...")
    cur.execute("CREATE TABLE IF NOT EXISTS directory_facets_cache (facet_type TEXT, facet_value TEXT, facet_count INTEGER);")
    cur.execute("DELETE FROM directory_facets_cache;")

    cur.execute("SELECT industry, COUNT(*) as cnt FROM leads WHERE industry IS NOT NULL AND industry != '' GROUP BY industry ORDER BY cnt DESC LIMIT 50;")
    for r in cur.fetchall():
        cur.execute("INSERT INTO directory_facets_cache VALUES ('industry', ?, ?)", (r[0], r[1]))

    cur.execute("SELECT country, COUNT(*) as cnt FROM leads WHERE country IS NOT NULL AND country != '' GROUP BY country ORDER BY cnt DESC LIMIT 50;")
    for r in cur.fetchall():
        cur.execute("INSERT INTO directory_facets_cache VALUES ('country', ?, ?)", (r[0], r[1]))

    cur.execute("SELECT seniority, COUNT(*) as cnt FROM leads WHERE seniority IS NOT NULL AND seniority != '' GROUP BY seniority ORDER BY cnt DESC LIMIT 20;")
    for r in cur.fetchall():
        cur.execute("INSERT INTO directory_facets_cache VALUES ('seniority', ?, ?)", (r[0], r[1]))

    conn.commit()
    print("Facets cache populated successfully!")

    # Final summary statistics
    cur.execute("SELECT COUNT(*) FROM leads;")
    final_count = cur.fetchone()[0]
    db_size_mb = os.path.getsize(DB_PATH) / (1024 * 1024)

    print("=" * 60)
    print("INGESTION SUCCESSFUL")
    print(f"Total leads in ChadGTM Directory: {final_count:,}")
    print(f"New leads added: {total_inserted:,}")
    print(f"Database file size: {db_size_mb:,.1f} MB")
    print("=" * 60)

    # Verification query benchmark
    t_test = time.time()
    cur.execute("SELECT full_name, job_title, company_name, country, email FROM leads WHERE country = 'United States' AND industry = 'Operations' LIMIT 10;")
    sample_leads = cur.fetchall()
    q_time = (time.time() - t_test) * 1000
    print(f"Verification query completed in {q_time:.2f}ms. Sample lead:")
    if sample_leads:
        print(" ", sample_leads[0])

    conn.close()

if __name__ == '__main__':
    run_ingestion()
