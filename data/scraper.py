"""
HS Code Data Processing Script

Reads manually classified HS codes from CSV and structures them
for database import into PostgreSQL via Prisma.

Usage:
    python scraper.py

Input:  data/test_dataset.csv
Output: data/hs_codes_seed.json
"""

import pandas as pd
import json
import re
from typing import List, Dict, Any, Optional
from pathlib import Path

# Configuration
CSV_FILE = Path(__file__).parent / "test_dataset.csv"
OUTPUT_FILE = Path(__file__).parent / "hs_codes_seed.json"

# Stopwords for keyword extraction (common words to ignore)
STOPWORDS = {
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'this', 'that', 'these', 'those', 'it', 'its', 'as', 'by', 'from',
    'has', 'have', 'had', 'will', 'would', 'can', 'could', 'should',
    'used', 'use', 'etc', 'e.g', 'i.e'
}


def validate_hs_code(code: str) -> bool:
    """
    Validate HS code format

    Valid formats:
    - 4 digits: 8708
    - 6 digits: 8708.30
    - 8 digits: 8708.30.10
    - 10 digits: 8708.30.10.00

    Args:
        code: HS code string

    Returns:
        True if valid format, False otherwise
    """
    if not code:
        return False

    # Remove spaces
    code = code.strip().replace(' ', '')

    # Pattern: 4, 6, 8, or 10 digits with optional dots
    pattern = r'^\d{4}(\.\d{2})?(\.\d{2})?(\.\d{2})?$'

    return bool(re.match(pattern, code))


def extract_keywords(description: str, max_keywords: int = 15) -> List[str]:
    """
    Extract keywords from product description

    Process:
    1. Convert to lowercase
    2. Remove punctuation
    3. Split into words
    4. Remove stopwords
    5. Remove duplicates
    6. Return unique keywords

    Args:
        description: Product description text
        max_keywords: Maximum number of keywords to extract

    Returns:
        List of keywords (lowercase, no duplicates)
    """
    if not description or pd.isna(description):
        return []

    # Convert to lowercase
    text = description.lower()

    # Remove punctuation and special characters, keep only alphanumeric and spaces
    text = re.sub(r'[^a-z0-9\s]', ' ', text)

    # Split into words
    words = text.split()

    # Remove stopwords and short words (< 3 characters)
    keywords = [
        word for word in words
        if word not in STOPWORDS and len(word) >= 3
    ]

    # Remove duplicates while preserving order
    seen = set()
    unique_keywords = []
    for keyword in keywords:
        if keyword not in seen:
            seen.add(keyword)
            unique_keywords.append(keyword)

    # Return limited number of keywords
    return unique_keywords[:max_keywords]


def extract_common_products(description: str, product_name: str) -> List[str]:
    """
    Extract common product names/variants

    Args:
        description: Product description
        product_name: Main product name

    Returns:
        List of common product names
    """
    products = []

    if product_name and not pd.isna(product_name):
        products.append(product_name.lower().strip())

    # Could add logic to extract product variants from description
    # For now, just use the main product name

    return products


def parse_hs_code(code: str) -> Dict[str, str]:
    """
    Parse HS code into chapter, heading, subheading

    Examples:
    - "8708.30.10" → chapter="87", heading="8708", subheading="8708.30"
    - "8708" → chapter="87", heading="8708", subheading="8708"

    Args:
        code: HS code string (e.g., "8708.30.10")

    Returns:
        Dictionary with chapter, heading, subheading
    """
    # Remove spaces and dots
    clean_code = code.replace('.', '').replace(' ', '')

    # Extract parts
    chapter = clean_code[:2] if len(clean_code) >= 2 else clean_code
    heading = clean_code[:4] if len(clean_code) >= 4 else clean_code
    subheading = clean_code[:6] if len(clean_code) >= 6 else heading

    # Format subheading with dot (e.g., "8708.30")
    if len(subheading) >= 6:
        subheading = f"{subheading[:4]}.{subheading[4:6]}"

    return {
        'chapter': chapter,
        'heading': heading,
        'subheading': subheading
    }


def determine_parent_code(code: str) -> Optional[str]:
    """
    Determine parent HS code

    Hierarchy:
    - 8708.30.10 → parent: 8708.30
    - 8708.30 → parent: 8708
    - 8708 → parent: None

    Args:
        code: HS code string

    Returns:
        Parent code or None
    """
    # Remove spaces
    clean_code = code.replace(' ', '')

    # If has dots, get parent by removing last segment
    if '.' in clean_code:
        parts = clean_code.split('.')
        if len(parts) > 1:
            parent_parts = parts[:-1]
            return '.'.join(parent_parts)

    # If 4 digits or less, no parent
    clean_digits = clean_code.replace('.', '')
    if len(clean_digits) <= 4:
        return None

    # Otherwise, parent is the heading (first 4 digits)
    return clean_digits[:4]


def read_csv(csv_file: Path = CSV_FILE) -> pd.DataFrame:
    """
    Read HS code data from CSV

    Expected columns:
    - product_name: Product name
    - product_description: Detailed description
    - material: Material composition
    - condition: Finished/Raw/Component
    - function: Primary function
    - hs_code: HS code (from ICEGATE)
    - hs_description: Official HS code description
    - reasoning: Why this code was chosen

    Args:
        csv_file: Path to CSV file

    Returns:
        DataFrame with HS code data
    """
    print(f"📖 Reading CSV from: {csv_file}")

    if not csv_file.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_file}")

    df = pd.read_csv(csv_file)

    print(f"✅ Loaded {len(df)} rows")
    print(f"📊 Columns: {', '.join(df.columns)}")

    return df


def structure_for_db(df: pd.DataFrame, country_code: str = 'IN') -> List[Dict[str, Any]]:
    """
    Convert DataFrame to structured JSON for database import

    Matches Prisma schema for hs_codes table:
    - id: Auto-generated
    - code: HS code
    - chapter: First 2 digits
    - heading: First 4 digits
    - subheading: First 6 digits (with dot)
    - countryCode: Country code (default: IN)
    - description: Official description
    - keywords: Array of keywords
    - commonProducts: Array of common product names
    - parentCode: Parent HS code in hierarchy

    Args:
        df: DataFrame with HS code data
        country_code: Country code (default: 'IN' for India)

    Returns:
        List of dictionaries ready for JSON export
    """
    print(f"\n🔄 Structuring {len(df)} records for database import...")

    structured_data = []
    skipped = 0

    for idx, row in df.iterrows():
        hs_code = str(row.get('hs_code', '')).strip()

        # Validate HS code
        if not validate_hs_code(hs_code):
            print(f"⚠️  Row {idx + 1}: Invalid HS code '{hs_code}' - skipping")
            skipped += 1
            continue

        # Parse HS code structure
        code_parts = parse_hs_code(hs_code)

        # Build full description (combine fields)
        description_parts = []

        if pd.notna(row.get('hs_description')):
            description_parts.append(str(row['hs_description']).strip())

        if pd.notna(row.get('product_description')):
            description_parts.append(str(row['product_description']).strip())

        full_description = ' - '.join(description_parts) if description_parts else 'No description'

        # Extract keywords from product description
        keywords = extract_keywords(
            str(row.get('product_description', '')) + ' ' +
            str(row.get('material', '')) + ' ' +
            str(row.get('function', ''))
        )

        # Extract common products
        common_products = extract_common_products(
            str(row.get('product_description', '')),
            str(row.get('product_name', ''))
        )

        # Determine parent code
        parent_code = determine_parent_code(hs_code)

        # Build record
        record = {
            'code': hs_code,
            'chapter': code_parts['chapter'],
            'heading': code_parts['heading'],
            'subheading': code_parts['subheading'],
            'countryCode': country_code,
            'description': full_description,
            'keywords': keywords,
            'commonProducts': common_products,
            'parentCode': parent_code
        }

        structured_data.append(record)

        print(f"✓ Row {idx + 1}: {hs_code} - {len(keywords)} keywords extracted")

    print(f"\n✅ Structured {len(structured_data)} records")
    if skipped > 0:
        print(f"⚠️  Skipped {skipped} records due to validation errors")

    return structured_data


def save_json(data: List[Dict[str, Any]], output_file: Path = OUTPUT_FILE) -> None:
    """
    Save structured data to JSON file

    Args:
        data: List of structured HS code records
        output_file: Output JSON file path
    """
    print(f"\n💾 Saving to: {output_file}")

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"✅ Saved {len(data)} records to {output_file}")
    print(f"📦 File size: {output_file.stat().st_size / 1024:.2f} KB")


def generate_summary(data: List[Dict[str, Any]]) -> None:
    """
    Generate summary statistics

    Args:
        data: Structured HS code data
    """
    print("\n" + "=" * 60)
    print("📊 SUMMARY STATISTICS")
    print("=" * 60)

    total_records = len(data)
    print(f"Total records: {total_records}")

    # Count by chapter
    chapters = {}
    for record in data:
        chapter = record['chapter']
        chapters[chapter] = chapters.get(chapter, 0) + 1

    print(f"\nRecords by chapter:")
    for chapter, count in sorted(chapters.items()):
        print(f"  Chapter {chapter}: {count} codes")

    # Total keywords
    total_keywords = sum(len(record['keywords']) for record in data)
    avg_keywords = total_keywords / total_records if total_records > 0 else 0
    print(f"\nTotal keywords extracted: {total_keywords}")
    print(f"Average keywords per record: {avg_keywords:.1f}")

    # Sample record
    if data:
        print(f"\nSample record:")
        sample = data[0]
        print(f"  Code: {sample['code']}")
        print(f"  Description: {sample['description'][:80]}...")
        print(f"  Keywords: {', '.join(sample['keywords'][:5])}...")
        print(f"  Parent: {sample['parentCode']}")

    print("=" * 60)


def main():
    """
    Main execution function
    """
    print("\n" + "=" * 60)
    print("🚀 HS Code Data Processing Script")
    print("=" * 60)

    try:
        # Step 1: Read CSV
        df = read_csv(CSV_FILE)

        # Step 2: Structure data
        structured_data = structure_for_db(df)

        # Step 3: Generate summary
        generate_summary(structured_data)

        # Step 4: Save to JSON
        save_json(structured_data, OUTPUT_FILE)

        print("\n✅ SUCCESS! Data processing complete.")
        print(f"\n📝 Next steps:")
        print(f"   1. Review {OUTPUT_FILE}")
        print(f"   2. Import to database using: npm run prisma:seed")

    except FileNotFoundError as e:
        print(f"\n❌ ERROR: {e}")
        print(f"   Please create {CSV_FILE} first with your classified products.")
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
