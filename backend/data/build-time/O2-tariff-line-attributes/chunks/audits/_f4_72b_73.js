const fs = require('fs');
const PCT_FIELDS = ['carbon_pct','chromium_pct','manganese_pct','nickel_pct','silicon_pct','phosphorus_pct','aluminum_pct','boron_pct','cobalt_pct','copper_pct','lead_pct','molybdenum_pct','niobium_pct','titanium_pct','tungsten_pct','vanadium_pct','zirconium_pct','iron_pct','sieve_pass_pct_1mm','sieve_pass_pct_5mm'];
const EXPECT_FIELDS = ['code','material','form','function_','intended_use','processing_state','composition','composite_components','carbon_pct','chromium_pct','manganese_pct','nickel_pct','silicon_pct','phosphorus_pct','aluminum_pct','boron_pct','cobalt_pct','copper_pct','lead_pct','molybdenum_pct','niobium_pct','titanium_pct','tungsten_pct','vanadium_pct','zirconium_pct','iron_pct','predominant_element','sieve_pass_pct_1mm','sieve_pass_pct_5mm','made_up','fabric_construction','electrically_warmed','wearable','electrically_heated','chemical_class','in_solution','solution_purpose','intended_role','extracted_at','extraction_model','extraction_notes','validation_status','extraction_confidence'];
const ROLE_ENUM = new Set(['packaging','support','technical_use','decorative','protective','functional-component',null]);
const SOLPURP_ENUM = new Set([null]); // expect all null in metals
const SIG = r => JSON.stringify([r.material, r.form, r.function_, r.intended_use, r.processing_state]);

function audit(name, inPath, outPath) {
  const inp = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  const R = { name };
  R.inCount = inp.code_count;
  R.inCodesLen = inp.codes.length;
  R.outLen = out.length;
  const inCodes = inp.codes.map(c => c.code);
  const inSet = new Set(inCodes);
  const outCodes = out.map(r => r.code);
  const outSet = new Set(outCodes);
  R.missing = inCodes.filter(c => !outSet.has(c));
  R.extra = outCodes.filter(c => !inSet.has(c));
  // dupes
  const seen = {}; R.dupes = [];
  for (const c of outCodes) { seen[c] = (seen[c]||0)+1; }
  for (const c in seen) if (seen[c] > 1) R.dupes.push(c+' x'+seen[c]);
  // field completeness
  R.badFieldCount = [];
  for (const r of out) {
    const ks = Object.keys(r);
    if (ks.length !== 43) R.badFieldCount.push(r.code+' has '+ks.length);
    for (const f of EXPECT_FIELDS) if (!(f in r)) R.badFieldCount.push(r.code+' missing '+f);
  }
  // metadata
  R.modelBad = out.filter(r => r.extraction_model !== 'claude-opus-4-7').map(r=>r.code);
  R.atBad = out.filter(r => !r.extracted_at).map(r=>r.code);
  R.statusDist = {}; out.forEach(r => R.statusDist[r.validation_status]=(R.statusDist[r.validation_status]||0)+1);
  R.confDist = {}; out.forEach(r => R.confDist[r.extraction_confidence]=(R.confDist[r.extraction_confidence]||0)+1);
  // enum compliance
  R.chemBad = out.filter(r => r.chemical_class !== null).map(r=>r.code+'='+r.chemical_class);
  R.fabBad = out.filter(r => r.fabric_construction !== null).map(r=>r.code+'='+r.fabric_construction);
  R.roleDist = {}; out.forEach(r => { const v=r.intended_role; R.roleDist[v]=(R.roleDist[v]||0)+1; });
  R.roleBad = out.filter(r => !ROLE_ENUM.has(r.intended_role)).map(r=>r.code+'='+r.intended_role);
  R.solPurpBad = out.filter(r => r.solution_purpose !== null).map(r=>r.code+'='+r.solution_purpose);
  R.inSolDist = {}; out.forEach(r => { const v=r.in_solution; R.inSolDist[v]=(R.inSolDist[v]||0)+1; });
  // templating
  const sigs = out.map(SIG);
  R.uniqSig = new Set(sigs).size;
  R.sigPct = (R.uniqSig/out.length*100).toFixed(1);
  const noteMap = {}; out.forEach(r => { noteMap[r.extraction_notes]=(noteMap[r.extraction_notes]||[]); noteMap[r.extraction_notes].push(r.code); });
  R.uniqNotes = Object.keys(noteMap).length;
  R.notesPct = (R.uniqNotes/out.length*100).toFixed(1);
  R.dupNoteGroups = Object.entries(noteMap).filter(([k,v])=>v.length>1).map(([k,v])=>({note:k.slice(0,60), codes:v}));
  // cross-subheading sig collisions
  const sigToSubs = {};
  out.forEach(r => { const s=SIG(r); const sub=r.code.slice(0,7); sigToSubs[s]=sigToSubs[s]||new Set(); sigToSubs[s].add(sub); });
  R.crossSubColl = Object.values(sigToSubs).filter(s=>s.size>1).length;
  // numeric pct discipline — map code->description
  const descMap = {}; inp.codes.forEach(c => descMap[c.code]=c.description);
  R.pctPopulated = [];
  for (const r of out) {
    for (const f of PCT_FIELDS) {
      if (r[f] !== null && r[f] !== undefined) {
        const desc = descMap[r.code] || '';
        const hasPctSign = /%/.test(desc) || /percent/i.test(desc) || /by weight/i.test(desc) || /by mass/i.test(desc);
        R.pctPopulated.push({code:r.code, field:f, value:r[f], descHasPct:hasPctSign, desc:desc.slice(0,90), note:(r.extraction_notes||'').slice(0,110)});
      }
    }
  }
  return R;
}

function dump(R) {
  console.log('\n========== '+R.name+' ==========');
  console.log('count: in='+R.inCount+' inCodesLen='+R.inCodesLen+' out='+R.outLen+' MATCH='+(R.inCount===R.outLen && R.inCodesLen===R.outLen));
  console.log('missing:', R.missing.length, R.missing.slice(0,10).join(',')||'-');
  console.log('extra:', R.extra.length, R.extra.slice(0,10).join(',')||'-');
  console.log('dupes:', R.dupes.length, R.dupes.join(',')||'-');
  console.log('badFieldCount:', R.badFieldCount.length, R.badFieldCount.slice(0,5).join(' | ')||'-');
  console.log('model bad:', R.modelBad.length, '| extracted_at bad:', R.atBad.length);
  console.log('statusDist:', JSON.stringify(R.statusDist), '| confDist:', JSON.stringify(R.confDist));
  console.log('--- enum ---');
  console.log('chemical_class non-null:', R.chemBad.length, R.chemBad.slice(0,5).join(',')||'-');
  console.log('fabric_construction non-null:', R.fabBad.length, R.fabBad.slice(0,5).join(',')||'-');
  console.log('intended_role dist:', JSON.stringify(R.roleDist));
  console.log('intended_role OUT-OF-ENUM:', R.roleBad.length, R.roleBad.slice(0,10).join(',')||'-');
  console.log('solution_purpose non-null:', R.solPurpBad.length, R.solPurpBad.slice(0,8).join(',')||'-');
  console.log('in_solution dist:', JSON.stringify(R.inSolDist));
  console.log('--- templating ---');
  console.log('uniq full-sig:', R.uniqSig+'/'+R.outLen+' = '+R.sigPct+'%');
  console.log('uniq notes:', R.uniqNotes+'/'+R.outLen+' = '+R.notesPct+'%');
  console.log('dup-note groups:', R.dupNoteGroups.length);
  R.dupNoteGroups.forEach(g => console.log('   DUPNOTE ['+g.codes.join(',')+']: '+g.note));
  console.log('cross-subheading sig collisions:', R.crossSubColl);
  console.log('--- numeric pct populated:', R.pctPopulated.length, '---');
  R.pctPopulated.forEach(p => console.log('   '+p.code+' '+p.field+'='+p.value+' descHasPct='+p.descHasPct+' | desc="'+p.desc+'"'));
  return R;
}

const r72 = audit('BIG-72b','chunks/input/BIG-72b.json','chunks/output/BIG-72b.json');
const r73 = audit('BIG-73','chunks/input/SC-73.json','chunks/output/BIG-73.json');
dump(r72);
dump(r73);
