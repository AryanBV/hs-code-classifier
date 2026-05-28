// F4 audit: SM-10 + SM-11
const fs = require('fs');
const path = require('path');
const base = path.join(__dirname, '..');

const ENUMS = {
  chemical_class: ['separate_organic_compound','separate_inorganic_compound','isomer_mixture','sugar_derivative','diazonium_salt','other'],
  fabric_construction: ['knitted','crocheted','woven','wadding','other'],
  intended_role: ['packaging','support','technical_use','implant','optical_element','other'],
  solution_purpose: ['safety_transport','specific_use','none'],
};
const METALS = ['carbon_pct','chromium_pct','manganese_pct','nickel_pct','silicon_pct','phosphorus_pct','aluminum_pct','boron_pct','cobalt_pct','copper_pct','lead_pct','molybdenum_pct','niobium_pct','titanium_pct','tungsten_pct','vanadium_pct','zirconium_pct','iron_pct'];
const EXPECTED_FIELDS = 43;

function loadRaw(p){ return fs.readFileSync(p,'utf8'); }

function audit(name){
  const inPath = path.join(base,'input',name+'.json');
  const outPath = path.join(base,'output',name+'.json');
  const inp = JSON.parse(loadRaw(inPath));
  const rawOut = loadRaw(outPath);
  let out, jsonValid=true, jsonErr='';
  try { out = JSON.parse(rawOut); } catch(e){ jsonValid=false; jsonErr=e.message; out=[]; }

  const inputCodes = inp.codes.map(c=>c.code);
  const inputCount = inp.code_count;
  const outCount = out.length;

  // dup codes
  const seen = new Map();
  const dups = [];
  for (const r of out){ if(seen.has(r.code)) dups.push(r.code); else seen.set(r.code,1); }

  // coverage
  const outCodeSet = new Set(out.map(r=>r.code));
  const inCodeSet = new Set(inputCodes);
  const missing = inputCodes.filter(c=>!outCodeSet.has(c));
  const extra = out.map(r=>r.code).filter(c=>!inCodeSet.has(c));

  // field count
  const fieldIssues = [];
  for (const r of out){ const k=Object.keys(r).length; if(k!==EXPECTED_FIELDS) fieldIssues.push({code:r.code,n:k}); }

  // enum compliance
  const enumViol = {chemical_class:[],fabric_construction:[],intended_role:[],solution_purpose:[]};
  for (const r of out){
    for (const f of Object.keys(ENUMS)){
      const v = r[f];
      if (v!==null && v!==undefined && !ENUMS[f].includes(v)) enumViol[f].push({code:r.code,val:v});
    }
  }

  // chapter grouping
  const byCh = {};
  for (const r of out){ const ch=r.code.slice(0,2); (byCh[ch]=byCh[ch]||[]).push(r); }

  // templating: attribute signature
  const sig = r => JSON.stringify([r.material,r.form,r.function_,r.intended_use,r.processing_state,r.composition]);
  const sigMap = new Map();
  for (const r of out){ const s=sig(r); sigMap.set(s,(sigMap.get(s)||0)+1); }
  const uniqSig = sigMap.size;
  const sigDivPct = (uniqSig/outCount*100);

  // dup notes
  const notesMap = new Map();
  let emptyNotes=0;
  for (const r of out){ const n=(r.extraction_notes||'').trim(); if(!n) emptyNotes++; notesMap.set(n,(notesMap.get(n)||0)+1); }
  const uniqNotes = notesMap.size;
  const dupNotesGroups = [...notesMap.entries()].filter(([n,c])=>c>1 && n).sort((a,b)=>b[1]-a[1]);

  // confidence dist
  const conf = {};
  for (const r of out){ const c=(r.extraction_confidence||'NULL'); conf[c]=(conf[c]||0)+1; }

  // validation_status + model
  const vs = {}, model={};
  for (const r of out){ vs[r.validation_status||'NULL']=(vs[r.validation_status||'NULL']||0)+1; model[r.extraction_model||'NULL']=(model[r.extraction_model||'NULL']||0)+1; }

  // metal pct on non-metal chapters: any non-null metal
  const metalNonNull = [];
  for (const r of out){ for(const m of METALS){ if(r[m]!==null && r[m]!==undefined) { metalNonNull.push({code:r.code,m,v:r[m]}); } } }

  // cross-chapter vocab bleed: per-chapter chemical_class/fabric_construction/intended_role usage
  const chAttr = {};
  for (const ch of Object.keys(byCh)){
    chAttr[ch] = {
      n: byCh[ch].length,
      chemical_class: {}, fabric_construction:{}, intended_role:{}, solution_purpose:{}, in_solution:{true:0,false:0,null:0},
      made_up:{true:0,false:0,null:0}
    };
    for (const r of byCh[ch]){
      const cc=r.chemical_class; if(cc) chAttr[ch].chemical_class[cc]=(chAttr[ch].chemical_class[cc]||0)+1;
      const fc=r.fabric_construction; if(fc) chAttr[ch].fabric_construction[fc]=(chAttr[ch].fabric_construction[fc]||0)+1;
      const ir=r.intended_role; if(ir) chAttr[ch].intended_role[ir]=(chAttr[ch].intended_role[ir]||0)+1;
      const sp=r.solution_purpose; if(sp) chAttr[ch].solution_purpose[sp]=(chAttr[ch].solution_purpose[sp]||0)+1;
      const ms = r.made_up===true?'true':r.made_up===false?'false':'null'; chAttr[ch].made_up[ms]++;
      const ins = r.in_solution===true?'true':r.in_solution===false?'false':'null'; chAttr[ch].in_solution[ins]++;
    }
  }

  return {name,inputCount,outCount,jsonValid,jsonErr,dups,missing,extra,fieldIssues,enumViol,byCh,uniqSig,sigDivPct,uniqNotes,emptyNotes,dupNotesGroups,conf,vs,model,metalNonNull,chAttr,sigMap};
}

function pr(label,v){ console.log(label, v); }

for (const nm of ['SM-10','SM-11']){
  const a = audit(nm);
  console.log('\n================ '+nm+' ================');
  pr('JSON valid:', a.jsonValid + (a.jsonValid?'':' ERR='+a.jsonErr));
  pr('input_count:', a.inputCount, ' output_count:', a.outCount, ' match:', a.inputCount===a.outCount);
  pr('dup codes:', a.dups.length, a.dups.slice(0,10).join(','));
  pr('missing (in input, not output):', a.missing.length, a.missing.slice(0,15).join(','));
  pr('extra (in output, not input):', a.extra.length, a.extra.slice(0,15).join(','));
  pr('field-count deviations (!=43):', a.fieldIssues.length, JSON.stringify(a.fieldIssues.slice(0,5)));
  console.log('ENUM violations:');
  for (const f of Object.keys(a.enumViol)){ console.log('  '+f+':', a.enumViol[f].length, JSON.stringify(a.enumViol[f].slice(0,8))); }
  pr('metal_pct non-null count:', a.metalNonNull.length, JSON.stringify(a.metalNonNull.slice(0,8)));
  pr('sig-diversity:', a.uniqSig+'/'+a.outCount, '= '+a.sigDivPct.toFixed(1)+'%');
  pr('notes uniqueness:', a.uniqNotes+'/'+a.outCount, ' empty notes:', a.emptyNotes);
  console.log('  dup-notes groups (>1):', a.dupNotesGroups.length);
  for (const [n,c] of a.dupNotesGroups.slice(0,8)) console.log('    ['+c+'x]', JSON.stringify(n.slice(0,90)));
  pr('confidence dist:', JSON.stringify(a.conf));
  pr('validation_status:', JSON.stringify(a.vs));
  pr('extraction_model:', JSON.stringify(a.model));
  console.log('PER-CHAPTER:');
  const chs = Object.keys(a.byCh).sort();
  for (const ch of chs){
    const x=a.chAttr[ch];
    console.log('  Ch.'+ch+' n='+x.n
      +' | chem='+JSON.stringify(x.chemical_class)
      +' fabric='+JSON.stringify(x.fabric_construction)
      +' role='+JSON.stringify(x.intended_role)
      +' solP='+JSON.stringify(x.solution_purpose)
      +' made_up='+JSON.stringify(x.made_up)
      +' in_sol='+JSON.stringify(x.in_solution));
  }
}
