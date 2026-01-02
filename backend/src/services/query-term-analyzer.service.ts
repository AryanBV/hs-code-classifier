// backend/src/services/query-term-analyzer.service.ts
// Analyzes query terms and categorizes them for HS code classification
// Based on HS classification hierarchy: Product > Variety > Processing > Material > Packaging

import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface TermAnalysis {
  // Original query
  originalQuery: string;

  // Categorized terms
  productTerms: string[];      // What IS it (coffee, beans, cases, rice)
  varietyTerms: string[];      // What TYPE (arabica, basmati, iPhone)
  processingTerms: string[];   // What STATE (roasted, dried, frozen)
  materialTerms: string[];     // What it's MADE OF (silicone, cotton, leather)
  packagingTerms: string[];    // SIZE/PACKAGING (1kg, bags, boxes)
  descriptiveTerms: string[];  // Adjectives that don't fit above (premium, quality)
  unknownTerms: string[];      // Unrecognized terms

  // Derived queries
  primaryQuery: string;        // Product + Variety + Processing (for chapter search)
  fullQueryWithoutPackaging: string;  // Everything except packaging

  // Analysis metadata
  hasPackaging: boolean;
  hasMaterial: boolean;
  confidence: number;          // How confident we are in the analysis
}

export interface CompoundTerm {
  phrase: string;
  category: 'product' | 'variety' | 'processing' | 'material' | 'packaging';
  priority: number;  // Higher = check first
}

// ═══════════════════════════════════════════════════════════════════════════
// TERM DICTIONARIES
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// COMPOUND TERMS (Check these FIRST - multi-word phrases)
// ─────────────────────────────────────────────────────────────────────────────

const COMPOUND_TERMS: CompoundTerm[] = [
  // Product compounds
  { phrase: 'coffee beans', category: 'product', priority: 10 },
  { phrase: 'tea leaves', category: 'product', priority: 10 },
  { phrase: 'rice grains', category: 'product', priority: 10 },
  { phrase: 'phone cases', category: 'product', priority: 10 },
  { phrase: 'phone covers', category: 'product', priority: 10 },
  { phrase: 'mobile cases', category: 'product', priority: 10 },
  { phrase: 'mobile covers', category: 'product', priority: 10 },
  { phrase: 'light bulbs', category: 'product', priority: 10 },
  { phrase: 'led bulbs', category: 'product', priority: 10 },
  { phrase: 'bed sheets', category: 'product', priority: 10 },
  { phrase: 'bed linen', category: 'product', priority: 10 },
  { phrase: 't-shirts', category: 'product', priority: 10 },
  { phrase: 't shirts', category: 'product', priority: 10 },
  { phrase: 'tshirts', category: 'product', priority: 10 },
  { phrase: 'dining table', category: 'product', priority: 10 },
  { phrase: 'dining chair', category: 'product', priority: 10 },
  { phrase: 'office chair', category: 'product', priority: 10 },
  { phrase: 'brake pads', category: 'product', priority: 10 },
  { phrase: 'car parts', category: 'product', priority: 10 },
  { phrase: 'auto parts', category: 'product', priority: 10 },
  { phrase: 'spare parts', category: 'product', priority: 10 },
  { phrase: 'machine parts', category: 'product', priority: 10 },

  // Variety compounds
  { phrase: 'green tea', category: 'variety', priority: 9 },
  { phrase: 'black tea', category: 'variety', priority: 9 },
  { phrase: 'oolong tea', category: 'variety', priority: 9 },
  { phrase: 'sona masoori', category: 'variety', priority: 9 },
  { phrase: 'mango wood', category: 'variety', priority: 9 },

  // Processing compounds
  { phrase: 'hand knitted', category: 'processing', priority: 8 },
  { phrase: 'hand woven', category: 'processing', priority: 8 },
  { phrase: 'machine made', category: 'processing', priority: 8 },
  { phrase: 'hand made', category: 'processing', priority: 8 },
  { phrase: 'freeze dried', category: 'processing', priority: 8 },
  { phrase: 'sun dried', category: 'processing', priority: 8 },
  { phrase: 'air dried', category: 'processing', priority: 8 },

  // Material compounds
  { phrase: 'stainless steel', category: 'material', priority: 8 },
  { phrase: 'genuine leather', category: 'material', priority: 8 },
  { phrase: 'faux leather', category: 'material', priority: 8 },
  { phrase: 'synthetic leather', category: 'material', priority: 8 },
  { phrase: 'carbon fiber', category: 'material', priority: 8 },
  { phrase: 'carbon fibre', category: 'material', priority: 8 },

  // Packaging compounds
  { phrase: 'bulk packing', category: 'packaging', priority: 7 },
  { phrase: 'retail packing', category: 'packaging', priority: 7 },
  { phrase: 'gift box', category: 'packaging', priority: 7 },
  { phrase: 'gift set', category: 'packaging', priority: 7 },
];

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE-WORD PRODUCT TERMS (What IS it)
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCT_TERMS = new Set([
  // Beverages & Food
  'coffee', 'tea', 'rice', 'wheat', 'flour', 'sugar', 'salt', 'spices',
  'beans', 'lentils', 'pulses', 'cereals', 'grains', 'seeds', 'nuts',
  'fruits', 'vegetables', 'meat', 'fish', 'seafood', 'poultry', 'eggs',
  'milk', 'cheese', 'butter', 'oil', 'ghee', 'honey', 'jaggery',
  'pickles', 'sauce', 'paste', 'powder', 'flakes', 'noodles', 'pasta',

  // Textiles & Apparel
  'shirts', 'pants', 'trousers', 'jeans', 'dresses', 'skirts', 'sarees',
  'kurtas', 'tops', 'blouses', 'jackets', 'coats', 'sweaters', 'hoodies',
  'clothes', 'clothing', 'garments', 'apparel', 'wear', 'outfits',
  'socks', 'underwear', 'lingerie', 'sleepwear', 'pajamas', 'robes',
  'scarves', 'shawls', 'stoles', 'dupattas', 'ties', 'belts', 'caps',
  'hats', 'gloves', 'mittens', 'shoes', 'sandals', 'boots', 'slippers',
  'fabrics', 'textiles', 'cloth', 'yarn', 'thread', 'lace', 'ribbon',
  'bedsheets', 'blankets', 'quilts', 'pillows', 'cushions', 'curtains',
  'towels', 'napkins', 'tablecloths', 'carpets', 'rugs', 'mats',

  // Electronics & Electrical
  'phones', 'mobiles', 'smartphones', 'tablets', 'laptops', 'computers',
  'monitors', 'keyboards', 'mice', 'speakers', 'headphones', 'earphones',
  'chargers', 'cables', 'adapters', 'batteries', 'power', 'inverters',
  'bulbs', 'lamps', 'lights', 'tubes', 'fixtures', 'switches', 'sockets',
  'fans', 'heaters', 'coolers', 'conditioners', 'refrigerators', 'freezers',
  'washers', 'dryers', 'dishwashers', 'ovens', 'microwaves', 'mixers',
  'grinders', 'blenders', 'toasters', 'kettles', 'irons', 'vacuums',
  'televisions', 'tvs', 'cameras', 'projectors', 'printers', 'scanners',

  // Cases & Containers (note: 'bags', 'boxes' moved to PACKAGING_TERMS)
  'cases', 'covers', 'sleeves', 'pouches', 'wallets', 'purses', 'handbags',
  'backpacks', 'luggage', 'suitcases', 'briefcases', 'totes',
  'containers', 'jars', 'bottles', 'cans', 'tins', 'drums',

  // Furniture
  'tables', 'chairs', 'desks', 'beds', 'sofas', 'couches', 'benches',
  'cabinets', 'wardrobes', 'shelves', 'racks', 'stands', 'drawers',
  'furniture', 'mattresses', 'frames', 'mirrors', 'lamps',

  // Automotive
  'vehicles', 'cars', 'trucks', 'buses', 'motorcycles', 'scooters', 'bikes',
  'engines', 'motors', 'pumps', 'compressors', 'generators', 'alternators',
  'brakes', 'clutches', 'gears', 'bearings', 'pistons', 'valves', 'filters',
  'tires', 'tyres', 'wheels', 'rims', 'axles', 'shafts', 'springs',
  'lights', 'mirrors', 'wipers', 'horns', 'seats', 'dashboards',

  // Machinery & Tools
  'machines', 'equipment', 'tools', 'instruments', 'devices', 'apparatus',
  'drills', 'saws', 'hammers', 'wrenches', 'pliers', 'screwdrivers',
  'molds', 'moulds', 'dies', 'jigs', 'fixtures', 'gauges', 'meters',

  // Chemicals & Materials
  'chemicals', 'acids', 'alkalis', 'solvents', 'reagents', 'catalysts',
  'dyes', 'pigments', 'paints', 'coatings', 'adhesives', 'sealants',
  'fertilizers', 'pesticides', 'insecticides', 'herbicides', 'fungicides',
  'medicines', 'drugs', 'pharmaceuticals', 'tablets', 'capsules', 'syrups',
  'cosmetics', 'perfumes', 'lotions', 'creams', 'shampoos', 'soaps',

  // Jewelry & Precious
  'jewelry', 'jewellery', 'ornaments', 'rings', 'earrings', 'necklaces',
  'bracelets', 'bangles', 'chains', 'pendants', 'brooches', 'watches',
  'gems', 'stones', 'diamonds', 'pearls', 'gold', 'silver', 'platinum',

  // Paper & Stationery
  'paper', 'cardboard', 'cartons', 'notebooks', 'books', 'magazines',
  'envelopes', 'labels', 'stickers', 'pens', 'pencils', 'markers',

  // Miscellaneous
  'toys', 'games', 'sports', 'handicrafts', 'artworks', 'antiques',
  'gifts', 'souvenirs', 'decorations', 'ornaments', 'figurines', 'statues',

  // Kitchen items
  'utensils', 'cookware', 'cutlery', 'crockery', 'dinnerware', 'glassware',
]);

// ─────────────────────────────────────────────────────────────────────────────
// VARIETY/TYPE TERMS (What TYPE of product)
// ─────────────────────────────────────────────────────────────────────────────

const VARIETY_TERMS = new Set([
  // Coffee varieties
  'arabica', 'robusta', 'liberica', 'excelsa',

  // Tea varieties
  'darjeeling', 'assam', 'nilgiri', 'oolong', 'matcha', 'chamomile',
  'earl', 'grey', 'jasmine', 'peppermint', 'herbal',

  // Rice varieties
  'basmati', 'jasmine', 'ponni', 'kolam', 'sona', 'masoori', 'gobindobhog',
  'samba', 'idli', 'parboiled', 'brown', 'white', 'wild', 'sticky',

  // Fruit varieties
  'alphonso', 'kesar', 'langra', 'dasheri', 'totapuri', 'banganapalli',
  'ratnagiri', 'devgad', 'hapus', 'safeda', 'chausa', 'himsagar',

  // Spice varieties
  'kashmiri', 'guntur', 'byadgi', 'malabar', 'tellicherry', 'mundu',

  // Textile varieties
  'khadi', 'chanderi', 'banarasi', 'kanchipuram', 'paithani', 'pochampally',
  'ikat', 'bandhani', 'kalamkari', 'chikankari', 'phulkari', 'kashmiri',

  // Wood varieties
  'teak', 'rosewood', 'sandalwood', 'sheesham', 'oak', 'mahogany',
  'walnut', 'pine', 'cedar', 'bamboo', 'rattan', 'cane', 'wicker',

  // Brand names (often indicate type)
  'iphone', 'samsung', 'apple', 'sony', 'lg', 'panasonic', 'philips',
  'nike', 'adidas', 'puma', 'reebok', 'gucci', 'prada', 'armani',
  'toyota', 'honda', 'bmw', 'mercedes', 'audi', 'volkswagen',
  'tata', 'mahindra', 'maruti', 'bajaj', 'hero', 'tvs',

  // Apparel types
  'mens', 'womens', 'kids', 'boys', 'girls', 'unisex', 'infant', 'baby',
  'casual', 'formal', 'sports', 'athletic', 'ethnic', 'western', 'traditional',

  // Size/Fit types
  'slim', 'regular', 'loose', 'fitted', 'oversized', 'petite', 'plus',

  // Additional variety terms
  'woolen', 'wool', 'corolla', 'kitchen',

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 7.4.3: Electronic/Technology variety terms
  // ═══════════════════════════════════════════════════════════════════════════
  'led', 'lcd', 'oled', 'amoled', 'crt', 'plasma',
  'bluetooth', 'wifi', 'wireless', 'wired', 'usb', 'hdmi', 'ethernet',
  'smart', 'digital', 'analog', 'analogue', 'automatic', 'manual',
  'rechargeable', 'disposable', 'portable', 'stationary',
  'household', 'industrial', 'commercial', 'residential',
  'indoor', 'outdoor', 'waterproof', 'dustproof',
]);

// ─────────────────────────────────────────────────────────────────────────────
// PROCESSING/STATE TERMS (What STATE is it in)
// ─────────────────────────────────────────────────────────────────────────────

const PROCESSING_TERMS = new Set([
  // Heat processing
  'roasted', 'unroasted', 'baked', 'fried', 'grilled', 'steamed', 'boiled',
  'cooked', 'uncooked', 'raw', 'heated', 'cooled', 'chilled', 'frozen',

  // Drying/Moisture
  'dried', 'dehydrated', 'fresh', 'wet', 'moist', 'damp', 'cured',
  'smoked', 'pickled', 'preserved', 'salted', 'brined', 'marinated',

  // Physical processing
  'ground', 'crushed', 'powdered', 'granulated', 'flaked', 'sliced',
  'chopped', 'diced', 'minced', 'shredded', 'grated', 'milled', 'hulled',
  'polished', 'unpolished', 'refined', 'unrefined', 'processed', 'unprocessed',
  'peeled', 'unpeeled', 'shelled', 'deshelled', 'husked', 'dehusked',
  'bleached', 'unbleached', 'treated', 'untreated', 'purified', 'filtered',

  // Chemical processing
  'decaffeinated', 'caffeinated', 'fermented', 'unfermented', 'distilled',
  'concentrated', 'diluted', 'enriched', 'fortified', 'iodized', 'fluoridated',

  // Textile processing
  'woven', 'knitted', 'crocheted', 'embroidered', 'printed', 'dyed',
  'undyed', 'bleached', 'mercerized', 'sanforized', 'preshrunk', 'stonewashed',
  'handmade', 'handcrafted', 'machine', 'automated', 'assembled',

  // Quality/Certification
  'organic', 'natural', 'synthetic', 'artificial', 'pure', 'mixed', 'blended',
  'certified', 'verified', 'tested', 'approved', 'graded', 'sorted', 'selected',

  // Packaging state
  'packed', 'unpacked', 'sealed', 'unsealed', 'wrapped', 'unwrapped',
  'bottled', 'canned', 'jarred', 'vacuum', 'airtight', 'nitrogen',

  // Additional processing terms
  'cold', 'pressed', 'virgin',

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 7.4.3: Electronic processing states
  // ═══════════════════════════════════════════════════════════════════════════
  'assembled', 'unassembled', 'configured', 'programmed',
  'calibrated', 'tested', 'certified', 'refurbished', 'reconditioned',
]);

// ─────────────────────────────────────────────────────────────────────────────
// MATERIAL TERMS (What is it MADE OF)
// ─────────────────────────────────────────────────────────────────────────────

const MATERIAL_TERMS = new Set([
  // Textiles
  'cotton', 'silk', 'wool', 'linen', 'jute', 'hemp', 'coir', 'sisal',
  'polyester', 'nylon', 'rayon', 'viscose', 'acrylic', 'spandex', 'lycra',
  'velvet', 'satin', 'chiffon', 'georgette', 'crepe', 'organza', 'tulle',
  'denim', 'corduroy', 'tweed', 'flannel', 'fleece', 'terry', 'muslin',

  // Leather & Rubber
  'leather', 'suede', 'nubuck', 'patent', 'faux', 'vegan', 'pu', 'pvc',
  'rubber', 'latex', 'silicone', 'neoprene', 'foam', 'sponge',

  // Metals
  'steel', 'iron', 'aluminum', 'aluminium', 'copper', 'brass', 'bronze',
  'zinc', 'tin', 'nickel', 'chrome', 'titanium', 'tungsten', 'alloy',
  'gold', 'silver', 'platinum', 'palladium', 'rhodium',
  'metal', 'metallic', 'galvanized', 'anodized', 'plated', 'coated',

  // Plastics
  'plastic', 'polycarbonate', 'polypropylene', 'polyethylene', 'abs',
  'acrylic', 'perspex', 'plexiglass', 'fiberglass', 'fibreglass', 'resin',

  // Wood & Natural
  'wood', 'wooden', 'timber', 'plywood', 'mdf', 'particleboard', 'veneer',
  'bamboo', 'rattan', 'cane', 'wicker', 'cork', 'paper', 'cardboard',

  // Stone & Ceramic
  'stone', 'marble', 'granite', 'slate', 'sandstone', 'limestone', 'quartz',
  'ceramic', 'porcelain', 'terracotta', 'clay', 'earthenware', 'stoneware',
  'glass', 'crystal', 'tempered', 'laminated', 'toughened',

  // Composites
  'carbon', 'fiber', 'fibre', 'composite', 'laminate', 'hybrid',

  // Additional materials
  'coconut', 'brass',
]);

// ─────────────────────────────────────────────────────────────────────────────
// PACKAGING/SIZE TERMS (Usually IGNORE for chapter selection)
// ─────────────────────────────────────────────────────────────────────────────

const PACKAGING_TERMS = new Set([
  // Containers
  'bag', 'bags', 'sack', 'sacks', 'pouch', 'pouches', 'packet', 'packets',
  'box', 'boxes', 'carton', 'cartons', 'case', 'cases', 'crate', 'crates',
  'bottle', 'bottles', 'jar', 'jars', 'can', 'cans', 'tin', 'tins',
  'drum', 'drums', 'barrel', 'barrels', 'container', 'containers',
  'pack', 'packs', 'package', 'packages', 'bundle', 'bundles', 'bale', 'bales',
  'roll', 'rolls', 'coil', 'coils', 'sheet', 'sheets', 'strip', 'strips',

  // Size descriptors
  'small', 'medium', 'large', 'extra', 'xl', 'xxl', 'xxxl', 'xs', 'mini',
  'micro', 'nano', 'mega', 'jumbo', 'giant', 'king', 'queen', 'twin', 'single', 'double',

  // Size measurements (will also catch via regex)
  'size', 'sized', 'length', 'width', 'height', 'depth', 'diameter', 'thickness',

  // Quantity words
  'piece', 'pieces', 'pcs', 'unit', 'units', 'set', 'sets', 'pair', 'pairs',
  'dozen', 'gross', 'hundred', 'thousand', 'bulk', 'wholesale', 'retail',

  // Age-related sizing
  'months',
]);

// ─────────────────────────────────────────────────────────────────────────────
// DESCRIPTIVE TERMS (Adjectives that don't affect classification)
// ─────────────────────────────────────────────────────────────────────────────

const DESCRIPTIVE_TERMS = new Set([
  'premium', 'quality', 'best', 'finest', 'superior', 'excellent', 'good',
  'new', 'latest', 'modern', 'classic', 'traditional', 'vintage', 'antique',
  'beautiful', 'elegant', 'stylish', 'fashionable', 'trendy', 'popular',
  'durable', 'strong', 'sturdy', 'robust', 'heavy', 'light', 'lightweight',
  'soft', 'hard', 'smooth', 'rough', 'textured', 'plain', 'simple', 'fancy',
  'colorful', 'colourful', 'bright', 'dark', 'neutral', 'transparent', 'opaque',
  'cheap', 'affordable', 'expensive', 'luxury', 'budget', 'economy', 'value',
  'indian', 'imported', 'export', 'domestic', 'international', 'global',
  'authentic', 'original', 'genuine', 'real', 'true', 'actual', 'official',
  'custom', 'customized', 'personalized', 'bespoke', 'tailor', 'made',
  'special', 'limited', 'exclusive', 'rare', 'unique', 'one', 'only',
  'protective', 'safe', 'secure', 'reliable', 'trusted', 'certified',
  'decorative', 'items', 'finish', 'household', 'automotive',
]);

// ─────────────────────────────────────────────────────────────────────────────
// STOP WORDS (Ignore completely)
// ─────────────────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'for', 'with', 'without', 'from',
  'to', 'in', 'on', 'at', 'by', 'of', 'as', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
  'this', 'that', 'these', 'those', 'it', 'its', 'i', 'me', 'my', 'we', 'our',
  'you', 'your', 'he', 'she', 'they', 'them', 'their', 'who', 'which', 'what',
  'all', 'any', 'some', 'no', 'not', 'only', 'just', 'also', 'very', 'too',
  'use', 'used', 'using', 'use', 'uses',
]);

// ═══════════════════════════════════════════════════════════════════════════
// REGEX PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

// Matches measurements like "1kg", "500g", "100ml", "5l", "10mm", "42 size"
const MEASUREMENT_PATTERN = /\b(\d+(?:\.\d+)?)\s*(kg|g|lb|oz|ml|l|liter|litre|mm|cm|m|inch|inches|ft|feet|meter|meters|metre|metres|size|pcs|pieces|units?|w)\b/gi;

// Matches color words
const COLOR_PATTERN = /\b(red|blue|green|yellow|black|white|brown|grey|gray|pink|purple|orange|gold|silver|beige|navy|maroon|cream|ivory|turquoise|teal|coral|olive|burgundy|indigo|violet|magenta|cyan|tan|khaki|charcoal|multicolor|multicolour|multi)\b/gi;

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ANALYSIS FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyzes a product query and categorizes each term
 * @param query - The product description to analyze
 * @returns TermAnalysis object with categorized terms
 */
export function analyzeQueryTerms(query: string): TermAnalysis {
  const originalQuery = query;
  let workingQuery = query.toLowerCase().trim();

  // Initialize result
  const result: TermAnalysis = {
    originalQuery,
    productTerms: [],
    varietyTerms: [],
    processingTerms: [],
    materialTerms: [],
    packagingTerms: [],
    descriptiveTerms: [],
    unknownTerms: [],
    primaryQuery: '',
    fullQueryWithoutPackaging: '',
    hasPackaging: false,
    hasMaterial: false,
    confidence: 0,
  };

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1: Extract compound terms first (highest priority)
  // ─────────────────────────────────────────────────────────────────────────

  const sortedCompounds = [...COMPOUND_TERMS].sort((a, b) => b.priority - a.priority);

  for (const compound of sortedCompounds) {
    const escapedPhrase = compound.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedPhrase}\\b`, 'gi');
    const match = regex.exec(workingQuery);

    if (match) {
      const term = match[0].toLowerCase();

      switch (compound.category) {
        case 'product':
          result.productTerms.push(term);
          break;
        case 'variety':
          result.varietyTerms.push(term);
          break;
        case 'processing':
          result.processingTerms.push(term);
          break;
        case 'material':
          result.materialTerms.push(term);
          break;
        case 'packaging':
          result.packagingTerms.push(term);
          break;
      }

      // Remove from working query to avoid double-counting
      workingQuery = workingQuery.replace(regex, ' '.repeat(match[0].length));
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2: Extract measurements (definitely packaging)
  // ─────────────────────────────────────────────────────────────────────────

  let measurementMatch;
  const measurementRegex = new RegExp(MEASUREMENT_PATTERN.source, 'gi');

  while ((measurementMatch = measurementRegex.exec(workingQuery)) !== null) {
    result.packagingTerms.push(measurementMatch[0].toLowerCase());
    workingQuery = workingQuery.substring(0, measurementMatch.index) +
                   ' '.repeat(measurementMatch[0].length) +
                   workingQuery.substring(measurementMatch.index + measurementMatch[0].length);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3: Extract colors (descriptive)
  // ─────────────────────────────────────────────────────────────────────────

  let colorMatch;
  const colorRegex = new RegExp(COLOR_PATTERN.source, 'gi');

  while ((colorMatch = colorRegex.exec(workingQuery)) !== null) {
    result.descriptiveTerms.push(colorMatch[0].toLowerCase());
    workingQuery = workingQuery.substring(0, colorMatch.index) +
                   ' '.repeat(colorMatch[0].length) +
                   workingQuery.substring(colorMatch.index + colorMatch[0].length);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4: Tokenize remaining words and categorize
  // ─────────────────────────────────────────────────────────────────────────

  const words = workingQuery.split(/\s+/).filter(w => w.length > 1);

  for (const word of words) {
    const cleanWord = word.replace(/[^a-z0-9-]/g, '');

    if (!cleanWord || cleanWord.length < 2) continue;
    if (STOP_WORDS.has(cleanWord)) continue;

    // Check each category in priority order
    if (PRODUCT_TERMS.has(cleanWord)) {
      result.productTerms.push(cleanWord);
    } else if (VARIETY_TERMS.has(cleanWord)) {
      result.varietyTerms.push(cleanWord);
    } else if (PROCESSING_TERMS.has(cleanWord)) {
      result.processingTerms.push(cleanWord);
    } else if (MATERIAL_TERMS.has(cleanWord)) {
      result.materialTerms.push(cleanWord);
    } else if (PACKAGING_TERMS.has(cleanWord)) {
      result.packagingTerms.push(cleanWord);
    } else if (DESCRIPTIVE_TERMS.has(cleanWord)) {
      result.descriptiveTerms.push(cleanWord);
    } else if (/^\d+$/.test(cleanWord)) {
      // Standalone numbers are likely quantities
      result.packagingTerms.push(cleanWord);
    } else {
      result.unknownTerms.push(cleanWord);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 5: Build derived queries
  // ─────────────────────────────────────────────────────────────────────────

  // Primary query: Product + Variety + Processing (for chapter identification)
  const primaryParts = [
    ...result.varietyTerms,      // Variety first (arabica, basmati)
    ...result.productTerms,      // Then product (coffee, rice)
    ...result.processingTerms,   // Then processing (roasted, dried)
  ];
  result.primaryQuery = primaryParts.join(' ').trim();

  // Full query without packaging
  const fullParts = [
    ...result.varietyTerms,
    ...result.productTerms,
    ...result.processingTerms,
    ...result.materialTerms,
    ...result.descriptiveTerms,
  ];
  result.fullQueryWithoutPackaging = fullParts.join(' ').trim();

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 6: Set metadata
  // ─────────────────────────────────────────────────────────────────────────

  result.hasPackaging = result.packagingTerms.length > 0;
  result.hasMaterial = result.materialTerms.length > 0;

  // Calculate confidence based on how many terms we recognized
  const totalTerms = words.length;
  const recognizedTerms = totalTerms - result.unknownTerms.length;
  result.confidence = totalTerms > 0 ? recognizedTerms / totalTerms : 0;

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING UTILITY
// ═══════════════════════════════════════════════════════════════════════════

export function logTermAnalysis(analysis: TermAnalysis): void {
  logger.info(`[TERM-ANALYZER] Query: "${analysis.originalQuery}"`);
  logger.info(`[TERM-ANALYZER] Product terms: [${analysis.productTerms.join(', ')}]`);
  logger.info(`[TERM-ANALYZER] Variety terms: [${analysis.varietyTerms.join(', ')}]`);
  logger.info(`[TERM-ANALYZER] Processing terms: [${analysis.processingTerms.join(', ')}]`);
  logger.info(`[TERM-ANALYZER] Material terms: [${analysis.materialTerms.join(', ')}]`);
  logger.info(`[TERM-ANALYZER] Packaging terms: [${analysis.packagingTerms.join(', ')}]`);
  logger.info(`[TERM-ANALYZER] Descriptive terms: [${analysis.descriptiveTerms.join(', ')}]`);
  logger.info(`[TERM-ANALYZER] Unknown terms: [${analysis.unknownTerms.join(', ')}]`);
  logger.info(`[TERM-ANALYZER] Primary query: "${analysis.primaryQuery}"`);
  logger.info(`[TERM-ANALYZER] Full (no packaging): "${analysis.fullQueryWithoutPackaging}"`);
  logger.info(`[TERM-ANALYZER] Confidence: ${(analysis.confidence * 100).toFixed(0)}%`);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  COMPOUND_TERMS,
  PRODUCT_TERMS,
  VARIETY_TERMS,
  PROCESSING_TERMS,
  MATERIAL_TERMS,
  PACKAGING_TERMS,
  DESCRIPTIVE_TERMS,
  STOP_WORDS,
};
