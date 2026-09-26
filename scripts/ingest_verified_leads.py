import os
import sys
import sqlite3
import csv
import json
import re
import time
from collections import Counter

sys.stdout.reconfigure(encoding='utf-8')

DB_PATH = r'c:\Users\Krish Shah\Documents\antigravity\joyful-carson\data\leads.db'
CSV_PATH = r'C:\Users\Krish Shah\WorkBuddy AI\2026-09-26-23-12-06\LinkedIn 2021 Verified Email Master.csv'

ACRONYMS = {
    'ceo', 'cto', 'cfo', 'coo', 'cmo', 'cio', 'cro', 'cpo', 'vp', 'avp', 'evp', 'svp',
    'hr', 'it', 'ai', 'ml', 'pr', 'qa', 'ui', 'ux', 'llc', 'inc', 'ltd', 'corp', 'usa',
    'uk', 'uae', 'eu', 'ny', 'ca', 'sf', 'mba', 'phd', 'md', 'rn', 'cpa'
}

LOWERCASE_WORDS = {
    'and', 'of', 'in', 'for', 'the', 'at', 'on', 'by', 'to', 'a', 'an', 'via', 'with', 'or', 'de', 'la', 'del', 'da', 'di'
}

FREE_EMAIL_PROVIDERS = {
    'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'rocketmail.com',
    'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
    'aol.com', 'aim.com', 'icloud.com', 'me.com', 'mac.com',
    'proton.me', 'protonmail.com', 'mail.com', 'zoho.com', 'gmx.com', 'gmx.net',
    'yandex.com', 'yandex.ru', 'comcast.net', 'sbcglobal.net', 'verizon.net',
    'att.net', 'bell.net', 'cox.net', 'charter.net', 'shaw.ca', 'earthlink.net'
}

TRASH_TITLES = {'none', 'n/a', 'na', 'null', 'unknown', 'student', 'unemployed'}

def is_personal_email(email):
    if not email or '@' not in email:
        return False
    domain = email.split('@')[-1].strip().lower()
    if domain in FREE_EMAIL_PROVIDERS:
        return True
    for root in ['yahoo', 'hotmail', 'outlook', 'live', 'msn', 'aol', 'gmail']:
        if domain.startswith(root + '.') or '.' + root + '.' in domain:
            return True
    return False

def smart_title_case(text):
    if not text:
        return ''
    text = text.strip()
    if not text:
        return ''
    # If text already has natural mixed casing, preserve it
    if not (text.islower() or text.isupper()):
        return text

    words = text.split(' ')
    result_words = []
    for i, word in enumerate(words):
        if not word:
            continue
        clean_w = re.sub(r'[^a-zA-Z0-9]', '', word).lower()
        if clean_w in ACRONYMS:
            idx = word.lower().find(clean_w)
            prefix = word[:idx]
            suffix = word[idx + len(clean_w):]
            result_words.append(prefix + clean_w.upper() + suffix)
            continue
            
        if i > 0 and word.lower() in LOWERCASE_WORDS:
            result_words.append(word.lower())
            continue
            
        if '-' in word:
            subparts = [smart_title_case(sp) for sp in word.split('-')]
            result_words.append('-'.join(subparts))
            continue
            
        if len(word) > 2 and (word.lower().startswith("o'") or word.lower().startswith("d'")):
            result_words.append(word[:2].capitalize() + smart_title_case(word[2:]))
            continue
            
        if len(word) > 3 and word.lower().startswith('mc') and word[2].isalpha():
            result_words.append('Mc' + word[2:].capitalize())
            continue
            
        result_words.append(word.capitalize())
        
    return ' '.join(result_words)

def run_migration():
    print(f"=== STEP 1: CONNECT TO SQLITE DATABASE ({DB_PATH}) ===")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    cur.execute("PRAGMA journal_mode = WAL;")
    cur.execute("PRAGMA synchronous = NORMAL;")
    cur.execute("PRAGMA cache_size = -64000;")
    
    cur.execute("PRAGMA table_info(leads)")
    existing_cols = {c[1] for c in cur.fetchall()}
    
    if 'work_email' not in existing_cols:
        print("Adding 'work_email' column to leads...")
        cur.execute("ALTER TABLE leads ADD COLUMN work_email TEXT;")
    if 'personal_email' not in existing_cols:
        print("Adding 'personal_email' column to leads...")
        cur.execute("ALTER TABLE leads ADD COLUMN personal_email TEXT;")
        
    conn.commit()

    print("\n=== STEP 2: CLASSIFYING EXISTING LEADS IN LEADS.DB ===")
    cur.execute("SELECT COUNT(*) FROM leads")
    total_existing = cur.fetchone()[0]
    print(f"Total existing leads in DB: {total_existing:,}")

    # Fetch existing leads to classify emails and collect existing email set
    existing_emails_set = set()
    cur.execute("SELECT id, email, raw_data, work_email, personal_email FROM leads")
    all_existing_rows = cur.fetchall()

    updates = []
    classified_work = 0
    classified_personal = 0
    both_emails_count = 0

    for row_id, primary_email, raw_data, curr_work, curr_personal in all_existing_rows:
        if primary_email:
            existing_emails_set.add(primary_email.strip().lower())
            
        # If already classified, skip
        if curr_work or curr_personal:
            if curr_work and curr_personal: both_emails_count += 1
            elif curr_work: classified_work += 1
            elif curr_personal: classified_personal += 1
            continue

        work_em = None
        personal_em = None

        if primary_email and '@' in primary_email:
            clean_em = primary_email.strip()
            if is_personal_email(clean_em):
                personal_em = clean_em
            else:
                work_em = clean_em

        # Check raw_data for additional emails
        if raw_data:
            try:
                raw_json = json.loads(raw_data)
                for k, v in raw_json.items():
                    if k.startswith('email_') and isinstance(v, str) and '@' in v:
                        v_clean = v.strip()
                        existing_emails_set.add(v_clean.lower())
                        if is_personal_email(v_clean):
                            if not personal_em:
                                personal_em = v_clean
                        else:
                            if not work_em:
                                work_em = v_clean
            except:
                pass

        if work_em or personal_em:
            updates.append((work_em, personal_em, row_id))
            if work_em and personal_em: both_emails_count += 1
            elif work_em: classified_work += 1
            elif personal_em: classified_personal += 1

    if updates:
        print(f"Applying email classification to {len(updates):,} existing rows...")
        cur.executemany("UPDATE leads SET work_email = ?, personal_email = ? WHERE id = ?", updates)
        conn.commit()
        print("Existing classification committed successfully!")

    print(f"Existing breakdown: {classified_work:,} work-only, {classified_personal:,} personal-only, {both_emails_count:,} with both.")
    print(f"Total unique existing email addresses: {len(existing_emails_set):,}")

    print("\n=== STEP 3: INGESTING GRADE A, B, C LEADS FROM VERIFIED CSV ===")
    print(f"Reading from: {CSV_PATH}")

    inserted_count = 0
    skipped_grade_d = 0
    skipped_duplicate = 0
    start_time = time.time()

    insert_sql = """
    INSERT INTO leads (
        lead_id, first_name, last_name, full_name, job_title,
        company_name, company_website, linkedin_url, location,
        city, state, country, industry, team_size, revenue_range,
        email, email_status, phone, email_count, phone_count,
        source_file, raw_data, work_email, personal_email
    ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?
    )
    """

    batch = []
    batch_size = 5000

    with open(CSV_PATH, 'r', encoding='utf-8', errors='replace') as f:
        reader = csv.DictReader(f)
        if reader.fieldnames and reader.fieldnames[0].startswith('\ufeff'):
            reader.fieldnames[0] = reader.fieldnames[0].replace('\ufeff', '')

        for row in reader:
            verified_em = (row.get('verified_email') or '').strip()
            work_em_raw = (row.get('work_email') or '').strip()
            emails_raw = (row.get('emails') or '').strip()

            # Must have a verified email
            if not verified_em or '@' not in verified_em:
                continue

            company_raw = (row.get('job_company_name') or '').strip()
            title_raw = (row.get('job_title') or '').strip()

            has_co = bool(company_raw)
            has_ti = bool(title_raw) and title_raw.lower() not in TRASH_TITLES

            # Avoid Grade D: Missing BOTH Company and Title
            if not has_co and not has_ti:
                skipped_grade_d += 1
                continue

            # Classify emails
            all_candidate_emails = []
            if verified_em: all_candidate_emails.append(verified_em)
            if work_em_raw and work_em_raw != verified_em: all_candidate_emails.append(work_em_raw)
            if emails_raw:
                for em_token in emails_raw.split(','):
                    em_clean = em_token.strip()
                    if '@' in em_clean and em_clean not in all_candidate_emails:
                        all_candidate_emails.append(em_clean)

            lead_work_email = None
            lead_personal_email = None

            for em in all_candidate_emails:
                if is_personal_email(em):
                    if not lead_personal_email: lead_personal_email = em
                else:
                    if not lead_work_email: lead_work_email = em

            # Primary email preference: work email if available, else verified personal email
            primary_email = lead_work_email if lead_work_email else verified_em
            clean_primary_lower = primary_email.lower().strip()

            # Deduplication
            if clean_primary_lower in existing_emails_set:
                skipped_duplicate += 1
                continue
            existing_emails_set.add(clean_primary_lower)

            # Smart title casing
            first_name = smart_title_case(row.get('first_name', ''))
            last_name = smart_title_case(row.get('last_name', ''))
            full_name = smart_title_case(row.get('full_name', ''))
            if not full_name and (first_name or last_name):
                full_name = f"{first_name} {last_name}".strip()

            job_title = smart_title_case(title_raw) if has_ti else ''
            company_name = smart_title_case(company_raw) if has_co else ''
            company_website = (row.get('job_company_website') or '').strip().lower()

            city = smart_title_case(row.get('location_locality', ''))
            state = smart_title_case(row.get('location_region', ''))
            country = smart_title_case(row.get('location_country', ''))

            location_parts = [p for p in [city, state, country] if p]
            location = ', '.join(location_parts)

            industry = smart_title_case(row.get('industry', '') or row.get('job_company_industry', ''))
            team_size = (row.get('job_company_size') or '').strip()
            linkedin_url = (row.get('linkedin_url') or '').strip()
            phone = (row.get('mobile_phone') or '').strip()

            email_count = len({em.lower() for em in [lead_work_email, lead_personal_email, primary_email] if em})
            phone_count = 1 if phone else 0

            # Compact secondary metadata in raw_data (omitting 83-col bloat)
            compact_meta = {}
            if row.get('job_title_role'): compact_meta['job_role'] = row.get('job_title_role')
            if row.get('job_title_levels'): compact_meta['job_levels'] = smart_title_case(row.get('job_title_levels'))
            if row.get('inferred_years_experience'): compact_meta['years_experience'] = row.get('inferred_years_experience')
            if row.get('job_start_date'): compact_meta['job_start_date'] = row.get('job_start_date')
            if row.get('job_last_updated'): compact_meta['job_last_updated'] = row.get('job_last_updated')
            if row.get('verified_email_source'): compact_meta['verified_source'] = row.get('verified_email_source')
            if row.get('linkedin_connections'): compact_meta['linkedin_connections'] = row.get('linkedin_connections')
            if row.get('birth_year'): compact_meta['birth_year'] = row.get('birth_year')

            raw_data_str = json.dumps(compact_meta) if compact_meta else '{}'
            lead_id = f"LI_{row.get('id') or (inserted_count + 1)}"

            batch.append((
                lead_id, first_name, last_name, full_name, job_title,
                company_name, company_website, linkedin_url, location,
                city, state, country, industry, team_size, '',
                primary_email, 'VALID', phone, email_count, phone_count,
                'LinkedIn_2021_Verified_Master.csv', raw_data_str,
                lead_work_email or '', lead_personal_email or ''
            ))

            inserted_count += 1

            if len(batch) >= batch_size:
                cur.executemany(insert_sql, batch)
                conn.commit()
                batch = []
                print(f"  Ingested {inserted_count:,} leads... (Elapsed: {time.time() - start_time:.1f}s)")

    if batch:
        cur.executemany(insert_sql, batch)
        conn.commit()

    print(f"\nIngestion finished in {time.time() - start_time:.1f}s!")
    print(f"Total new leads inserted: {inserted_count:,}")
    print(f"Grade D skipped (missing company & title): {skipped_grade_d:,}")
    print(f"Duplicates skipped: {skipped_duplicate:,}")

    print("\n=== STEP 4: CREATING WORK/PERSONAL EMAIL INDEXES ===")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_leads_work_email ON leads(work_email);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_leads_personal_email ON leads(personal_email);")
    conn.commit()

    print("\n=== STEP 5: FINAL DATABASE VERIFICATION ===")
    cur.execute("SELECT COUNT(*) FROM leads")
    final_total = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM leads WHERE work_email IS NOT NULL AND work_email != ''")
    total_with_work_email = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM leads WHERE personal_email IS NOT NULL AND personal_email != ''")
    total_with_personal_email = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM leads WHERE (work_email IS NOT NULL AND work_email != '') AND (personal_email IS NOT NULL AND personal_email != '')")
    total_with_both = cur.fetchone()[0]

    print(f"Final Total Leads in Database: {final_total:,}")
    print(f"  - Leads with Work Email:     {total_with_work_email:,} ({total_with_work_email/final_total*100:.1f}%)")
    print(f"  - Leads with Personal Email: {total_with_personal_email:,} ({total_with_personal_email/final_total*100:.1f}%)")
    print(f"  - Leads with BOTH:           {total_with_both:,} ({total_with_both/final_total*100:.1f}%)")

    # Sample query from the newly ingested leads
    print("\n--- Newly Ingested Leads Sample ---")
    cur.execute("""
        SELECT full_name, job_title, company_name, work_email, personal_email, country 
        FROM leads 
        WHERE source_file = 'LinkedIn_2021_Verified_Master.csv' 
        LIMIT 5
    """)
    for r in cur.fetchall():
        print(f"  Name: {r[0]} | Title: {r[1]} | Company: {r[2]}")
        print(f"    Work Email: {r[3]} | Personal Email: {r[4]} | Country: {r[5]}")

    conn.close()
    print("\n=== MIGRATION COMPLETED SUCCESSFULLY ===")

if __name__ == '__main__':
    run_migration()
