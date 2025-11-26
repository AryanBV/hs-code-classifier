# HS Code Data Extraction Pipeline

Phase 1 implementation of the HS Code Classifier data extraction system.

## Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Set OpenAI API Key (Optional - for embeddings)
```bash
# Linux/Mac
export OPENAI_API_KEY="your-api-key-here"

# Windows
set OPENAI_API_KEY=your-api-key-here
```

### 3. Run the Pipeline
```bash
# Run complete pipeline
python extraction_pipeline.py

# Or run scraper only
python scraper.py
```

## What It Does

### Scraper (`scraper.py`)
Extracts all 14,000+ Indian HS codes from ICEGATE website:
- **ICEGATEScraper**: Base scraper with hierarchical extraction
- **RobustScraper**: Production scraper with retry logic and checkpointing

### Pipeline (`extraction_pipeline.py`)
Complete 6-step data processing pipeline:
1. **Extract** - Scrape codes from ICEGATE
2. **Clean** - Normalize and validate data
3. **Synonyms** - Generate terminology mappings
4. **Embeddings** - Create vector representations
5. **Store** - Save to database (placeholder)
6. **Export** - Output clean datasets

## Output Files

```
data/extracted/
├── hs_codes_raw.json          # Raw scraped data
├── hs_codes_clean.json        # Cleaned dataset
├── synonyms.csv               # Synonym mappings
├── embeddings.npy             # Vector embeddings
└── scraping_checkpoint.json   # Resume checkpoint
```

## Features

✅ **Error Resilient** - Automatic retries and checkpointing  
✅ **Rate Limited** - Respects server constraints  
✅ **Validated** - Data quality checks at each step  
✅ **Modular** - Reusable components  
✅ **Async Ready** - Built for scalability  

## Resume on Failure

If scraping fails, the system automatically resumes from the last completed chapter:
```bash
python extraction_pipeline.py
# Automatically skips completed chapters
```

## Documentation

For detailed information, see:
- [Walkthrough](../../../.gemini/antigravity/brain/203d1c6a-f11d-4b66-8620-663fd125429b/walkthrough.md)
- [HS-CODE-EXTRACTION-GUIDE.md](../../docs/HS-CODE-EXTRACTION-GUIDE.md)
- [PROJECT-SPEC-V3.md](../../docs/PROJECT-SPEC-V3.md)

## Cost

- **Scraping**: Free
- **Embeddings**: ~$0.28 one-time (14,000 codes × $0.00002/call)
- **Total**: ~$0.28

## Support

This implements Phase 1 (Data Foundation) of the HS Code Classifier project.
