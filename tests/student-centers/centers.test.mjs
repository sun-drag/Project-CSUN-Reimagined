import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as core from '../../js/pages/student-tools-core.mjs';
import {launchPage} from './dom-harness.mjs';
const q=(h,id)=>h.document.getElementById(id),all=(h,s)=>h.document.querySelectorAll(s),site=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const noErrors=h=>assert.deepEqual(h.errors,[]);

test('every directory record has an official source, a unique identity and useful next steps',()=>{
 assert.equal(core.RESOURCES.length,32);assert.equal(new Set(core.RESOURCES.map(r=>r.id)).size,32);
 for(const r of core.RESOURCES){assert.ok(core.officialURL(r.url),r.id);assert.ok(r.description.length>25);assert.ok(r.location);assert.ok(r.next_step);assert.equal(r.checked,'2026-11-19');}
 assert.match(core.RESOURCES.find(r=>r.id==='pantry').location,/Valera NEST/);
});
test('directory search handles student language, multiple terms, filters and saved resources',()=>{
 assert.ok(core.filterResources(core.RESOURCES,{query:'hungry'}).some(r=>r.id==='pantry'));
 assert.deepEqual(core.filterResources(core.RESOURCES,{query:'gym'}).map(r=>r.id),['src']);
 assert.ok(core.filterResources(core.RESOURCES,{query:'mental health'}).some(r=>r.id==='counseling'));
 assert.equal(core.filterResources(core.RESOURCES,{query:'gym',category:'Technology'}).length,0);
 assert.deepEqual(core.filterResources(core.RESOURCES,{savedOnly:true,saved:['pantry']}).map(r=>r.id),['pantry']);
 assert.ok(core.filterResources(core.RESOURCES,{mode:'campus'}).every(r=>r.building));
 assert.ok(core.filterResources(core.RESOURCES,{mode:'online'}).every(r=>r.online));
});
test('URLs reject executable destinations and map search uses an encoded building name',()=>{
 for(const bad of ['javascript:alert(1)','https://csun.edu.evil.example/','http://csun.edu/'])assert.equal(core.officialURL(bad),'');
 const urls=core.mapURLs({building:'CSUN University Library & Study'});assert.equal(new URL(urls.directions).searchParams.get('api'),'1');assert.match(new URL(urls.search).searchParams.get('query'),/Library & Study/);assert.equal(new URL(urls.embed).hostname,'maps.google.com');
 assert.equal(core.escapeHTML('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');
});
test('progress restore drops invalid answers and scores from answers rather than stored totals',()=>{
 const p=core.sanitizeProgress({index:999,answers:{expiry:'phishing',class:'legitimate',fake:'phishing',cards:'hacked'},score:100},core.SCENARIOS);
 assert.deepEqual(p.answers,{expiry:'phishing',class:'legitimate'});assert.deepEqual(core.scoreProgress(p,core.SCENARIOS),{answered:2,correct:2,total:8});assert.throws(()=>core.gradeAnswer(core.SCENARIOS[0],'skip'));
});
for(const page of ['resources.html','cybersecurity.html','phishing-simulator.html','scam-awareness.html'])test(page+': boots with matching navigation and valid local assets',async()=>{
 const h=await launchPage(page);try{noErrors(h);const links=all(h,'.main-nav')[0].querySelectorAll('a');assert.equal(links.length,6);assert.equal(links.filter(a=>a.getAttribute('aria-current')==='page').length,1);assert.ok(h.document.querySelector('.site-footer'));
  const html=fs.readFileSync(path.join(site,'pages',page),'utf8');for(const [,url]of html.matchAll(/(?:href|src)="([^"#]+)"/g)){if(/^(https?:|mailto:|tel:)/.test(url))continue;const filename=url.split(/[?#]/)[0];assert.ok(fs.existsSync(path.resolve(site,'pages',filename)),page+': '+url);}
 }finally{h.dispose();}
});
test('resource input, category, quick find and empty-state reset exercise actual handlers',async()=>{
 const h=await launchPage('resources.html');try{
  assert.equal(all(h,'[data-resource-card]').length,32);q(h,'resource-search').value='gym';q(h,'resource-search').trigger('input');assert.equal(all(h,'[data-resource-card]').length,1);assert.match(q(h,'resource-results').textContent,/Student Recreation Center/);
  q(h,'resource-category').value='Technology';q(h,'resource-category').trigger('change');assert.ok(q(h,'empty-reset'));q(h,'empty-reset').click();assert.equal(all(h,'[data-resource-card]').length,32);
  all(h,'[data-quick-query]').find(b=>b.dataset.quickQuery==='food').click();assert.ok(all(h,'[data-resource-card]').length>1);assert.match(h.location.href,/q=food/);noErrors(h);
 }finally{h.dispose();}
});
test('resource bookmarks persist, filter, and survive a fresh page',async()=>{
 const h=await launchPage('resources.html');let next;try{
  all(h,'[data-save]').find(b=>b.dataset.save==='pantry').click();q(h,'resource-saved').checked=true;q(h,'resource-saved').trigger('change');assert.equal(all(h,'[data-resource-card]').length,1);assert.match(q(h,'resource-results').textContent,/Food Pantry/);
  next=await launchPage('resources.html',{url:h.location.href,storage:Object.fromEntries(h.storage)});assert.equal(all(next,'[data-resource-card]').length,1);noErrors(h);noErrors(next);
 }finally{h.dispose();next?.dispose();}
});
test('resource details expose real contact info and selecting Map updates the embedded building search',async()=>{
 const h=await launchPage('resources.html');try{
  all(h,'[data-details]').find(b=>b.dataset.details==='pantry').click();assert.equal(q(h,'resource-dialog').open,true);assert.match(q(h,'resource-dialog-body').textContent,/Valera NEST/);assert.ok(q(h,'resource-dialog-body').querySelector('a[href="tel:8186772730"]'));
  q(h,'detail-show-map').click();assert.equal(q(h,'resource-dialog').open,false);assert.match(q(h,'resource-map').src,/University%20Student%20Union/);assert.match(q(h,'map-location').textContent,/Valera NEST/);assert.equal(q(h,'map-resource').value,'pantry');noErrors(h);
 }finally{h.dispose();}
});
test('resource deep links open details while malicious query text stays plain text',async()=>{
 const h=await launchPage('resources.html',{url:'https://site.test/pages/resources.html?resource=it&q=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E'});try{assert.equal(q(h,'resource-dialog').open,true);assert.equal(q(h,'resource-dialog-title').textContent,'IT Help Center');assert.equal(all(h,'img').length,0);noErrors(h);}finally{h.dispose();}
});
test('blocked or corrupt browser storage does not break the finder or security tools',async()=>{
 for(const page of ['resources.html','cybersecurity.html']){const h=await launchPage(page,{storageBlocked:true});try{noErrors(h);if(page==='resources.html'){all(h,'[data-save]')[0].click();assert.match(q(h,'st-toast').textContent,/unavailable/);}else{const box=all(h,'[data-security-check]')[0];box.checked=true;box.trigger('change');assert.match(q(h,'st-toast').textContent,/unavailable/);}noErrors(h);}finally{h.dispose();}}
});
test('cybersecurity finder searches real directory records and scams filter by type',async()=>{
 const h=await launchPage('cybersecurity.html');try{
  q(h,'cyber-resource-query').value='gym';q(h,'cyber-resource-query').trigger('input');assert.match(q(h,'cyber-resource-results').textContent,/Student Recreation Center/);
  q(h,'scam-category').value='Impersonation';q(h,'scam-category').trigger('change');assert.equal(all(h,'.st-scam-card').length,1);assert.match(q(h,'scam-grid').textContent,/gift cards/);
  q(h,'incident-type').value='credentials';q(h,'incident-type').trigger('change');assert.match(q(h,'incident-guidance').textContent,/Change the affected password/);noErrors(h);
 }finally{h.dispose();}
});
test('security checklist saves independently of the mapper and training state',async()=>{
 const h=await launchPage('cybersecurity.html');try{const box=all(h,'[data-security-check]')[0];box.checked=true;box.trigger('change');assert.match(q(h,'security-progress').textContent,/1 \/ 6/);assert.ok(h.storage.has('csun-reimagined:security-checklist:v1'));assert.equal(h.storage.has('csun-reimagined:program-mapper:v4'),false);noErrors(h);}finally{h.dispose();}
});
test('simulator shows feedback, locks the first answer and resumes on another page',async()=>{
 const h=await launchPage('phishing-simulator.html');let next;try{
  const answer=all(h,'[data-answer]').find(b=>b.dataset.answer==='legitimate');answer.click();assert.match(q(h,'training-feedback').textContent,/useful one to review/);assert.ok(all(h,'[data-answer]').every(b=>b.disabled));
  all(h,'[data-answer]').find(b=>b.dataset.answer==='phishing').click();let saved=JSON.parse(h.storage.get('csun-reimagined:phishing:v1'));assert.equal(saved.answers.expiry,'legitimate');
  q(h,'training-next').click();saved=JSON.parse(h.storage.get('csun-reimagined:phishing:v1'));assert.equal(saved.index,1);
  next=await launchPage('cybersecurity.html',{storage:Object.fromEntries(h.storage)});assert.match(q(next,'phishing-app').textContent,/Message 2 of 8/);noErrors(h);noErrors(next);
 }finally{h.dispose();next?.dispose();}
});
test('all eight practice messages complete with computed score, review and restart',async()=>{
 const h=await launchPage('phishing-simulator.html');try{
  for(const s of core.SCENARIOS){all(h,'[data-answer]').find(b=>b.dataset.answer===s.answer).click();assert.ok(q(h,'training-feedback'));q(h,'training-next').click();}
  assert.match(q(h,'phishing-app').textContent,/8 of 8/);assert.equal(all(h,'[data-review-scenario]').length,8);assert.equal(q(h,'training-retry'),null);q(h,'training-restart').click();assert.match(q(h,'phishing-app').textContent,/0 answered/);assert.equal(q(h,'training-feedback'),null);noErrors(h);
 }finally{h.dispose();}
});
test('practice does not activate example links, request credentials or send network requests',()=>{
 const code=fs.readFileSync(path.join(site,'js/pages/phishing-simulator.js'),'utf8');assert.equal(/fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/.test(code),false);
 for(const page of ['cybersecurity.html','phishing-simulator.html']){const html=fs.readFileSync(path.join(site,'pages',page),'utf8');assert.equal(/type="password"|type="email"/.test(html),false);}
 assert.ok(core.SCENARIOS.some(s=>s.answer==='legitimate'));assert.ok(core.SCENARIOS.some(s=>s.from.endsWith('@csun.edu')&&s.answer==='phishing'));
});

test('a filtered-out map selection resets to the campus overview',async()=>{
 const h=await launchPage('resources.html');try{
  all(h,'[data-map]').find(b=>b.dataset.map==='pantry').click();assert.equal(q(h,'map-resource').value,'pantry');
  q(h,'resource-search').value='gym';q(h,'resource-search').trigger('input');assert.equal(q(h,'map-resource').value,'');assert.match(q(h,'map-location').textContent,/campus overview/);noErrors(h);
 }finally{h.dispose();}
});
test('missed-message practice preserves correct work and recomputes the final result',async()=>{
 const h=await launchPage('phishing-simulator.html');try{
  for(const [i,s] of core.SCENARIOS.entries()){all(h,'[data-answer]').find(b=>b.dataset.answer===(i===0?'legitimate':s.answer)).click();q(h,'training-next').click();}
  assert.match(q(h,'phishing-app').textContent,/7 of 8/);q(h,'training-retry').click();assert.match(q(h,'phishing-app').textContent,/7 answered/);
  all(h,'[data-answer]').find(b=>b.dataset.answer==='phishing').click();q(h,'training-next').click();assert.match(q(h,'phishing-app').textContent,/8 of 8/);noErrors(h);
 }finally{h.dispose();}
});
test('a corrupted saved cursor cannot present an unearned practice-complete result',async()=>{
 const h=await launchPage('phishing-simulator.html',{storage:{'csun-reimagined:phishing:v1':JSON.stringify({index:8,answers:{expiry:'phishing'}})}});try{
  assert.match(q(h,'phishing-app').textContent,/Message 2 of 8/);assert.equal(q(h,'training-retry'),null);noErrors(h);
 }finally{h.dispose();}
});
test('all named entry-module imports resolve to actual shared exports',()=>{
 for(const file of ['resource-finder.js','cybersecurity.js','phishing-simulator.js']){
  const text=fs.readFileSync(path.join(site,'js/pages',file),'utf8'),names=text.match(/^import \{([^}]+)\}/)[1].split(',').map(s=>s.trim().split(/\s+as\s+/)[0]);
  for(const name of names)assert.ok(Object.hasOwn(core,name),file+': '+name);
 }
});
