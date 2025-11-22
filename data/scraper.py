import pandas as pd
import json
import re
from pathlib import Path

def validate_hs_code(code: str) -> bool:
    """
    Validate HS code format (4-10 digits, with optional dots)
    Valid formats: 8708, 87083000, 8708.30, 8708.30.10
    """
    if not code:
        return False
    
    # Strip whitespace, tabs, and any non-visible characters
    code = str(code).strip()
    
    if not code:
        return False
    
    # Remove dots and check if remaining is all digits
    code_digits = code.replace('.', '')
    if not code_digits.isdigit():
        return False
    
    # Check length (HS codes are 4-10 digits)
    if len(code_digits) < 4 or len(code_digits) > 10:
        return False
    
    return True


def format_hs_code(code: str) -> str:
    """
    Format HS code consistently (add dots: 8708.30.10)
    """
    # Strip and remove existing dots
    code = str(code).strip().replace('.', '')
    
    # Format based on length
    if len(code) == 4:
        return code  # Chapter level: 8708
    elif len(code) == 6:
        return f"{code[:4]}.{code[4:]}"  # 8708.30
    elif len(code) >= 8:
        return f"{code[:4]}.{code[4:6]}.{code[6:]}"  # 8708.30.10
    else:
        return code


def parse_hs_code(code: str) -> dict:
    """
    Parse HS code into chapter, heading, subheading components
    """
    code_clean = code.replace('.', '').strip()
    
    return {
        'chapter': code_clean[:2],
        'heading': code_clean[:4],
        'subheading': code_clean[:6] if len(code_clean) >= 6 else code_clean[:4]
    }


def extract_keywords(text: str) -> list:
    """
    Extract keywords from text (remove stopwords, numbers, short words)
    """
    if not text or pd.isna(text):
        return []
    
    # Convert to lowercase
    text = str(text).lower()
    
    # Remove special characters but keep spaces
    text = re.sub(r'[^a-z0-9\s]', ' ', text)
    
    # Split into words
    words = text.split()
    
    # Common stopwords to remove
    stopwords = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
        'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that',
        'these', 'those', 'it', 'its', 'mm', 'cm', 'kg', 'gm', 'ml', 'liter'
    }
    
    # Filter out stopwords, numbers, and short words
    keywords = [
        word for word in words 
        if len(word) > 2 and word not in stopwords and not word.isdigit()
    ]
    
    # Remove duplicates while preserving order
    seen = set()
    unique_keywords = []
    for word in keywords:
        if word not in seen:
            seen.add(word)
            unique_keywords.append(word)
    
    return unique_keywords[:20]  # Limit to top 20 keywords


def structure_for_db(row: pd.Series) -> dict:
    """
    Structure a row for database import
    """
    hs_code = str(row.get('HS Code (To Find)', '')).strip()
    
    # Validate HS code
    if not validate_hs_code(hs_code):
        return None
    
    # Format HS code
    formatted_code = format_hs_code(hs_code)
    parsed = parse_hs_code(hs_code)
    
    # Extract keywords from description
    description = str(row.get('Detailed Description', ''))
    product_name = str(row.get('Product Name', ''))
    material = str(row.get('Material Composition', ''))
    function = str(row.get('Primary Function', ''))
    
    # Combine all text for keyword extraction
    full_text = f"{product_name} {description} {material} {function}"
    keywords = extract_keywords(full_text)
    
    # Structure the record
    return {
        'code': formatted_code,
        'chapter': parsed['chapter'],
        'heading': parsed['heading'],
        'subheading': parsed['subheading'],
        'country_code': 'IN',  # India
        'description': description if description != 'nan' else '',
        'keywords': keywords,
        'common_products': [product_name] if product_name != 'nan' else [],
        'parent_code': None,  # Will be filled later based on hierarchy
        'metadata': {
            'material_composition': material if material != 'nan' else '',
            'product_type': str(row.get('Product Type', '')),
            'primary_function': function if function != 'nan' else '',
            'classification_notes': str(row.get('Classification Notes', ''))
        }
    }


def main():
    print("=" * 60)
    print("HS Code Data Processing Script (Fixed Version)")
    print("=" * 60)
    
    # Get current directory
    script_dir = Path(__file__).parent
    csv_path = script_dir / 'test_dataset.csv'
    output_path = script_dir / 'hs_codes_seed.json'
    
    # Read CSV
    print(f"Reading CSV from: {csv_path}")
    try:
        df = pd.read_csv(csv_path, encoding='utf-8-sig')  # Handle BOM
    except:
        df = pd.read_csv(csv_path, encoding='latin-1')
    
    print(f"Loaded {len(df)} rows")
    print(f"Columns: {', '.join(df.columns)}")

    # Process each row
    print(f"\nStructuring {len(df)} records for database import...")
    records = []
    skipped = 0
    
    for idx, row in df.iterrows():
        record = structure_for_db(row)
        if record:
            records.append(record)
            print(f"OK Row {idx + 1}: {record['code']} - {row['Product Name'][:40]}")
        else:
            hs_code = str(row.get('HS Code (To Find)', '')).strip()
            print(f"SKIP Row {idx + 1}: Invalid HS code '{hs_code}' - skipping")
            skipped += 1

    print(f"\nStructured {len(records)} records")
    if skipped > 0:
        print(f"WARNING: Skipped {skipped} records due to validation errors")

    # Statistics
    print("\n" + "=" * 60)
    print("SUMMARY STATISTICS")
    print("=" * 60)
    print(f"Total records: {len(records)}")
    
    # Group by chapter
    chapters = {}
    for record in records:
        chapter = record['chapter']
        chapters[chapter] = chapters.get(chapter, 0) + 1
    
    print(f"Records by chapter:")
    for chapter, count in sorted(chapters.items()):
        print(f"  Chapter {chapter}: {count} records")
    
    # Keyword statistics
    total_keywords = sum(len(r['keywords']) for r in records)
    print(f"Total keywords extracted: {total_keywords}")
    print(f"Average keywords per record: {total_keywords / len(records) if records else 0:.1f}")
    
    # Save to JSON
    print("\n" + "=" * 60)
    print(f"Saving to: {output_path}")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(records, f, indent=2, ensure_ascii=False)

    file_size = output_path.stat().st_size / 1024  # KB
    print(f"Saved {len(records)} records to {output_path}")
    print(f"File size: {file_size:.2f} KB")

    print("\nSUCCESS! Data processing complete.")
    print("\nNext steps:")
    print(f"   1. Review {output_path}")
    print("   2. Import to database using: npm run prisma:seed")
    print()


if __name__ == '__main__':
    main()