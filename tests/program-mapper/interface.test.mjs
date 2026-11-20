import test from 'node:test';
import assert from 'node:assert/strict';
import {launchHarness} from './dom-harness.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const q=(h,id)=>h.document.getElementById(id);
const findCard=(h,id)=>h.document.querySelectorAll('.pm-course').find(el=>el.dataset.courseId===id);

test('page boots with all programs, dated course cards and SVG relationship paths',async()=>{
  const h=await launchHarness();try{assert.equal(q(h,'major-select').querySelectorAll('option').length,158);assert.equal(q(h,'minor-select').querySelectorAll('option').length,108);assert.equal(h.document.querySelectorAll('.pm-term').length,8);assert.ok(h.document.querySelectorAll('.pm-course').length>30);assert.ok(h.document.querySelectorAll('.pm-link-path').length>10);assert.equal(q(h,'mapper-app').getAttribute('aria-busy'),'false');assert.equal(q(h,'load-error').hidden,true);assert.deepEqual(h.errors,[]);}finally{h.dispose();}
});
test('single-click opens an actual catalog description and official course link',async()=>{
  const h=await launchHarness();try{findCard(h,'CIT-360/L').click();await pause(300);assert.equal(q(h,'mapper-dialog').open,true);assert.equal(q(h,'dialog-title').textContent,'CIT 360/L');assert.match(q(h,'dialog-body').textContent,/enterprise system architecture/);assert.equal(h.document.querySelector('.pm-source-link').getAttribute('href'),'https://catalog.csun.edu/academics/comp/courses/cit-360l/');assert.deepEqual(h.errors,[]);}finally{h.dispose();}
});
test('double-click marks completion, and the real Undo handler restores it',async()=>{
  const h=await launchHarness();try{const c=findCard(h,'CIT-101/L');c.click();c.click();c.trigger('dblclick');assert.ok(h.app.state().completed.includes('CIT-101/L'));assert.equal(q(h,'mapper-dialog').open,false);q(h,'undo-button').click();assert.equal(h.app.state().completed.includes('CIT-101/L'),false);assert.deepEqual(h.errors,[]);}finally{h.dispose();}
});
test('GE checklist and eligible-course picker replace the B2/5B requirement card',async()=>{
  const h=await launchHarness();try{q(h,'ge-all').checked=true;q(h,'ge-all').trigger('change');const b=h.document.querySelectorAll('[data-ge]').find(b=>b.dataset.ge==='5B');b.checked=false;b.trigger('change');assert.deepEqual(Array.from(h.app.derived().items.filter(c=>c.geArea).map(c=>c.geArea)),['5B']);findCard(h,'ge:5B:0').click();await pause(300);assert.match(q(h,'dialog-title').textContent,/5B \/ B2/);const pick=h.document.querySelectorAll('[data-pick]').find(b=>b.dataset.pick==='BIOL-101');assert.ok(pick);pick.click();assert.ok(findCard(h,'BIOL-101'));assert.equal(!!findCard(h,'ge:5B:0'),false);assert.equal(h.app.state().geAssignments['BIOL-101'],'5B');assert.deepEqual(h.errors,[]);}finally{h.dispose();}
});
test('course selection creates a corequisite group and the Move control moves both',async()=>{
  const h=await launchHarness();try{for(const id of ['CIT-101/L','CIT-160/L'])findCard(h,id).querySelector('[data-select]').click();assert.equal(q(h,'selection-bar').hidden,false);q(h,'create-link-button').click();q(h,'link-kind').value='corequisite';q(h,'link-name').value='First-year foundations';q(h,'link-form').trigger('submit');assert.equal(h.app.state().links.length,1);h.app.openCourse('CIT-101/L');q(h,'detail-term').value='2027-spring';q(h,'detail-move').click();assert.equal(h.app.state().positions['CIT-101/L'],'2027-spring');assert.equal(h.app.state().positions['CIT-160/L'],'2027-spring');assert.deepEqual(h.errors,[]);}finally{h.dispose();}
});
test('drag/drop event wiring moves a card through the same validation path',async()=>{
  const h=await launchHarness();try{const card=findCard(h,'CIT-160/L'),dataTransfer={setData(){},effectAllowed:'',dropEffect:''};card.trigger('dragstart',{dataTransfer});const term=h.document.querySelectorAll('[data-term-id]').find(t=>t.dataset.termId==='2027-spring');term.trigger('dragover',{dataTransfer,clientY:300});term.trigger('drop',{dataTransfer});assert.equal(h.app.state().positions['CIT-160/L'],'2027-spring');assert.deepEqual(h.errors,[]);}finally{h.dispose();}
});
test('locked course moves display a rejection and keep their original semester',async()=>{
  const h=await launchHarness();try{h.app.openCourse('CIT-160/L');q(h,'detail-lock').click();const original=h.app.state().positions['CIT-160/L'];q(h,'detail-term').value='2027-spring';q(h,'detail-move').click();assert.equal(h.app.state().positions['CIT-160/L'],original);assert.match(q(h,'dialog-error').textContent,/locked/);assert.deepEqual(h.errors,[]);}finally{h.dispose();}
});
test('program and timeline controls rebuild with a minor and optional dated sessions',async()=>{
  const h=await launchHarness();try{q(h,'minor-select').value='real-estate-minor';q(h,'start-year').value='2027';q(h,'include-summer').checked=true;q(h,'include-winter').checked=true;q(h,'setup-form').trigger('submit');assert.equal(h.app.state().settings.minor,'real-estate-minor');assert.ok(findCard(h,'RE-414'));const terms=h.app.derived().terms;assert.equal(terms.length,16);assert.equal(terms[0].id,'2027-fall');assert.equal(terms[1].id,'2028-winter');assert.deepEqual(h.errors,[]);}finally{h.dispose();}
});
test('specific winter term can be added without replacing existing positions',async()=>{
  const h=await launchHarness();try{const original=h.app.state().positions['CIT-160/L'];q(h,'add-term-button').click();q(h,'new-term-season').value='Winter';q(h,'new-term-year').value='2028';q(h,'term-form').trigger('submit');assert.ok(h.app.derived().terms.some(t=>t.id==='2028-winter'));assert.equal(h.app.state().positions['CIT-160/L'],original);assert.deepEqual(h.errors,[]);}finally{h.dispose();}
});
test('program-choice controls remain editable after a selection is resolved',async()=>{
  const h=await launchHarness();try{q(h,'choices-button').click();const select=h.document.querySelectorAll('[data-choice-path]').find(x=>x.dataset.choicePath==='cit-math');assert.ok(select);select.value='MATH-150A';select.trigger('change');assert.ok(findCard(h,'MATH-150A'));assert.equal(!!findCard(h,'MATH-103'),false);assert.equal(h.app.state().selections['cit-math'],'MATH-150A');assert.deepEqual(h.errors,[]);}finally{h.dispose();}
});
test('custom course form escapes markup, saves notes and survives browser-save restoration',async()=>{
  const h=await launchHarness();let restored;try{q(h,'add-course-button').click();q(h,'custom-course-button').click();q(h,'custom-code').value='CIT 499';q(h,'custom-title').value='<img src=x onerror=alert(1)> Test';q(h,'custom-description').value='A student-defined course';q(h,'custom-units').value='3';q(h,'custom-course-form').trigger('submit');const c=h.app.state().customCourses[0];assert.ok(c);assert.ok(findCard(h,c.course_id));assert.equal(h.document.querySelectorAll('img').length,0);q(h,'detail-notes').value='Meet advisor';q(h,'detail-save-notes').click();assert.equal(h.app.state().notes[c.course_id],'Meet advisor');await pause(250);const saved=h.storage.get('csun-reimagined:program-mapper:v3');assert.ok(saved);restored=await launchHarness(saved);assert.ok(findCard(restored,c.course_id));assert.equal(restored.app.state().notes[c.course_id],'Meet advisor');assert.deepEqual(h.errors,[]);assert.deepEqual(restored.errors,[]);}finally{h.dispose();restored?.dispose();}
});
test('removing a required course and restoring it through Plan check work',async()=>{
  const h=await launchHarness();try{h.app.openCourse('CIT-160/L');q(h,'detail-remove').click();q(h,'confirm-remove').click();assert.equal(!!findCard(h,'CIT-160/L'),false);q(h,'check-button').click();const restore=h.document.querySelectorAll('[data-restore]').find(b=>b.dataset.restore==='CIT-160/L');assert.ok(restore);restore.click();assert.ok(findCard(h,'CIT-160/L'));assert.deepEqual(h.errors,[]);}finally{h.dispose();}
});
test('export and print tools invoke downloads and print through their real handlers',async()=>{
  const h=await launchHarness();try{q(h,'export-button').click();assert.equal(h.document.downloads[0].filename,'csun-program-plan.json');q(h,'more-button').click();q(h,'tool-csv').click();assert.equal(h.document.downloads[1].filename,'csun-program-plan.csv');q(h,'tool-print').click();assert.equal(h.document.printed,true);assert.deepEqual(h.errors,[]);}finally{h.dispose();}
});
test('course search accepts compact course codes without a space',async()=>{
  const h=await launchHarness();try{q(h,'add-course-button').click();q(h,'course-search').value='CIT384';q(h,'course-search').trigger('input');assert.ok(h.document.querySelectorAll('[data-pick]').some(b=>b.dataset.pick==='CIT-384/L'));assert.deepEqual(h.errors,[]);}finally{h.dispose();}
});
test('plan file import uses the actual file input handler and refreshes the plan name',async()=>{
  const h=await launchHarness();try{const saved=h.app.state();saved.name='Imported graduation plan';q(h,'import-file').files=[{size:JSON.stringify(saved).length,text:async()=>JSON.stringify({plan:saved})}];await q(h,'import-file').onchange({target:q(h,'import-file')});assert.equal(h.app.state().name,'Imported graduation plan');assert.equal(q(h,'plan-name').value,'Imported graduation plan');assert.deepEqual(h.errors,[]);}finally{h.dispose();}
});

test('CIT starts with a visible math choice and an empty course selection',async()=>{
  const h=await launchHarness();try{
    assert.equal(!!findCard(h,'MATH-103'),false);
    const slot=h.app.derived().items.find(c=>c.choiceId==='cit-math');assert.ok(findCard(h,slot.id));
    assert.match(findCard(h,slot.id).textContent,/MATH 103.*MATH 150A.*MATH 255A/);
    q(h,'choices-button').click();const select=h.document.querySelectorAll('[data-choice-path]').find(s=>s.dataset.choicePath==='cit-math');
    assert.equal(select.value,'');assert.match(select.textContent,/MATH 150A · 5 units/);assert.deepEqual(h.errors,[]);
  }finally{h.dispose();}
});
test('the official catalog and selected semester reference are linked on the plan',async()=>{
  const h=await launchHarness();try{
    const links=q(h,'academic-sources').querySelectorAll('a').map(a=>a.getAttribute('href'));
    assert.ok(links.includes('https://catalog.csun.edu/academics/comp/programs/bs-computer-information-technology/'));
    assert.ok(links.includes('https://catalog.csun.edu/resource/road-map/2025/computer-information-technology-2025-2025/'));
    assert.equal(h.document.querySelector('.main-nav').querySelectorAll('a').length,6);assert.deepEqual(h.errors,[]);
  }finally{h.dispose();}
});
test('an older save exposes its automatic selections for review',async()=>{
  const first=await launchHarness();const saved=first.app.state();first.dispose();saved.schemaVersion=1;saved.selections={'cit-math':'MATH-103'};
  const h=await launchHarness(JSON.stringify(saved));try{
    assert.equal(q(h,'choice-migration-notice').hidden,false);assert.equal(!!findCard(h,'MATH-103'),false);
    q(h,'review-imported-choices').click();const select=h.document.querySelectorAll('[data-choice-path]').find(s=>s.dataset.choicePath==='cit-math');
    select.value='MATH-103';select.trigger('change');assert.ok(findCard(h,'MATH-103'));
    assert.equal(q(h,'choice-migration-notice').hidden,true);assert.deepEqual(h.errors,[]);
  }finally{h.dispose();}
});

test('checking all GE uses prior credit instead of recreating the GE as electives',async()=>{
 const h=await launchHarness();try{
  q(h,'ge-all').checked=true;q(h,'ge-all').trigger('change');const d=h.app.derived();
  assert.equal(d.ledger.otherPriorUnits,37);assert.equal(d.ledger.degreeElectiveUnits,3);
  assert.equal(d.items.filter(c=>c.roles.includes('elective')).reduce((s,c)=>s+c.units_min,0),3);
  assert.equal(d.items.some(c=>c.geArea),false);assert.match(q(h,'credit-summary').textContent,/3 additional degree-elective units/);
  assert.match(q(h,'credit-summary').textContent,/37 estimated GE/);assert.deepEqual(h.errors,[]);
 }finally{h.dispose();}
});
test('a selected CIT domain course replaces its box and can be replaced without losing other choices',async()=>{
 const h=await launchHarness();try{
  q(h,'choices-button').click();const route=h.document.querySelectorAll('[data-choice-path]').find(s=>s.dataset.choicePath==='cit-domain:route');
  route.value='cit-comp-electives';route.trigger('change');q(h,'close-dialog').click();
  let slot=h.app.derived().items.find(c=>c.choiceId==='cit-domain'),term=h.app.state().positions[slot.id];h.app.openCourse(slot.id);
  h.document.querySelectorAll('[data-pick]').find(b=>b.dataset.pick==='COMP-310').click();
  assert.ok(findCard(h,'COMP-310'));assert.equal(h.app.state().positions['COMP-310'],term);assert.equal(h.app.derived().items.filter(c=>c.choiceId==='cit-domain').length,4);
  slot=h.app.derived().items.find(c=>c.choiceId==='cit-domain');h.app.openCourse(slot.id);h.document.querySelectorAll('[data-pick]').find(b=>b.dataset.pick==='COMP-380/L').click();
  const otherTerm=h.app.state().positions['COMP-380/L'];h.app.openCourse('COMP-310');q(h,'detail-replace-selection').click();h.document.querySelectorAll('[data-pick]').find(b=>b.dataset.pick==='COMP-524').click();
  assert.ok(findCard(h,'COMP-524'));assert.ok(findCard(h,'COMP-380/L'));assert.equal(!!findCard(h,'COMP-310'),false);
  assert.equal(h.app.state().positions['COMP-380/L'],otherTerm);assert.equal(h.app.derived().items.filter(c=>c.choiceId==='cit-domain').length,3);assert.deepEqual(h.errors,[]);
 }finally{h.dispose();}
});
test('four-year loads follow the guide until the user explicitly chooses a custom maximum',async()=>{
 const h=await launchHarness();try{
  assert.ok(h.app.derived().terms.every(t=>t.limit===15));assert.equal(q(h,'regular-limit').disabled,true);
  q(h,'load-mode').value='custom';q(h,'load-mode').trigger('change');q(h,'regular-limit').value='21';q(h,'setup-form').trigger('submit');
  assert.ok(h.app.derived().terms.every(t=>t.limit===21));assert.equal(h.app.state().settings.loadMode,'custom');assert.deepEqual(h.errors,[]);
 }finally{h.dispose();}
});
test('adding an optional course beyond the remaining degree credits is rejected',async()=>{
 const h=await launchHarness();try{
  q(h,'ge-all').checked=true;q(h,'ge-all').trigger('change');q(h,'choices-button').click();const math=h.document.querySelectorAll('[data-choice-path]').find(s=>s.dataset.choicePath==='cit-math');math.value='MATH-150A';math.trigger('change');q(h,'close-dialog').click();
  assert.equal(h.app.derived().ledger.degreeElectiveUnits,1);q(h,'add-course-button').click();q(h,'course-search').value='AAS100';q(h,'course-search').trigger('input');h.document.querySelectorAll('[data-pick]').find(b=>b.dataset.pick==='AAS-100').click();
  assert.match(q(h,'dialog-error').textContent,/beyond your remaining degree requirements/);assert.equal(!!findCard(h,'AAS-100'),false);assert.deepEqual(h.errors,[]);
 }finally{h.dispose();}
});
test('a multiple-option requirement replaces individual course boxes without clearing its other choices',async()=>{
 const h=await launchHarness();try{
  q(h,'major-select').value='environmental-science-b-a';q(h,'major-select').trigger('change');q(h,'setup-form').trigger('submit');
  const choiceId='environmental-science-b-a:110:categories';let slot=h.app.derived().items.find(c=>c.choiceId===choiceId);h.app.openCourse(slot.id);
  h.document.querySelectorAll('[data-slot-option]').find(b=>b.dataset.slotOption==='option-2').click();assert.ok(findCard(h,'BIOL-322'));
  slot=h.app.derived().items.find(c=>c.choiceId===choiceId);h.app.openCourse(slot.id);h.document.querySelectorAll('[data-slot-option]').find(b=>b.dataset.slotOption==='option-19').click();
  assert.ok(findCard(h,'ANTH-432'));h.app.openCourse('BIOL-322');q(h,'detail-replace-selection').click();h.document.querySelectorAll('[data-slot-option]').find(b=>b.dataset.slotOption==='option-3').click();
  assert.ok(findCard(h,'EOH-356A'));assert.ok(findCard(h,'ANTH-432'));assert.deepEqual(Array.from(h.app.state().selections[choiceId]).sort(),['option-19','option-3']);assert.deepEqual(h.errors,[]);
 }finally{h.dispose();}
});
test('program credit-review boxes open their source guidance instead of a free-elective picker',async()=>{
 const h=await launchHarness();try{
  q(h,'major-select').value='biology-b-a';q(h,'major-select').trigger('change');q(h,'setup-form').trigger('submit');
  const box=h.app.derived().items.find(c=>c.programReview);assert.ok(box);h.app.openCourse(box.id);
  assert.equal(q(h,'dialog-title').textContent,'Confirm these program requirements');assert.match(q(h,'dialog-body').textContent,/program-specific requirements/);assert.equal(q(h,'course-search'),null);assert.deepEqual(h.errors,[]);
 }finally{h.dispose();}
});
