const fs = require('fs');
const PCT_FIELDS = ['carbon_pct','chromium_pct','manganese_pct','nickel_pct','silicon_pct','phosphorus_pct','aluminum_pct','boron_pct','cobalt_pct','copper_pct','lead_pct','molybdenum_pct','niobium_pct','titanium_pct','tungsten_pct','vanadium_pct','zirconium_pct','iron_pct','sieve_pass_pct_1mm','sieve_pass_pct_5mm'];
const EXPECT_FIELDS = ['code','material','form','function_','intended_use','processing_state','composition','composite_components','carbon_pct','chromium_pct','manganese_pct','nickel_pct','silicon_pct','phosphorus_pct','aluminum_pct','boron_pct','cobalt_pct','copper_pct','lead_pct','molybdenum_pct','niobium_pct','titanium_pct','tungsten_pct','vanadium_pct','zirconium_pct','iron_pct','predominant_element','sieve_pass_pct_1mm','sieve_pass_pct_5mm','made_up','fabric_construction','electrically_warmed','wearable','electrically_heated','chemical_class','in_solution','solution_purpose','intended_role','extracted_at','extraction_model','extraction_notes','validation_status','extraction_confidence'];
// DB enum sets (from project schema / prior audits)
const ROLE_ENUM = new Set(['packaging','support','technical_use','decorative','protective','functional-component',null]);
const FABRIC_ENUM = new Set(['knitted','woven','nonwoven','crocheted','felt',null]);
const CHEM_ENUM = new Set(['separate_inorganic_compound','separate_organic_compound','mixture','element',null]);
const SOLPURP_ENUM = new Set(['specific_use','analytical','general',null]);
const SIG = r => JSON.stringify([r.material, r.form, r.function_, r.intended_use, r.processing_state]);

function base(name, inPath, outPath) {
  const inp = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  const R = { name, inp, out };
  R.inCount = inp.code_count;
  R.inCodesLen = inp.codes.length;
  R.outLen = out.length;
  const inCodes = inp.codes.map(c => c.code);
  const inSet = new Set(inCodes);
  const outCodes = out.map(r => r.code);
  const outSet = new Set(outCodes);
  R.missing = inCodes.filter(c => !outSet.has(c));
  R.extra = outCodes.filter(c => !inSet.has(c));
  const seen = {}; R.dupes = [];
  for (const c of outCodes) seen[c] = (seen[c]||0)+1;
  for (const c in seen) if (seen[c] > 1) R.dupes.push(c+' x'+seen[c]);
  // field completeness
  R.badFieldCount = [];
  for (const r of out) {
    const ks = Object.keys(r).filter(k=>k!=='_context'); // _context allowed extra
    const has43 = EXPECT_FIELDS.every(f=>f in r);
    if (ks.length !== 43) R.badFieldCount.push(r.code+' has '+ks.length+' (non-_context)');
    for (const f of EXPECT_FIELDS) if (!(f in r)) R.badFieldCount.push(r.code+' missing '+f);
  }
  // JSON valid already (parsed). metadata
  R.modelBad = out.filter(r => r.extraction_model !== 'claude-opus-4-7').map(r=>r.code);
  R.atBad = out.filter(r => !r.extracted_at).map(r=>r.code);
  R.statusDist = {}; out.forEach(r => R.statusDist[r.validation_status]=(R.statusDist[r.validation_status]||0)+1);
  R.confDist = {}; out.forEach(r => R.confDist[r.extraction_confidence]=(R.confDist[r.extraction_confidence]||0)+1);
  // enum compliance
  R.fabBad = out.filter(r => !FABRIC_ENUM.has(r.fabric_construction)).map(r=>r.code+'='+r.fabric_construction);
  R.chemBad = out.filter(r => !CHEM_ENUM.has(r.chemical_class)).map(r=>r.code+'='+r.chemical_class);
  R.roleBad = out.filter(r => !ROLE_ENUM.has(r.intended_role)).map(r=>r.code+'='+r.intended_role);
  R.solPurpBad = out.filter(r => !SOLPURP_ENUM.has(r.solution_purpose)).map(r=>r.code+'='+r.solution_purpose);
  R.roleDist = {}; out.forEach(r => { R.roleDist[r.intended_role]=(R.roleDist[r.intended_role]||0)+1; });
  R.fabDist = {}; out.forEach(r => { R.fabDist[r.fabric_construction]=(R.fabDist[r.fabric_construction]||0)+1; });
  R.chemDist = {}; out.forEach(r => { R.chemDist[r.chemical_class]=(R.chemDist[r.chemical_class]||0)+1; });
  R.inSolDist = {}; out.forEach(r => { R.inSolDist[r.in_solution]=(R.inSolDist[r.in_solution]||0)+1; });
  R.solPurpDist = {}; out.forEach(r => { R.solPurpDist[r.solution_purpose]=(R.solPurpDist[r.solution_purpose]||0)+1; });
  R.madeUpDist = {}; out.forEach(r => { R.madeUpDist[r.made_up]=(R.madeUpDist[r.made_up]||0)+1; });
  R.wearableDist = {}; out.forEach(r => { R.wearableDist[r.wearable]=(R.wearableDist[r.wearable]||0)+1; });
  // templating
  const sigs = out.map(SIG);
  R.uniqSig = new Set(sigs).size;
  R.sigPct = (R.uniqSig/out.length*100).toFixed(1);
  const noteMap = {}; out.forEach(r => { (noteMap[r.extraction_notes]=noteMap[r.extraction_notes]||[]).push(r.code); });
  R.uniqNotes = Object.keys(noteMap).length;
  R.notesPct = (R.uniqNotes/out.length*100).toFixed(1);
  R.dupNoteGroups = Object.entries(noteMap).filter(([k,v])=>v.length>1).map(([k,v])=>({note:k.slice(0,70), codes:v}));
  const sigToSubs = {};
  out.forEach(r => { const s=SIG(r); const sub=r.code.slice(0,7); (sigToSubs[s]=sigToSubs[s]||new Set()).add(sub); });
  R.crossSubColl = Object.values(sigToSubs).filter(s=>s.size>1).length;
  // numeric pct discipline
  const descMap = {}; inp.codes.forEach(c => descMap[c.code]=c.description);
  R.pctPopulated = [];
  for (const r of out) for (const f of PCT_FIELDS) if (r[f] !== null && r[f] !== undefined)
    R.pctPopulated.push({code:r.code, field:f, value:r[f], desc:(descMap[r.code]||'').slice(0,70)});
  R.descMap = descMap;
  return R;
}

function dump(R) {
  console.log('\n========== '+R.name+' ==========');
  console.log('count: in='+R.inCount+' inCodesLen='+R.inCodesLen+' out='+R.outLen+' MATCH='+(R.inCount===R.outLen && R.inCodesLen===R.outLen));
  console.log('missing:', R.missing.length, R.missing.slice(0,10).join(',')||'-');
  console.log('extra:', R.extra.length, R.extra.slice(0,10).join(',')||'-');
  console.log('dupes:', R.dupes.length, R.dupes.join(',')||'-');
  console.log('badFieldCount:', R.badFieldCount.length, R.badFieldCount.slice(0,6).join(' | ')||'-');
  console.log('model bad:', R.modelBad.length, '| extracted_at bad:', R.atBad.length);
  console.log('statusDist:', JSON.stringify(R.statusDist), '| confDist:', JSON.stringify(R.confDist));
  console.log('--- enum ---');
  console.log('fabric_construction OUT-OF-ENUM:', R.fabBad.length, R.fabBad.slice(0,8).join(',')||'-');
  console.log('  fabDist:', JSON.stringify(R.fabDist));
  console.log('chemical_class OUT-OF-ENUM:', R.chemBad.length, R.chemBad.slice(0,8).join(',')||'-');
  console.log('  chemDist:', JSON.stringify(R.chemDist));
  console.log('intended_role OUT-OF-ENUM:', R.roleBad.length, R.roleBad.slice(0,10).join(',')||'-');
  console.log('  roleDist:', JSON.stringify(R.roleDist));
  console.log('solution_purpose OUT-OF-ENUM:', R.solPurpBad.length, R.solPurpBad.slice(0,8).join(',')||'-');
  console.log('  solPurpDist:', JSON.stringify(R.solPurpDist), '| inSolDist:', JSON.stringify(R.inSolDist));
  console.log('made_up dist:', JSON.stringify(R.madeUpDist), '| wearable dist:', JSON.stringify(R.wearableDist));
  console.log('--- templating ---');
  console.log('uniq full-sig:', R.uniqSig+'/'+R.outLen+' = '+R.sigPct+'%');
  console.log('uniq notes:', R.uniqNotes+'/'+R.outLen+' = '+R.notesPct+'%');
  console.log('dup-note groups:', R.dupNoteGroups.length);
  R.dupNoteGroups.slice(0,20).forEach(g => console.log('   DUPNOTE x'+g.codes.length+' ['+g.codes.slice(0,8).join(',')+(g.codes.length>8?'...':'')+']: '+g.note));
  console.log('cross-subheading sig collisions:', R.crossSubColl);
  console.log('--- numeric pct populated:', R.pctPopulated.length, '---');
  R.pctPopulated.slice(0,20).forEach(p => console.log('   '+p.code+' '+p.field+'='+p.value+' | desc="'+p.desc+'"'));
}

const r40 = base('SC-40','chunks/input/SC-40.json','chunks/output/SC-40.json');
const r61 = base('SC-61','chunks/input/SC-61.json','chunks/output/SC-61.json');
dump(r40);
dump(r61);

// ======= SC-40 rubber-specific discipline =======
console.log('\n##### SC-40 RUBBER DISCIPLINE #####');
const o40 = r40.out;
// subheading distribution by heading
const hDist={}; o40.forEach(r=>{const h=r.code.slice(0,4); hDist[h]=(hDist[h]||0)+1;});
console.log('heading dist:', JSON.stringify(hDist));
// NR vs SR material discipline: 4001=natural rubber(NR), 4002=synthetic(SR)
const matJoin=r=>(r.material||[]).join('|').toLowerCase();
console.log('4001 (Natural Rubber) materials:');
o40.filter(r=>r.code.startsWith('4001')).slice(0,12).forEach(r=>console.log('   '+r.code+' mat=['+(r.material||[]).join(',')+'] ps=['+(r.processing_state||[]).join(',')+'] desc="'+(r40.descMap[r.code]||'').slice(0,45)+'"'));
console.log('4002 (Synthetic Rubber) materials:');
o40.filter(r=>r.code.startsWith('4002')).slice(0,12).forEach(r=>console.log('   '+r.code+' mat=['+(r.material||[]).join(',')+'] ps=['+(r.processing_state||[]).join(',')+'] desc="'+(r40.descMap[r.code]||'').slice(0,45)+'"'));
// latex in_solution check (4001.10 latex, 4002.x latex)
console.log('LATEX codes (desc contains latex) in_solution:');
o40.filter(r=>/latex/i.test(r40.descMap[r.code]||'')).forEach(r=>console.log('   '+r.code+' in_solution='+r.in_solution+' sol_purpose='+r.solution_purpose+' desc="'+(r40.descMap[r.code]||'').slice(0,45)+'"'));
// tyres 4011/4012/4013 radial vs bias
console.log('TYRE codes (4011/4012/4013) processing_state radial-vs-bias:');
o40.filter(r=>/^401[123]/.test(r.code)).forEach(r=>console.log('   '+r.code+' ps=['+(r.processing_state||[]).join(',')+'] role='+r.intended_role+' desc="'+(r40.descMap[r.code]||'').slice(0,50)+'"'));
// belts/seals technical_use 4010/4016
console.log('BELTS/SEALS (4010 conveyor/transmission belts; 4016 other articles) intended_role:');
o40.filter(r=>/^4010/.test(r.code)||/belt|seal|gasket|washer/i.test(r40.descMap[r.code]||'')).slice(0,15).forEach(r=>console.log('   '+r.code+' role='+r.intended_role+' desc="'+(r40.descMap[r.code]||'').slice(0,50)+'"'));
// 4015 gloves wearable
console.log('4015 (apparel/gloves) wearable flag:');
o40.filter(r=>/^4015/.test(r.code)).forEach(r=>console.log('   '+r.code+' wearable='+r.wearable+' role='+r.intended_role+' desc="'+(r40.descMap[r.code]||'').slice(0,50)+'"'));
// chemical_class should be NULL across Ch.40
console.log('Ch.40 chemical_class non-null (should be 0):', o40.filter(r=>r.chemical_class!==null).map(r=>r.code+'='+r.chemical_class).join(',')||'NONE');

// ======= SC-61 knitted-specific =======
console.log('\n##### SC-61 KNITTED DISCIPLINE #####');
const o61=r61.out;
const fab = o61.map(r=>r.fabric_construction);
const knittedCount = fab.filter(v=>v==='knitted').length;
const crochetCount = fab.filter(v=>v==='crocheted').length;
console.log('fabric_construction=knitted:', knittedCount+'/'+o61.length, '| crocheted:', crochetCount, '| ALL-KNITTED='+(knittedCount===o61.length));
console.log('NON-knitted fabric_construction codes:');
o61.filter(r=>r.fabric_construction!=='knitted').forEach(r=>console.log('   '+r.code+' fc='+r.fabric_construction+' desc="'+(r61.descMap[r.code]||'').slice(0,50)+'"'));
console.log('made_up!=true codes (should be NONE):');
o61.filter(r=>r.made_up!==true).forEach(r=>console.log('   '+r.code+' made_up='+r.made_up+' desc="'+(r61.descMap[r.code]||'').slice(0,50)+'"'));
console.log('intended_role non-null (apparel should be NULL):', o61.filter(r=>r.intended_role!==null).map(r=>r.code+'='+r.intended_role).join(',')||'NONE');
console.log('wearable dist (apparel):', JSON.stringify(r61.wearableDist));
// 6105.10.10 crochet note
const cr=o61.find(r=>r.code==='6105.10.10');
if(cr) console.log('6105.10.10 fc='+cr.fc+' fabric_construction='+cr.fabric_construction+' note="'+(cr.extraction_notes||'').slice(0,90)+'"');
// gold fidelity
console.log('--- SC-61 GOLD FIDELITY ---');
const gold=JSON.parse(fs.readFileSync('validation-set-50.json','utf8'));
['6103.29.90','6108.19.10','6115.21.00'].forEach(gc=>{
  const g=gold.find(x=>x.code===gc); const o=o61.find(x=>x.code===gc);
  if(!o){console.log('   '+gc+' MISSING from output'); return;}
  if(!g){console.log('   '+gc+' not in gold file?'); return;}
  const cmp=[];
  ['material','form','function_','intended_use','processing_state','composition','made_up','fabric_construction','wearable','intended_role','chemical_class'].forEach(f=>{
    const a=JSON.stringify(g[f]), b=JSON.stringify(o[f]);
    if(a!==b) cmp.push(f+': gold='+a+' out='+b);
  });
  console.log('   '+gc+' '+(cmp.length===0?'EXACT MATCH on compared fields':'DIFFS: '+cmp.join(' ;; ')));
});
