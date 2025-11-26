# HS Code Extraction Guide

**Version:** 1.0
**Date:** 2025-11-24
**Project:** HS Code Classifier
**Purpose:** Comprehensive guide to extract, clean, and prepare 14,000+ HS codes from official sources

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Data Sources](#data-sources)
3. [Extraction Methods](#extraction-methods)
4. [Data Cleaning & Normalization](#data-cleaning--normalization)
5. [Synonym Generation](#synonym-generation)
6. [Embedding Generation](#embedding-generation)
7. [Implementation Guide](#implementation-guide)
8. [Appendices](#appendices)

---

## Executive Summary

### Objective
Extract all 14,000+ HS codes from official Indian Customs sources, clean and normalize the data, generate synonyms for terminology matching, and create vector embeddings for semantic search.

### Target Data Volume
- **HS Codes:** 14,000+ (8-digit ITC-HS codes)
- **Synonyms:** ~50,000 term mappings
- **Embeddings:** 14,000+ 1536-dimensional vectors

### Timeline
- **Week 1:** Data extraction (automated scraping)
- **Week 2:** Cleaning, normalization, synonym generation, embedding creation

### Success Metrics
- 100% coverage of ITC-HS 2022 codes
- <1% data quality errors
- Synonym database covers 95%+ common product terms

---

## Data Sources

### Primary Source: Indian Customs ICEGATE
**URL:** https://www.icegate.gov.in/
**Format:** HTML tables, PDF documents
**Coverage:** Complete ITC-HS 2022 classification (8-digit codes)

**Advantages:**
- Official government source
- Most up-to-date classification
- Includes duty rates and restrictions

**Challenges:**
- No public API
- Data spread across multiple pages
- Requires scraping

### Secondary Source: DGFT (Directorate General of Foreign Trade)
**URL:** https://dgft.gov.in/
**Format:** PDF schedules
**Coverage:** Import/Export ITC-HS codes

**Advantages:**
- Official regulatory body
- Includes export incentive schemes

**Challenges:**
- PDF parsing required
- Updates quarterly

### Tertiary Source: Iceberg Platform
**URL:** https://iceberginsights.in/
**Format:** Web interface
**Coverage:** HS code search with descriptions

**Advantages:**
- User-friendly interface
- Good descriptions and examples
- Product categorization

**Challenges:**
- Commercial platform (potential terms of service issues)
- May not be complete

### International Reference: UN Trade Statistics
**URL:** https://unstats.un.org/unsd/classifications/Econ/hs
**Format:** Excel, CSV
**Coverage:** Global HS 2022 classification (6-digit base)

**Advantages:**
- Authoritative international standard
- Multiple language translations
- Explanatory notes

**Challenges:**
- Only 6-digit codes (India uses 8-digit)
- Requires mapping to ITC-HS

---

## Extraction Methods

### Method 1: ICEGATE Web Scraping (Recommended)

#### Step 1: Analyze Website Structure
```bash
# Navigate to tariff schedule
https://www.icegate.gov.in/WebAppl/Customs/Tariff_Schedule

# Inspect HTML structure
# - Identify table elements
# - Locate HS code fields
# - Find description fields
# - Note duty rate columns
```

#### Step 2: Build Python Scraper
```python
import requests
from bs4 import BeautifulSoup
import pandas as pd
import time
import json
from typing import List, Dict

class ICEGATEScraper:
    """
    Scrape HS codes from ICEGATE website
    """

    BASE_URL = "https://www.icegate.gov.in/WebAppl/Customs"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })

    def get_chapters(self) -> List[Dict]:
        """
        Extract all chapter numbers (2-digit codes)
        """
        url = f"{self.BASE_URL}/Tariff_Schedule"
        response = self.session.get(url)
        soup = BeautifulSoup(response.content, 'html.parser')

        chapters = []
        # Find chapter links (adjust selector based on actual structure)
        for link in soup.select('a.chapter-link'):
            chapter_num = link.get('data-chapter') or link.text.strip()[:2]
            chapter_name = link.text.strip()
            chapters.append({
                'chapter': chapter_num,
                'name': chapter_name,
                'url': link.get('href')
            })

        print(f"Found {len(chapters)} chapters")
        return chapters

    def get_headings(self, chapter: str) -> List[Dict]:
        """
        Extract all 4-digit headings for a chapter
        """
        url = f"{self.BASE_URL}/Tariff_Schedule/Chapter/{chapter}"
        response = self.session.get(url)
        soup = BeautifulSoup(response.content, 'html.parser')

        headings = []
        for row in soup.select('tr.heading-row'):
            code = row.select_one('td.code').text.strip()
            desc = row.select_one('td.description').text.strip()
            headings.append({
                'heading': code,
                'description': desc
            })

        print(f"  Chapter {chapter}: {len(headings)} headings")
        return headings

    def get_subheadings(self, heading: str) -> List[Dict]:
        """
        Extract all 6-digit subheadings for a heading
        """
        url = f"{self.BASE_URL}/Tariff_Schedule/Heading/{heading}"
        response = self.session.get(url)
        soup = BeautifulSoup(response.content, 'html.parser')

        subheadings = []
        for row in soup.select('tr.subheading-row'):
            code = row.select_one('td.code').text.strip()
            desc = row.select_one('td.description').text.strip()
            subheadings.append({
                'subheading': code,
                'description': desc
            })

        return subheadings

    def get_full_codes(self, subheading: str) -> List[Dict]:
        """
        Extract all 8-digit full codes for a subheading
        """
        url = f"{self.BASE_URL}/Tariff_Schedule/Subheading/{subheading}"
        response = self.session.get(url)
        soup = BeautifulSoup(response.content, 'html.parser')

        full_codes = []
        for row in soup.select('tr.code-row'):
            code = row.select_one('td.code').text.strip()
            desc = row.select_one('td.description').text.strip()

            # Extract duty rates
            basic_duty = row.select_one('td.basic-duty')
            basic_duty = basic_duty.text.strip() if basic_duty else None

            full_codes.append({
                'hs_code': code,
                'description': desc,
                'basic_duty': basic_duty,
                'chapter': code[:2],
                'heading': code[:4],
                'subheading': code[:6]
            })

        return full_codes

    def scrape_all(self, output_file: str = 'hs_codes_raw.json'):
        """
        Scrape all HS codes hierarchically
        """
        all_codes = []

        print("Starting ICEGATE scraping...")
        chapters = self.get_chapters()

        for chapter in chapters:
            print(f"\nProcessing Chapter {chapter['chapter']}: {chapter['name']}")

            headings = self.get_headings(chapter['chapter'])

            for heading in headings:
                subheadings = self.get_subheadings(heading['heading'])

                for subheading in subheadings:
                    full_codes = self.get_full_codes(subheading['subheading'])
                    all_codes.extend(full_codes)

                    # Rate limiting
                    time.sleep(0.5)

            # Save progress after each chapter
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(all_codes, f, indent=2, ensure_ascii=False)

            print(f"  Total codes so far: {len(all_codes)}")
            time.sleep(1)  # Be nice to the server

        print(f"\n✓ Scraping complete: {len(all_codes)} HS codes extracted")
        return all_codes

# Usage
scraper = ICEGATEScraper()
codes = scraper.scrape_all('hs_codes_raw.json')
```

#### Step 3: Handle Errors and Retries
```python
import logging
from tenacity import retry, stop_after_attempt, wait_exponential

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class RobustScraper(ICEGATEScraper):
    """
    Enhanced scraper with error handling and retries
    """

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10)
    )
    def get_with_retry(self, url: str):
        """
        Make request with exponential backoff retry
        """
        try:
            response = self.session.get(url, timeout=30)
            response.raise_for_status()
            return response
        except requests.exceptions.RequestException as e:
            logger.error(f"Request failed for {url}: {e}")
            raise

    def scrape_all_robust(self, output_file: str = 'hs_codes_raw.json'):
        """
        Scrape with checkpointing for resume capability
        """
        checkpoint_file = 'scraping_checkpoint.json'

        # Load checkpoint if exists
        try:
            with open(checkpoint_file, 'r') as f:
                checkpoint = json.load(f)
                completed_chapters = set(checkpoint.get('completed_chapters', []))
                all_codes = checkpoint.get('codes', [])
        except FileNotFoundError:
            completed_chapters = set()
            all_codes = []

        chapters = self.get_chapters()

        for chapter in chapters:
            if chapter['chapter'] in completed_chapters:
                print(f"Skipping completed chapter {chapter['chapter']}")
                continue

            try:
                print(f"\nProcessing Chapter {chapter['chapter']}: {chapter['name']}")
                # ... scraping logic ...

                # Mark chapter as complete
                completed_chapters.add(chapter['chapter'])

                # Save checkpoint
                with open(checkpoint_file, 'w') as f:
                    json.dump({
                        'completed_chapters': list(completed_chapters),
                        'codes': all_codes
                    }, f)

            except Exception as e:
                logger.error(f"Failed to process chapter {chapter['chapter']}: {e}")
                # Save checkpoint and continue
                with open(checkpoint_file, 'w') as f:
                    json.dump({
                        'completed_chapters': list(completed_chapters),
                        'codes': all_codes
                    }, f)

        return all_codes
```

### Method 2: PDF Parsing (DGFT Schedules)

```python
import pdfplumber
import re

def extract_from_dgft_pdf(pdf_path: str) -> List[Dict]:
    """
    Extract HS codes from DGFT PDF schedules
    """
    codes = []

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            # Extract tables
            tables = page.extract_tables()

            for table in tables:
                for row in table[1:]:  # Skip header
                    if len(row) >= 2:
                        # Assume format: [HS Code, Description, ...]
                        hs_code = row[0].strip()
                        description = row[1].strip()

                        # Validate HS code format (8 digits with optional dot)
                        if re.match(r'^\d{4}\.\d{2}\.\d{2}$', hs_code):
                            codes.append({
                                'hs_code': hs_code,
                                'description': description
                            })

    print(f"Extracted {len(codes)} codes from PDF")
    return codes
```

### Method 3: API Integration (If Available)

```python
import requests

def fetch_from_api(api_key: str) -> List[Dict]:
    """
    Fetch HS codes from API (if official API becomes available)
    """
    BASE_API = "https://api.customs.gov.in/v1"

    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    }

    all_codes = []
    page = 1

    while True:
        response = requests.get(
            f"{BASE_API}/hs-codes",
            headers=headers,
            params={'page': page, 'per_page': 1000}
        )

        if response.status_code != 200:
            break

        data = response.json()
        all_codes.extend(data['codes'])

        if not data.get('has_next_page'):
            break

        page += 1

    return all_codes
```

---

## Data Cleaning & Normalization

### Step 1: Validate HS Code Format

```python
import re

def validate_hs_code(code: str) -> bool:
    """
    Validate HS code format
    Expected: XXXX.XX.XX (8-digit ITC-HS)
    """
    # Remove spaces
    code = code.replace(' ', '')

    # Check format
    pattern = r'^\d{4}\.\d{2}\.\d{2}$'
    return bool(re.match(pattern, code))

def normalize_hs_code(code: str) -> str:
    """
    Normalize HS code to standard format
    """
    # Remove all non-digit characters
    digits = re.sub(r'\D', '', code)

    # Ensure 8 digits
    if len(digits) != 8:
        raise ValueError(f"Invalid HS code: {code} (expected 8 digits)")

    # Format as XXXX.XX.XX
    return f"{digits[:4]}.{digits[4:6]}.{digits[6:8]}"

# Apply to dataset
df['hs_code'] = df['hs_code'].apply(normalize_hs_code)
```

### Step 2: Clean Descriptions

```python
def clean_description(desc: str) -> str:
    """
    Clean and standardize HS code descriptions
    """
    # Remove extra whitespace
    desc = ' '.join(desc.split())

    # Remove special characters (but keep hyphens, parentheses, slashes)
    desc = re.sub(r'[^\w\s\-\(\)/,.]', '', desc)

    # Capitalize first letter
    desc = desc.capitalize()

    # Remove redundant phrases
    redundant = [
        'Other than',
        'Not elsewhere specified',
        'N.E.S.',
        'n.e.s.'
    ]
    for phrase in redundant:
        desc = desc.replace(phrase, '').strip()

    return desc

df['description_clean'] = df['description'].apply(clean_description)
```

### Step 3: Remove Duplicates

```python
def deduplicate_codes(df: pd.DataFrame) -> pd.DataFrame:
    """
    Remove duplicate HS codes, keeping the most complete entry
    """
    # Sort by description length (longer = more detailed)
    df['desc_length'] = df['description_clean'].str.len()
    df = df.sort_values('desc_length', ascending=False)

    # Drop duplicates, keeping first (longest description)
    df = df.drop_duplicates(subset=['hs_code'], keep='first')
    df = df.drop(columns=['desc_length'])

    return df

df_clean = deduplicate_codes(df)
```

### Step 4: Add Hierarchical Fields

```python
def add_hierarchy(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add chapter, heading, subheading fields
    """
    df['chapter'] = df['hs_code'].str[:2]
    df['heading'] = df['hs_code'].str[:4]
    df['subheading'] = df['hs_code'].str[:7]  # XXXX.XX

    return df

df_clean = add_hierarchy(df_clean)
```

### Step 5: Validate Data Quality

```python
def validate_dataset(df: pd.DataFrame) -> Dict:
    """
    Run data quality checks
    """
    report = {
        'total_codes': len(df),
        'unique_codes': df['hs_code'].nunique(),
        'missing_descriptions': df['description_clean'].isna().sum(),
        'invalid_formats': 0,
        'chapters': df['chapter'].nunique(),
        'headings': df['heading'].nunique(),
        'subheadings': df['subheading'].nunique()
    }

    # Check for invalid formats
    for code in df['hs_code']:
        if not validate_hs_code(code):
            report['invalid_formats'] += 1

    # Check expected counts
    assert report['unique_codes'] == report['total_codes'], "Duplicate codes found!"
    assert report['missing_descriptions'] == 0, "Missing descriptions found!"
    assert report['invalid_formats'] == 0, "Invalid HS code formats found!"
    assert report['chapters'] >= 97, "Expected at least 97 chapters"

    print("✓ Data quality validation passed")
    print(json.dumps(report, indent=2))

    return report

validation_report = validate_dataset(df_clean)
```

---

## Synonym Generation

### Purpose
Map common product terms to official HS code terminology to handle mismatches like "coolant" → "Antifreeze preparations".

### Step 1: Extract Keywords from Descriptions

```python
from sklearn.feature_extraction.text import TfidfVectorizer
import nltk
from nltk.corpus import stopwords

nltk.download('stopwords')
nltk.download('punkt')

def extract_keywords(df: pd.DataFrame, top_n: int = 10) -> Dict[str, List[str]]:
    """
    Extract important keywords from each HS code description using TF-IDF
    """
    # TF-IDF vectorization
    vectorizer = TfidfVectorizer(
        max_features=1000,
        stop_words='english',
        ngram_range=(1, 3)  # Unigrams, bigrams, trigrams
    )

    tfidf_matrix = vectorizer.fit_transform(df['description_clean'])
    feature_names = vectorizer.get_feature_names_out()

    keywords_by_code = {}

    for idx, row in df.iterrows():
        hs_code = row['hs_code']

        # Get TF-IDF scores for this document
        doc_vector = tfidf_matrix[idx].toarray()[0]

        # Get top N keywords
        top_indices = doc_vector.argsort()[-top_n:][::-1]
        top_keywords = [feature_names[i] for i in top_indices if doc_vector[i] > 0]

        keywords_by_code[hs_code] = top_keywords

    return keywords_by_code
```

### Step 2: Manual Synonym Database

```python
# Create manual synonym mappings for common terms
MANUAL_SYNONYMS = {
    # Coolant → Antifreeze
    'coolant': ['antifreeze', 'antifreeze preparations', 'engine coolant'],
    'radiator fluid': ['antifreeze', 'antifreeze preparations'],

    # Brake components
    'brake pad': ['brake lining', 'friction material', 'brake shoe'],
    'brake disc': ['brake rotor', 'disc brake'],

    # Engine parts
    'piston ring': ['compression ring', 'oil ring'],
    'spark plug': ['ignition plug', 'sparking plug'],

    # Filters
    'oil filter': ['lubricating oil filter', 'lube filter'],
    'air filter': ['intake filter', 'engine air filter'],

    # Electrical
    'headlight': ['headlamp', 'front lamp', 'head light'],
    'tail light': ['rear lamp', 'tail lamp'],

    # Materials
    'aluminum': ['aluminium', 'al alloy'],
    'steel': ['ferrous metal', 'iron alloy'],
    'ceramic': ['cermet', 'ceramic material'],
    'rubber': ['elastomer', 'vulcanized rubber'],

    # Add 100+ more mappings...
}

def build_synonym_database(df: pd.DataFrame, manual_synonyms: Dict) -> pd.DataFrame:
    """
    Build comprehensive synonym database
    """
    synonyms = []

    # Add manual synonyms
    for term, related_terms in manual_synonyms.items():
        for related in related_terms:
            synonyms.append({
                'user_term': term,
                'hs_term': related,
                'source': 'manual'
            })

    # Add extracted keywords as synonyms
    keywords = extract_keywords(df)

    for hs_code, kws in keywords.items():
        hs_desc = df[df['hs_code'] == hs_code]['description_clean'].iloc[0]

        for kw in kws:
            synonyms.append({
                'user_term': kw,
                'hs_term': hs_desc,
                'hs_code': hs_code,
                'source': 'tfidf'
            })

    synonym_df = pd.DataFrame(synonyms)

    print(f"✓ Built synonym database: {len(synonym_df)} mappings")
    return synonym_df
```

### Step 3: Use LLM for Synonym Generation

```python
from openai import OpenAI

client = OpenAI()

def generate_synonyms_with_ai(hs_code: str, description: str) -> List[str]:
    """
    Use GPT to generate common synonyms for HS code descriptions
    """
    prompt = f"""
Given this HS code description:
HS Code: {hs_code}
Description: {description}

Generate 5-10 common product terms that users might use to search for this product.
These should be everyday terms, brand names, or industry slang.

Examples:
- "Antifreeze preparations" → coolant, radiator fluid, engine coolant
- "Brake linings" → brake pads, brake shoes, friction material
- "Sparking plugs" → spark plugs, ignition plugs, plugs

Return as comma-separated list.
"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=100
    )

    synonyms_text = response.choices[0].message.content.strip()
    synonyms = [s.strip() for s in synonyms_text.split(',')]

    return synonyms

# Generate for all codes (expensive, run once)
def generate_all_synonyms(df: pd.DataFrame) -> pd.DataFrame:
    """
    Generate AI-powered synonyms for all HS codes
    """
    all_synonyms = []

    for idx, row in df.iterrows():
        print(f"Processing {idx+1}/{len(df)}: {row['hs_code']}")

        try:
            synonyms = generate_synonyms_with_ai(row['hs_code'], row['description_clean'])

            for syn in synonyms:
                all_synonyms.append({
                    'user_term': syn.lower(),
                    'hs_term': row['description_clean'],
                    'hs_code': row['hs_code'],
                    'source': 'gpt'
                })
        except Exception as e:
            print(f"  Error: {e}")
            continue

    return pd.DataFrame(all_synonyms)
```

---

## Embedding Generation

### Step 1: Generate Embeddings for All HS Codes

```python
from openai import OpenAI
import numpy as np

client = OpenAI()

def generate_embedding(text: str, model: str = "text-embedding-3-small") -> List[float]:
    """
    Generate embedding vector for text
    """
    response = client.embeddings.create(
        input=text,
        model=model
    )
    return response.data[0].embedding

def generate_all_embeddings(df: pd.DataFrame, batch_size: int = 100) -> pd.DataFrame:
    """
    Generate embeddings for all HS codes in batches
    """
    embeddings = []

    for i in range(0, len(df), batch_size):
        batch = df.iloc[i:i+batch_size]
        print(f"Processing batch {i//batch_size + 1}/{len(df)//batch_size + 1}")

        # Combine HS code + description for better semantic matching
        texts = [
            f"{row['hs_code']} {row['description_clean']}"
            for _, row in batch.iterrows()
        ]

        # Batch API call (more efficient)
        response = client.embeddings.create(
            input=texts,
            model="text-embedding-3-small"
        )

        batch_embeddings = [item.embedding for item in response.data]
        embeddings.extend(batch_embeddings)

    df['embedding'] = embeddings
    print(f"✓ Generated {len(embeddings)} embeddings")

    return df
```

### Step 2: Store Embeddings in Database

```python
# Add to Prisma schema
"""
model HsCode {
  id          String   @id @default(cuid())
  hsCode      String   @unique @map("hs_code")
  description String
  chapter     String
  heading     String
  subheading  String
  embedding   Unsupported("vector(1536)")? // pgvector type

  @@index([embedding], type: Ivfflat)
  @@map("hs_codes")
}
"""

# Enable pgvector
# Run in PostgreSQL:
# CREATE EXTENSION IF NOT EXISTS vector;

# Insert embeddings
async def store_embeddings(df: pd.DataFrame):
    """
    Store HS codes with embeddings in database
    """
    from prisma import Prisma

    prisma = Prisma()
    await prisma.connect()

    for _, row in df.iterrows():
        # Convert embedding to PostgreSQL vector format
        embedding_str = '[' + ','.join(map(str, row['embedding'])) + ']'

        await prisma.execute_raw(
            f"""
            INSERT INTO hs_codes (hs_code, description, chapter, heading, subheading, embedding)
            VALUES ($1, $2, $3, $4, $5, $6::vector)
            ON CONFLICT (hs_code)
            DO UPDATE SET embedding = $6::vector
            """,
            row['hs_code'],
            row['description_clean'],
            row['chapter'],
            row['heading'],
            row['subheading'],
            embedding_str
        )

    await prisma.disconnect()
    print("✓ Stored all embeddings in database")
```

---

## Implementation Guide

### Complete Extraction Pipeline

```python
# extraction_pipeline.py

import asyncio
from pathlib import Path

class HSCodeExtractionPipeline:
    """
    Complete pipeline to extract, clean, and prepare HS code data
    """

    def __init__(self, output_dir: str = 'data'):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)

    async def run(self):
        """
        Execute full extraction pipeline
        """
        print("="*60)
        print("HS CODE EXTRACTION PIPELINE")
        print("="*60)

        # Step 1: Extract raw data
        print("\n[1/6] Extracting HS codes from ICEGATE...")
        scraper = RobustScraper()
        raw_codes = scraper.scrape_all_robust(
            str(self.output_dir / 'hs_codes_raw.json')
        )
        print(f"✓ Extracted {len(raw_codes)} codes")

        # Step 2: Load and validate
        print("\n[2/6] Loading and validating data...")
        df = pd.DataFrame(raw_codes)
        df['hs_code'] = df['hs_code'].apply(normalize_hs_code)
        df['description_clean'] = df['description'].apply(clean_description)
        df = add_hierarchy(df)
        df = deduplicate_codes(df)
        validate_dataset(df)
        print(f"✓ Cleaned dataset: {len(df)} unique codes")

        # Step 3: Generate synonyms
        print("\n[3/6] Generating synonym database...")
        synonym_df = build_synonym_database(df, MANUAL_SYNONYMS)

        # Optional: Add AI-generated synonyms (expensive)
        # ai_synonyms = generate_all_synonyms(df)
        # synonym_df = pd.concat([synonym_df, ai_synonyms])

        synonym_df.to_csv(self.output_dir / 'synonyms.csv', index=False)
        print(f"✓ Saved {len(synonym_df)} synonym mappings")

        # Step 4: Generate embeddings
        print("\n[4/6] Generating embeddings...")
        df = generate_all_embeddings(df, batch_size=100)
        print("✓ Generated embeddings for all codes")

        # Step 5: Store in database
        print("\n[5/6] Storing in database...")
        await store_embeddings(df)
        print("✓ Stored in PostgreSQL with pgvector")

        # Step 6: Export final dataset
        print("\n[6/6] Exporting final dataset...")

        # Save without embeddings (too large for JSON)
        df_export = df.drop(columns=['embedding'])
        df_export.to_json(
            self.output_dir / 'hs_codes_clean.json',
            orient='records',
            indent=2
        )

        # Save embeddings separately as numpy array
        embeddings_array = np.array(df['embedding'].tolist())
        np.save(self.output_dir / 'embeddings.npy', embeddings_array)

        print(f"✓ Exported to {self.output_dir}")

        print("\n" + "="*60)
        print("EXTRACTION COMPLETE")
        print("="*60)
        print(f"Total HS codes: {len(df)}")
        print(f"Synonyms: {len(synonym_df)}")
        print(f"Embeddings: {embeddings_array.shape}")
        print(f"Output directory: {self.output_dir}")

# Run pipeline
if __name__ == "__main__":
    pipeline = HSCodeExtractionPipeline(output_dir='data/extracted')
    asyncio.run(pipeline.run())
```

### Run the Pipeline

```bash
# Install dependencies
pip install requests beautifulsoup4 pandas pdfplumber
pip install scikit-learn nltk openai numpy
pip install tenacity

# Run extraction
python extraction_pipeline.py

# Expected output files:
# data/extracted/hs_codes_raw.json      # Raw scraped data
# data/extracted/hs_codes_clean.json    # Cleaned dataset
# data/extracted/synonyms.csv           # Synonym mappings
# data/extracted/embeddings.npy         # Vector embeddings
# data/extracted/scraping_checkpoint.json  # Resume checkpoint
```

---

## Appendices

### Appendix A: HS Code Structure

```
HS Code: 8708.30.90
         ││││ ││ ││
         │││└─┴┴─┴┴─ Tariff item (8-digit, India-specific)
         ││└──────── Subheading (6-digit, international)
         │└───────── Heading (4-digit)
         └────────── Chapter (2-digit)

Chapters: 97 total (01-97)
Headings: ~1,200
Subheadings: ~5,000
Full codes: ~14,000 (ITC-HS 2022)
```

### Appendix B: Common Scraping Challenges

| Challenge | Solution |
|-----------|----------|
| IP blocking | Use rotating proxies or respect rate limits |
| JavaScript rendering | Use Selenium/Playwright instead of requests |
| CAPTCHA | Manual solving or CAPTCHA solving service |
| Data format changes | Version HTML selectors, add validation |
| Incomplete data | Cross-reference multiple sources |

### Appendix C: Data Quality Checklist

- [ ] All HS codes follow XXXX.XX.XX format
- [ ] No duplicate HS codes
- [ ] All descriptions are non-empty
- [ ] Hierarchy fields (chapter, heading, subheading) are correct
- [ ] At least 14,000 unique codes
- [ ] Synonym database covers 95%+ common terms
- [ ] Embeddings generated for all codes
- [ ] Database indexes created for fast lookup
- [ ] Backup of raw data created

### Appendix D: Cost Estimates

| Component | Quantity | Unit Cost | Total Cost |
|-----------|----------|-----------|------------|
| Scraping | 14,000 requests | Free | $0 |
| OpenAI Embeddings | 14,000 calls | $0.00002/call | $0.28 |
| OpenAI Synonyms (optional) | 14,000 calls | $0.000075/call | $1.05 |
| Storage (PostgreSQL) | 14,000 vectors | Railway free tier | $0 |
| **Total** | | | **$0.28 - $1.33** |

### Appendix E: Legal Considerations

**Terms of Service:**
- ICEGATE and DGFT data is public government information
- Web scraping should respect robots.txt
- Data is for non-commercial use in compliance with Indian law
- No redistribution of scraped data without proper attribution

**Ethical Guidelines:**
- Rate limit requests (1-2 per second)
- Scrape during off-peak hours
- Cache results to avoid repeated requests
- Provide proper attribution when using data

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-11-24 | Initial guide |

---

**Next Document:** [CLASSIFICATION-ALGORITHM.md](./CLASSIFICATION-ALGORITHM.md)
