const fs=require('fs');const path=require('path');const base=path.join(__dirname,'..');
const load=n=>JSON.parse(fs.readFileSync(path.join(base,'output',n+'.json'),'utf8'));
const sm10=load('SM-10'),sm11=load('SM-11');

// Vocab style: array tokens should be lowercase-hyphenated (no spaces, no uppercase except known)
function vocabStyle(arr,name){
  const fields=['material','form','function_','intended_use','processing_state','composition'];
  const bad=[];
  const allTokens=new Set();
  for(const r of arr){
    for(const f of fields){
      const v=r[f];
      if(!Array.isArray(v)) continue;
      for(const t of v){
        allTokens.add(t);
        if(typeof t!=='string'){bad.push({code:r.code,f,t:String(t),why:'non-string'});continue;}
        if(/\s/.test(t)) bad.push({code:r.code,f,t,why:'space'});
        else if(/[A-Z]/.test(t)) bad.push({code:r.code,f,t,why:'uppercase'});
        else if(/[^a-z0-9\-.]/.test(t)) bad.push({code:r.code,f,t,why:'special'});
      }
    }
  }
  console.log('===== '+name+' vocab-style =====');
  console.log('  distinct tokens:',allTokens.size,' style-violations:',bad.length);
  bad.slice(0,20).forEach(b=>console.log('   ',b.code,b.f,'['+b.why+']',JSON.stringify(b.t)));
}
vocabStyle(sm10,'SM-10');
vocabStyle(sm11,'SM-11');

// SM-10 Ch.34 null chemical_class records (candles 3406)
console.log('\n===== SM-10 3406 candles (chemical_class expected null) =====');
sm10.filter(r=>r.code.startsWith('3406')).forEach(r=>console.log('  ',r.code,'cc='+r.chemical_class,'::',(r.extraction_notes||'').slice(0,80)));

// SM-11 merge integrity: per-chapter confidence + note-style + extracted_at spread (was assembled from 6 parts)
console.log('\n===== SM-11 merge-integrity: per-chapter confidence + extracted_at distinct timestamps =====');
const byCh={};
for(const r of sm11){const ch=r.code.slice(0,2);(byCh[ch]=byCh[ch]||[]).push(r);}
for(const ch of Object.keys(byCh).sort()){
  const g=byCh[ch];
  const conf={};for(const r of g)conf[r.extraction_confidence]=(conf[r.extraction_confidence]||0)+1;
  const ts=new Set(g.map(r=>r.extracted_at));
  console.log('  Ch.'+ch,'n='+g.length,'conf='+JSON.stringify(conf),'distinct_extracted_at='+ts.size);
}
// global extracted_at spread
const allTs=new Set(sm11.map(r=>r.extracted_at));
console.log('  SM-11 total distinct extracted_at timestamps:',allTs.size,'(merge from multiple part-files expected >1)');
const allTs10=new Set(sm10.map(r=>r.extracted_at));
console.log('  SM-10 total distinct extracted_at timestamps:',allTs10.size);

// note-prefix style consistency (do all notes follow "<desc> (<code>)." style?)
function noteStyle(arr,name){
  let withParenCode=0,total=arr.length;
  for(const r of arr){const n=r.extraction_notes||'';if(/\(\d{4}(\.\d{2}){0,2}\)/.test(n))withParenCode++;}
  console.log('  '+name+' notes containing parenthetical code ref:',withParenCode+'/'+total);
}
console.log('\n===== note-style consistency =====');
noteStyle(sm10,'SM-10');
noteStyle(sm11,'SM-11');

// raw byte / encoding check for U+FFFD
function enc(n){const raw=fs.readFileSync(path.join(base,'output',n+'.json'),'utf8');const fffd=(raw.match(/�/g)||[]).length;console.log('  '+n+' U+FFFD replacement chars:',fffd);}
console.log('\n===== encoding =====');
enc('SM-10');enc('SM-11');
