// backend/src/rules/chapter-rules.ts

import { ExtractedAttributes, ChapterRule } from '../classifier/types';

/**
 * CHAPTER ROUTING RULES
 *
 * These rules encode legal classification principles:
 * - General Interpretive Rules (GIRs)
 * - Chapter Notes
 * - Section Notes
 *
 * Rules are checked in PRIORITY ORDER (highest first).
 * First matching rule wins.
 */
export const CHAPTER_RULES: ChapterRule[] = [

  // ==========================================
  // EXCEPTIONS TO FUNCTION-OVER-MATERIAL (Highest Priority)
  // Products with their OWN specific headings that override GIR 2a
  // ==========================================

  {
    id: 'filters_machinery',
    name: 'Filters -> Ch.84',
    description: 'Filtering machinery has specific heading 8421, not vehicle parts',
    condition: (attrs) => {
      const query = [attrs.function, attrs.form, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      return /\b(filter|filtering)\b/.test(query) &&
             /\b(oil|air|fuel|water|engine|diesel|truck)\b/.test(query);
    },
    chapter: '84',
    priority: 103,
    legal_basis: 'Heading 8421: Filtering or purifying machinery. Filters have their own specific heading regardless of vehicle use.'
  },

  {
    id: 'batteries_accumulators',
    name: 'Batteries/Accumulators -> Ch.85',
    description: 'Electric accumulators have specific heading 8507, not vehicle parts',
    condition: (attrs) => {
      const query = [attrs.function, attrs.form, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      return /\b(battery|batteries|accumulator|lead.acid|lithium)\b/.test(query) &&
             !query.includes('charger');
    },
    chapter: '85',
    priority: 102,
    legal_basis: 'Heading 8507: Electric accumulators. Batteries have their own specific heading regardless of vehicle use.'
  },

  {
    id: 'tyres_rubber',
    name: 'Tyres/Tires -> Ch.40',
    description: 'Pneumatic tyres have specific heading 4011, not vehicle parts',
    condition: (attrs) => {
      const query = [attrs.form, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      return /\b(tyre|tire|tyres|tires|pneumatic)\b/.test(query);
    },
    chapter: '40',
    priority: 101,
    legal_basis: 'Heading 4011: New pneumatic tyres of rubber. Tyres have their own specific heading regardless of vehicle use.'
  },

  // ==========================================
  // FUNCTION OVER MATERIAL (High Priority)
  // ==========================================

  {
    id: 'vehicle_parts_function',
    name: 'Vehicle Parts by Function',
    description: 'Parts for motor vehicles classified by function, not material',
    condition: (attrs) => {
      const functionKeywords = ['vehicle', 'car', 'truck', 'automobile', 'motor vehicle',
                                'automotive', 'brake', 'suspension', 'steering', 'transmission',
                                'clutch', 'axle', 'wheel', 'bumper', 'dashboard', 'radiator',
                                'exhaust', 'muffler', 'fuel tank', 'fender'];
      const useKeywords = ['vehicle', 'car', 'truck', 'automobile', 'motor', 'automotive'];

      const query = [attrs.function, attrs.form, attrs.intended_use, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();

      // Don't match if it's clearly a spice or food item
      const notFood = !['pepper', 'cardamom', 'turmeric', 'cinnamon', 'clove', 'cumin',
                        'coriander', 'nutmeg', 'saffron', 'vanilla', 'ginger', 'coffee',
                        'tea', 'wheat', 'rice', 'seeds']
        .some(kw => query.includes(kw));

      return (functionKeywords.some(kw => query.includes(kw)) ||
             useKeywords.some(kw => attrs.intended_use?.toLowerCase().includes(kw))) && notFood;
    },
    chapter: '87',
    priority: 100,
    legal_basis: 'Chapter 87 Note 2: Parts and accessories of motor vehicles are classified in Chapter 87 regardless of material composition.'
  },

  {
    id: 'aircraft_parts',
    name: 'Aircraft Parts by Function',
    description: 'Parts for aircraft classified by function',
    condition: (attrs) => {
      const keywords = ['aircraft', 'airplane', 'aeroplane', 'aviation', 'helicopter',
                        'jet', 'propeller', 'landing gear', 'fuselage'];
      const query = [attrs.intended_use, attrs.function, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      return keywords.some(kw => query.includes(kw));
    },
    chapter: '88',
    priority: 99,
    legal_basis: 'Chapter 88: Aircraft and spacecraft parts by function.'
  },

  {
    id: 'railway_parts',
    name: 'Railway Parts by Function',
    description: 'Parts for railway/tramway classified by function',
    condition: (attrs) => {
      const keywords = ['railway', 'railroad', 'train', 'locomotive', 'tramway',
                        'metro', 'rail track', 'wagon', 'coach'];
      const query = [attrs.intended_use, attrs.function, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      return keywords.some(kw => query.includes(kw));
    },
    chapter: '86',
    priority: 98,
    legal_basis: 'Chapter 86: Railway or tramway parts by function.'
  },

  {
    id: 'optical_instruments',
    name: 'Optical Instruments Over Material',
    description: 'Optical instruments by function, not material (glass)',
    condition: (attrs) => {
      const keywords = ['optical', 'lens', 'microscope', 'telescope', 'binocular',
                        'spectacle', 'eyeglass', 'camera lens', 'magnifying glass',
                        'prism', 'mirror optical'];
      const query = [attrs.function, attrs.form, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      return keywords.some(kw => query.includes(kw));
    },
    chapter: '90',
    priority: 97,
    legal_basis: 'Chapter 90: Optical instruments regardless of material (not glass articles Ch.70).'
  },

  {
    id: 'medical_instruments',
    name: 'Medical/Surgical Instruments',
    description: 'Medical instruments by function',
    condition: (attrs) => {
      const keywords = ['surgical', 'dental', 'veterinary', 'diagnostic',
                        'prosthetic', 'orthopedic', 'stethoscope',
                        'syringe', 'scalpel', 'forceps', 'x-ray', 'mri', 'ct scan',
                        'ultrasound', 'endoscope'];
      const query = [attrs.function, attrs.intended_use, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      // Don't match medicaments (tablets, capsules, drugs)
      const notMedicament = !['tablet', 'capsule', 'pill', 'paracetamol', 'amoxicillin',
                               'aspirin', 'ibuprofen', 'medicine', 'drug', 'antibiotic']
        .some(kw => query.includes(kw));
      return keywords.some(kw => query.includes(kw)) && notMedicament;
    },
    chapter: '90',
    priority: 91,  // Lower than medicaments (92)
    legal_basis: 'Chapter 90: Medical and surgical instruments.'
  },

  // ==========================================
  // PROCESSING STATE RULES
  // ==========================================

  {
    id: 'instant_coffee',
    name: 'Instant/Soluble Coffee -> Ch.21',
    description: 'Processed coffee extracts go to Chapter 21',
    condition: (attrs) => {
      const query = [attrs.material, attrs.form, attrs.processing_state, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      const isCoffee = query.includes('coffee');
      const isProcessed = ['instant', 'soluble', 'extract', 'concentrate', 'freeze-dried']
        .some(kw => query.includes(kw));
      return isCoffee && isProcessed;
    },
    chapter: '21',
    priority: 90,
    legal_basis: 'Chapter 21: Coffee extracts and concentrates. Raw/roasted coffee is Chapter 09.'
  },

  {
    id: 'raw_coffee',
    name: 'Raw/Roasted Coffee -> Ch.09',
    description: 'Unprocessed coffee goes to Chapter 09',
    condition: (attrs) => {
      const query = [attrs.material, attrs.form, attrs.processing_state, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      const isCoffee = query.includes('coffee');
      const isRaw = ['bean', 'raw', 'roasted', 'green', 'ground', 'whole', 'arabica', 'robusta']
        .some(kw => query.includes(kw));
      const notInstant = !['instant', 'soluble', 'extract'].some(kw => query.includes(kw));
      return isCoffee && (isRaw || notInstant);
    },
    chapter: '09',
    priority: 89,
    legal_basis: 'Chapter 09: Coffee not further processed than roasting.'
  },

  {
    id: 'medicaments_dosage',
    name: 'Medicaments in Dosage Form -> Ch.30',
    description: 'Pharmaceuticals in measured doses',
    condition: (attrs) => {
      const query = [attrs.form, attrs.function, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      const dosageKeywords = ['tablet', 'capsule', 'pill', 'ampoule', 'syrup',
                              'injection', 'medicament', 'medicine', 'pharmaceutical',
                              'drug', 'dosage', 'dose', 'ointment', 'cream medicinal',
                              // Common drug names
                              'paracetamol', 'amoxicillin', 'aspirin', 'ibuprofen',
                              'metformin', 'omeprazole', 'antibiotic', 'analgesic',
                              'antipyretic', 'antacid', 'vitamin'];
      return dosageKeywords.some(kw => query.includes(kw));
    },
    chapter: '30',
    priority: 92,  // Higher priority to catch pharmaceuticals
    legal_basis: 'Chapter 30: Medicaments in measured doses or retail packing.'
  },

  {
    id: 'raw_chemicals',
    name: 'Raw Chemicals -> Ch.28/29',
    description: 'Chemical compounds not in dosage form',
    condition: (attrs) => {
      const query = [attrs.material, attrs.form, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      const chemicalKeywords = ['chemical', 'compound', 'acid', 'oxide', 'hydroxide',
                                'chloride', 'sulfate', 'carbonate', 'reagent', 'laboratory',
                                'organic compound', 'inorganic'];
      const isChemical = chemicalKeywords.some(kw => query.includes(kw));
      const notMedicament = !['tablet', 'capsule', 'medicine', 'drug']
        .some(kw => query.includes(kw));
      return isChemical && notMedicament;
    },
    chapter: '29',  // LLM will distinguish 28 vs 29
    priority: 87,
    legal_basis: 'Chapters 28-29: Chemical products not as medicaments.'
  },

  // ==========================================
  // RAW vs FINISHED GOODS
  // ==========================================

  {
    id: 'raw_cement',
    name: 'Raw Cement -> Ch.25',
    description: 'Unworked cement and mineral powders',
    condition: (attrs) => {
      const query = [attrs.material, attrs.form, attrs.processing_state, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      const isCement = query.includes('cement') || query.includes('clinker');
      const isRaw = ['powder', 'raw', 'bulk', 'clinker', 'portland', 'hydraulic']
        .some(kw => query.includes(kw));
      const notArticle = !['block', 'tile', 'brick', 'pipe', 'slab', 'precast']
        .some(kw => query.includes(kw));
      return isCement && isRaw && notArticle;
    },
    chapter: '25',
    priority: 85,
    legal_basis: 'Chapter 25: Raw cement and mineral products.'
  },

  {
    id: 'cement_articles',
    name: 'Cement Articles -> Ch.68',
    description: 'Manufactured cement products',
    condition: (attrs) => {
      const query = [attrs.material, attrs.form, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      const isCite = query.includes('cement') || query.includes('concrete');
      const isArticle = ['block', 'tile', 'brick', 'pipe', 'slab', 'article',
                         'product', 'precast', 'paver']
        .some(kw => query.includes(kw));
      return isCite && isArticle;
    },
    chapter: '68',
    priority: 84,
    legal_basis: 'Chapter 68: Articles of stone, cement, concrete.'
  },

  // ==========================================
  // TEXTILE RULES
  // ==========================================

  // ---- Higher priority garment rules (override fabric rules) ----

  {
    id: 'knitted_hosiery',
    name: 'Knitted Socks/Hosiery -> Ch.61',
    description: 'Knitted socks, stockings, hosiery',
    condition: (attrs) => {
      const query = [attrs.form, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      return /\b(socks|sock|stocking|hosiery|tights|pantyhose)\b/.test(query);
    },
    chapter: '61',
    priority: 82,
    legal_basis: 'Chapter 61: Knitted hosiery. Socks and stockings are knitted articles.'
  },

  {
    id: 'woven_sarees',
    name: 'Woven Sarees -> Ch.62',
    description: 'Traditional woven sarees',
    condition: (attrs) => {
      const query = [attrs.form, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      return /\b(saree|sari)\b/.test(query);
    },
    chapter: '62',
    priority: 81,
    legal_basis: 'Chapter 62: Woven apparel. Sarees are made-up garments.'
  },

  // ---- Fabric rules (exclude garments) ----

  {
    id: 'silk_textiles',
    name: 'Silk Fabrics -> Ch.50',
    description: 'Silk woven fabrics (not garments)',
    condition: (attrs) => {
      const query = [attrs.material, attrs.form, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      const isSilk = query.includes('silk');
      const isFabric = ['fabric', 'woven', 'cloth', 'textile']
        .some(kw => query.includes(kw));
      // Exclude garments - they go to Ch.62
      const notGarment = !['saree', 'sari', 'dress', 'shirt', 'blouse', 'scarf', 'garment']
        .some(kw => query.includes(kw));
      return isSilk && isFabric && notGarment;
    },
    chapter: '50',
    priority: 80,
    legal_basis: 'Chapter 50: Silk fabrics (not made-up garments).'
  },

  {
    id: 'cotton_textiles',
    name: 'Cotton Fabrics -> Ch.52',
    description: 'Cotton woven fabrics (not garments)',
    condition: (attrs) => {
      const query = [attrs.material, attrs.form, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      const isCotton = query.includes('cotton');
      const isFabric = ['fabric', 'woven', 'cloth', 'textile']
        .some(kw => query.includes(kw));
      // Exclude garments including socks/hosiery - they go to Ch.61/62
      const notGarment = !['shirt', 'dress', 'trouser', 'garment', 'socks', 'sock', 'hosiery']
        .some(kw => query.includes(kw));
      return isCotton && isFabric && notGarment;
    },
    chapter: '52',
    priority: 79,
    legal_basis: 'Chapter 52: Cotton fabrics (not made-up garments).'
  },

  {
    id: 'knitted_apparel',
    name: 'Knitted Garments -> Ch.61',
    description: 'Knitted or crocheted clothing',
    condition: (attrs) => {
      const query = [attrs.form, attrs.material, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      const isKnitted = ['knitted', 'knit', 'crocheted', 't-shirt', 'tshirt',
                         'sweater', 'jersey', 'pullover', 'hosiery', 'socks']
        .some(kw => query.includes(kw));
      return isKnitted;
    },
    chapter: '61',
    priority: 78,
    legal_basis: 'Chapter 61: Knitted or crocheted apparel.'
  },

  {
    id: 'woven_apparel',
    name: 'Woven Garments -> Ch.62',
    description: 'Woven (not knitted) clothing',
    condition: (attrs) => {
      const query = [attrs.form, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      const isGarment = ['suit', 'jacket', 'coat', 'shirt', 'blouse', 'trouser',
                         'dress', 'skirt', 'shorts']
        .some(kw => query.includes(kw));
      const notKnitted = !['knit', 'crocheted', 'jersey', 't-shirt']
        .some(kw => query.includes(kw));
      return isGarment && notKnitted;
    },
    chapter: '62',
    priority: 77,
    legal_basis: 'Chapter 62: Woven apparel.'
  },

  // ==========================================
  // FOOD & AGRICULTURE
  // ==========================================

  {
    id: 'spices',
    name: 'Spices -> Ch.09',
    description: 'Spices (pepper, turmeric, etc.)',
    condition: (attrs) => {
      const query = [attrs.material, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      const spices = ['pepper', 'cinnamon', 'clove', 'cardamom', 'turmeric',
                      'ginger', 'cumin', 'coriander', 'nutmeg', 'saffron',
                      'vanilla', 'bay leaf', 'spice', 'chilli', 'chili'];
      // Only match if spice is found and it's NOT a vehicle part
      const isSpice = spices.some(kw => query.includes(kw));
      const notVehicle = !['vehicle', 'car', 'truck', 'automobile', 'brake', 'engine']
        .some(kw => query.includes(kw));
      return isSpice && notVehicle;
    },
    chapter: '09',
    priority: 95,  // Higher than vehicle parts when it's clearly a spice
    legal_basis: 'Chapter 09: Coffee, tea, mate and spices.'
  },

  // ==========================================
  // LEATHER AND FUR ARTICLES (Override textile rules)
  // ==========================================

  {
    id: 'leather_articles',
    name: 'Leather Articles -> Ch.42',
    description: 'Articles of leather (jackets, bags, etc.)',
    condition: (attrs) => {
      const query = [attrs.material, attrs.form, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      const isLeather = /\b(leather|genuine leather|cowhide|goatskin|sheepskin)\b/.test(query);
      const isArticle = /\b(jacket|bag|handbag|belt|wallet|glove|briefcase|suitcase)\b/.test(query);
      return isLeather && isArticle;
    },
    chapter: '42',
    priority: 96,
    legal_basis: 'Chapter 42: Articles of leather. Leather articles classified by material, not as textiles.'
  },

  {
    id: 'furskin_articles',
    name: 'Furskin Articles -> Ch.43',
    description: 'Articles of furskin (coats, etc.)',
    condition: (attrs) => {
      const query = [attrs.material, attrs.form, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      const isFur = /\b(fur|furskin|mink|fox|rabbit|sable|chinchilla)\b/.test(query);
      const isArticle = /\b(coat|jacket|stole|collar|hat|scarf)\b/.test(query);
      return isFur && isArticle;
    },
    chapter: '43',
    priority: 96,
    legal_basis: 'Chapter 43: Furskins and artificial fur. Furskin articles classified here, not as textiles.'
  },

  // ==========================================
  // BULK CHEMICALS AND FOOD SUPPLEMENTS (Override medicaments)
  // ==========================================

  {
    id: 'food_supplements',
    name: 'Food Supplements -> Ch.21',
    description: 'Vitamins and dietary supplements',
    condition: (attrs) => {
      const query = [attrs.function, attrs.form, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      const isSupplement = /\b(food supplement|dietary supplement|nutrition|nutraceutical)\b/.test(query);
      const isVitamin = /\b(vitamin)\b/.test(query) &&
                        !/\b(medicament|medicine|drug|prescription)\b/.test(query);
      return isSupplement || isVitamin;
    },
    chapter: '21',
    priority: 94,
    legal_basis: 'Chapter 21: Food preparations. Food supplements and vitamins classified here, not as medicaments.'
  },

  {
    id: 'bulk_api_chemicals',
    name: 'Bulk Pharmaceutical APIs -> Ch.29',
    description: 'Pharmaceutical raw materials in bulk form',
    condition: (attrs) => {
      const query = [attrs.form, attrs.processing_state, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      const isBulk = /\b(bulk|api|active pharmaceutical ingredient|raw material|powder)\b/.test(query);
      const isPharmaceutical = /\b(pharmaceutical|paracetamol|ibuprofen|amoxicillin|metformin)\b/.test(query);
      const notDosage = !/\b(tablet|capsule|syrup|injection|blister)\b/.test(query);
      return isBulk && isPharmaceutical && notDosage;
    },
    chapter: '29',
    priority: 93,
    legal_basis: 'Chapter 29: Organic chemicals. Pharmaceutical APIs in bulk form are chemicals, not medicaments.'
  },

  {
    id: 'cereals',
    name: 'Cereals -> Ch.10',
    description: 'Wheat, rice, corn, etc.',
    condition: (attrs) => {
      const query = [attrs.material, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      const cereals = ['wheat', 'rice', 'corn', 'maize', 'barley', 'oat',
                       'millet', 'sorghum', 'buckwheat', 'cereal', 'grain'];
      // Exclude processed foods
      const notProcessed = !['flour', 'bread', 'pasta', 'noodle']
        .some(kw => query.includes(kw));
      return cereals.some(kw => query.includes(kw)) && notProcessed;
    },
    chapter: '10',
    priority: 72,
    legal_basis: 'Chapter 10: Cereals.'
  },

  // ==========================================
  // ELECTRONICS & MACHINERY
  // ==========================================

  {
    id: 'electrical_machinery',
    name: 'Electrical Equipment -> Ch.85',
    description: 'Electrical machines and equipment',
    condition: (attrs) => {
      const query = [attrs.material, attrs.function, attrs.form, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      const electrical = ['electric', 'electronic', 'battery', 'motor electric',
                          'generator', 'transformer', 'capacitor', 'resistor',
                          'circuit', 'semiconductor', 'led', 'lcd', 'display',
                          'phone', 'computer', 'laptop', 'television', 'radio',
                          'lithium', 'ion battery', 'accumulator', 'charger',
                          'power bank', 'solar panel', 'photovoltaic'];
      // Don't match if it's clearly a vehicle part
      const notVehicle = !['vehicle', 'car', 'truck', 'automobile', 'brake']
        .some(kw => query.includes(kw));
      return electrical.some(kw => query.includes(kw)) && notVehicle;
    },
    chapter: '85',
    priority: 75,  // Increased priority
    legal_basis: 'Chapter 85: Electrical machinery and equipment.'
  },

  {
    id: 'mechanical_machinery',
    name: 'Mechanical Machinery -> Ch.84',
    description: 'Non-electrical machinery',
    condition: (attrs) => {
      const query = [attrs.form, attrs.function, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      const mechanical = ['machine', 'machinery', 'pump', 'compressor', 'engine',
                          'turbine', 'valve', 'bearing', 'gear', 'hydraulic',
                          'pneumatic', 'boiler', 'furnace'];
      const notElectrical = !['electric', 'electronic', 'battery']
        .some(kw => query.includes(kw));
      return mechanical.some(kw => query.includes(kw)) && notElectrical;
    },
    chapter: '84',
    priority: 69,
    legal_basis: 'Chapter 84: Machinery and mechanical appliances.'
  },

  // ==========================================
  // METALS
  // ==========================================

  {
    id: 'iron_steel_articles',
    name: 'Iron/Steel Articles -> Ch.73',
    description: 'Finished articles of iron or steel',
    condition: (attrs) => {
      const query = [attrs.material, attrs.form, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      const isSteel = ['iron', 'steel', 'stainless'].some(kw => query.includes(kw));

      // Products with their OWN specific chapter — not Ch.73
      const hasDedicatedChapter = [
        // Ch.82 - Tools, cutlery, spoons, forks
        'knife', 'knives', 'cutlery', 'razor', 'scissors', 'blade',
        'sword', 'plier', 'pliers', 'saw', 'spanner', 'wrench',
        'screwdriver', 'chisel', 'fork', 'spoon', 'ladle',
        // Ch.96 - Thermos/vacuum vessels
        'thermos', 'vacuum flask', 'vacuum bottle',
        'insulated bottle', 'insulated flask',
      ].some(kw => query.includes(kw));

      if (!isSteel || hasDedicatedChapter) return false;

      const isArticle = !['ingot', 'billet', 'bar', 'rod', 'wire', 'sheet',
                          'plate', 'coil', 'strip', 'pipe', 'tube']
        .some(kw => query.includes(kw));
      const articleKeywords = ['bolt', 'screw', 'nut', 'nail', 'container',
                               'tank', 'box', 'furniture', 'kitchenware'];
      return isArticle || articleKeywords.some(kw => query.includes(kw));
    },
    chapter: '73',
    priority: 65,
    legal_basis: 'Chapter 73: Articles of iron or steel.'
  },

  {
    id: 'aluminium_articles',
    name: 'Aluminium Articles -> Ch.76',
    description: 'Finished articles of aluminium',
    condition: (attrs) => {
      const query = [attrs.material, attrs.form, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      const isAluminium = query.includes('alumin');
      const isArticle = !['ingot', 'bar', 'wire', 'sheet', 'plate', 'foil']
        .some(kw => query.includes(kw));
      return isAluminium && isArticle;
    },
    chapter: '76',
    priority: 64,
    legal_basis: 'Chapter 76: Aluminium and articles thereof.'
  },

  // ==========================================
  // PLASTICS & RUBBER
  // ==========================================

  {
    id: 'plastic_articles',
    name: 'Plastic Articles -> Ch.39',
    description: 'Plastics and articles (unless classified elsewhere)',
    condition: (attrs) => {
      const query = [attrs.material, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      const plastics = ['plastic', 'polymer', 'polyethylene', 'polypropylene',
                        'pvc', 'nylon', 'acrylic', 'polystyrene', 'pet', 'hdpe'];
      // Only if not classified elsewhere by function
      const notFunctional = !['vehicle', 'optical', 'medical', 'electrical']
        .some(kw => query.includes(kw));
      return plastics.some(kw => query.includes(kw)) && notFunctional;
    },
    chapter: '39',
    priority: 50,
    legal_basis: 'Chapter 39: Plastics (unless classified elsewhere by function).'
  },

  {
    id: 'rubber_tyres',
    name: 'Rubber Tyres -> Ch.40',
    description: 'Rubber tyres and tubes',
    condition: (attrs) => {
      const query = [attrs.form, attrs.raw_query]
        .filter(Boolean).join(' ').toLowerCase();
      return query.includes('tyre') || query.includes('tire') ||
             query.includes('rubber tube');
    },
    chapter: '40',
    priority: 49,
    legal_basis: 'Chapter 40: Rubber tyres.'
  },
];

/**
 * Apply chapter rules to determine the correct chapter
 * Returns the first matching rule or null if no rule matches
 */
export function applyChapterRules(attrs: ExtractedAttributes): ChapterRule | null {
  // Sort by priority (highest first)
  const sortedRules = [...CHAPTER_RULES].sort((a, b) => b.priority - a.priority);

  for (const rule of sortedRules) {
    try {
      if (rule.condition(attrs)) {
        return rule;
      }
    } catch (e) {
      // Skip rules that error (missing attributes)
      continue;
    }
  }

  return null;
}

/**
 * Get all potentially relevant chapters for a query
 * Used when no hard rule matches
 */
export function getPotentialChapters(attrs: ExtractedAttributes): string[] {
  const chapters: Set<string> = new Set();

  // Add chapters from partially matching rules
  for (const rule of CHAPTER_RULES) {
    chapters.add(rule.chapter);
  }

  // Return common export chapters as fallback
  return Array.from(chapters);
}
