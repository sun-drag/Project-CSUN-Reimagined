import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as m from '../../js/pages/program-mapper-core.mjs';
import {buildPlan} from '../../js/pages/program-mapper-catalog.mjs';
import {launchHarness} from './dom-harness.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../../data/program-mapper/catalog.json',import.meta.url)));
const q=(h,id)=>h.document.getElementById(id);
const card=(h,id)=>h.document.querySelectorAll('.pm-course').find(c=>c.dataset.courseId===id);
const route=(value)=>{const s=m.initialState();s.selections['cit-domain:route']=value;return s;};
const sum=(rows)=>rows.reduce((n,c)=>n+m.plannedCourseUnits(c),0);

test('a manual move from a 15-unit roadmap semester to 18 units succeeds',()=>{
 const s=m.autoSchedule(data,m.initialState()),before=m.derivePlan(data,s),to='2027-spring';
 assert.equal(sum(before.items.filter(c=>s.positions[c.id]===to)),15);
 const moved=m.moveCourse(data,s,'CIT-101/L',to);assert.equal(moved.ok,true,moved.message);
 const after=m.derivePlan(data,moved.state);assert.equal(sum(after.items.filter(c=>moved.state.positions[c.id]===to)),18);
 assert.equal(after.terms.find(t=>t.id===to).target,15);assert.equal(m.validatePlan(data,moved.state).some(i=>i.kind==='load'),false);
});
test('a move over 18 units is rejected atomically, including linked courses',()=>{
 const s=m.autoSchedule(data,m.initialState()),first=m.moveCourse(data,s,'CIT-101/L','2027-spring');assert.equal(first.ok,true);
 const before=JSON.stringify(first.state),result=m.moveCourse(data,first.state,'CIT-256','2027-spring');
 assert.equal(result.ok,false);assert.match(result.message,/18/);assert.equal(JSON.stringify(first.state),before);
 const independent={metadata:{catalog_year:'test'},courses:Array.from({length:9},(_,i)=>({course_id:'X'+i,code:'X'+i,title:'Independent course',units_min:3,units_max:3,components:[{component_id:'X'+i,code:'X'+i,units_min:3,units_max:3}],ge_areas:[],level:'lower_division',prerequisites:{type:'NOT_STATED'},corequisites:{type:'NOT_STATED'}})),programs:[{program_id:'test',name:'Test major',type:'major',degree_unit_minimum:27}],requirements:[{program_id:'test',rule:{type:'ALL_OF',children:Array.from({length:9},(_,i)=>({type:'COURSE',course_id:'X'+i}))}}],ge_areas:[]};
 const linked=m.initialState();linked.settings.major='test';for(let i=0;i<9;i++)linked.positions['X'+i]=i<5?'2026-fall':'2027-spring';linked.links=[{id:'manual',kind:'corequisite',label:'Independent pair',members:['X5','X6']}];
 const snapshot=JSON.stringify(linked),grouped=m.moveCourse(independent,linked,'X5','2026-fall');assert.equal(grouped.ok,false);assert.match(grouped.message,/18/);assert.equal(JSON.stringify(linked),snapshot);
});
test('accelerated plans expose insufficient capacity rather than inventing 20- or 30-unit semesters',()=>{
 for(const years of [2,3]){const s=m.initialState();s.settings.years=years;const next=m.autoSchedule(data,s),p=m.derivePlan(data,next);
  assert.ok(p.terms.every(t=>t.limit===18));assert.ok(p.terms.every(t=>sum(p.items.filter(c=>next.positions[c.id]===t.id))<=18));
  assert.ok(m.validatePlan(data,next).some(i=>i.kind==='timeline-capacity'));
 }
 const s=m.initialState();s.settings.years=3;s.settings.summer=true;assert.equal(m.validatePlan(data,s).some(i=>i.kind==='timeline-capacity'),false);
});
test('a two-year transfer plan uses prior major credit while preserving prerequisite order',()=>{
 const s=m.initialState();s.settings.years=2;s.geCompleted=data.ge_areas.map(a=>a.area_id);s.selections['cit-math']='MATH-103';s.selections['cit-programming']='comp110';
 s.completed=['CIT-101/L','CIT-160/L','CIT-210/L','CIT-270/L','CIT-256','COMP-110/L','COMP-122/L','COMP-182/L','MATH-103'];
 const scheduled=m.autoSchedule(data,s),p=m.derivePlan(data,scheduled);
 assert.ok(p.terms.every(t=>t.limit===18));assert.equal(m.validatePlan(data,scheduled).some(i=>i.kind==='timeline-capacity'),false);
 assert.equal(p.items.filter(c=>!c.completed&&!scheduled.positions[c.id]).length,0);
 assert.equal(m.validatePlan(data,scheduled).filter(i=>i.severity==='error').length,0);
});
test('legacy 15-unit roadmap saves migrate to 18 without losing courses or selections',()=>{
 const s=route('approved-package');s.schemaVersion=3;s.settings.regularLimit=15;s.selections['cit-domain:approved']=['RE-414'];s.positions['CIT-101/L']='2026-fall';
 const next=m.importPlan(JSON.stringify(s),data);assert.equal(next.settings.regularLimit,18);assert.equal(next.schemaVersion,4);
 assert.deepEqual(next.selections,s.selections);assert.deepEqual(next.positions,s.positions);
 s.settings.loadMode='custom';s.settings.regularLimit=16;assert.equal(m.importPlan(JSON.stringify(s),data).settings.regularLimit,16);
 s.settings.regularLimit=30;assert.equal(m.importPlan(JSON.stringify(s),data).settings.regularLimit,18);
});
test('CIT package offers courses from every catalog department, independent of GE designation',()=>{
 const s=route('approved-package'),descriptor=m.choiceDescriptors(data,s).find(c=>c.choice_id==='cit-domain:approved');
 const pool=m.choiceCourseOptions(data,descriptor);assert.equal(pool.length,data.courses.length);
 assert.ok(pool.some(c=>c.code.startsWith('ART ')));
 for(const id of ['RE-414','ECON-160'])assert.ok(pool.some(c=>c.course_id===id),id);
 assert.equal(m.applyChoiceSelection(data,s,descriptor.choice_id,'RE-414').ok,true);
});
test('CIT package enforces six lower-division units and keeps approval unresolved',()=>{
 const s=route('approved-package');s.selections['cit-domain:approved']=['ECON-160','ECON-161'];
 let p=m.derivePlan(data,s);assert.ok(p.checklist.choices.find(c=>c.choice_id==='cit-domain:approved'&&!c.approval_confirmed));
 const third=m.applyChoiceSelection(data,s,'cit-domain:approved','PSY-150');assert.equal(third.ok,false);assert.match(third.message,/lower division/);
 assert.equal(m.applyChoiceSelection(data,s,'cit-domain:approved','RE-414').ok,true);
});
test('CIT package courses cannot double-count for GE, even after approval',()=>{
 const s=route('approved-package');s.selections['cit-domain:approved']=['ECON-160'];s.approvedChoices=['cit-domain:approved'];
 const p=m.derivePlan(data,s);assert.equal(p.checklist.ge_requirements.find(a=>a.area_id==='4').covered_by_planned_courses.includes('ECON-160'),false);
 s.geAssignments['ECON-160']='4';assert.ok(m.derivePlan(data,s).checklist.errors.some(e=>/cannot also be assigned to GE/.test(e)));
});
test('upper-division route excludes every prohibited course family and other departments',()=>{
 const s=route('cit-comp-electives'),descriptor=m.choiceDescriptors(data,s).find(c=>c.choice_id==='cit-domain'),pool=m.choiceCourseOptions(data,descriptor);
 assert.ok(pool.length>20);const exclusions=new Set(['COMP 300','COMP 482','COMP 484','COMP 485','COMP 490','COMP 491','COMP 492','COMP 494','COMP 499','COMP 502','COMP 505','CIT 360','CIT 384','CIT 425','CIT 480','CIT 481']);
 for(const c of pool){assert.match(c.code,/^(COMP|CIT) [345]\d\d/);for(const part of [c,...c.components])assert.equal(exclusions.has(part.code.replace(/\/L$/,'').replace(/(\d)L$/,'$1')),false,c.code);}
 for(const id of ['RE-414','COMP-485','COMP-490/L','COMP-484/L','CIT-360/L'])assert.equal(m.applyChoiceSelection(data,s,'cit-domain',id).ok,false,id);
 assert.equal(m.applyChoiceSelection(data,s,'cit-domain','COMP-310').ok,true);
});
test('approval flags cannot bypass the upper-division route exclusions in imported selections',()=>{
 const p=buildPlan(data,{major_id:'cit-bs',selections:{'cit-domain:route':'cit-comp-electives','cit-domain':['COMP-485']},approved_choices:['cit-domain']});
 assert.ok(p.errors.some(e=>/not eligible/.test(e)));
});
test('COMP 488 and CIT 488 share a single six-unit cap',()=>{
 const local=m.clone(data);for(const c of local.courses.filter(c=>['COMP-488','CIT-488'].includes(c.course_id))){c.units_min=4;c.units_max=4;for(const p of c.components)p.units_min=p.units_max=4;}
 const s=route('cit-comp-electives');s.selections['cit-domain']=['COMP-488'];const r=m.applyChoiceSelection(local,s,'cit-domain','CIT-488');
 assert.equal(r.ok,false);assert.match(r.message,/Combined course cap.*6/);
});
test('an eligible minor replaces the CIT domain block; CS and IS minors remain invalid',()=>{
 const s=route('approved-package');s.selections['cit-domain:approved']=['RE-414'];s.settings.minor='real-estate-minor';let p=m.derivePlan(data,s);
 assert.equal(m.choiceDescriptors(data,s).some(c=>c.choice_id.startsWith('cit-domain')),false);assert.equal(p.items.some(c=>c.choiceId?.startsWith('cit-domain')),false);
 assert.equal(p.items.filter(c=>c.id==='RE-414').length,1);
 for(const id of ['minor-in-computer-science','minor-in-information-systems']){s.settings.minor=id;p=m.derivePlan(data,s);assert.ok(p.checklist.errors.some(e=>/CIT cannot use/.test(e)));}
});

test('CIT route panel is before Year 1 and package picker includes non-CS departments',async()=>{
 const h=await launchHarness();try{
  const panel=q(h,'cit-domain-panel');assert.equal(panel.hidden,false);assert.ok(q(h,'mapper-app').innerHTML.indexOf('id="cit-domain-panel"')<q(h,'mapper-app').innerHTML.indexOf('class="pm-year"'));
  panel.querySelectorAll('[data-domain-route]').find(b=>b.dataset.domainRoute==='approved-package').trigger('change');
  q(h,'cit-domain-courses').click();assert.ok(q(h,'course-subject').querySelectorAll('option').some(o=>o.value==='RE'));
  q(h,'course-search').value='RE414';q(h,'course-search').trigger('input');h.document.querySelectorAll('[data-pick]').find(b=>b.dataset.pick==='RE-414').click();
  assert.ok(card(h,'RE-414'));assert.match(q(h,'cit-domain-panel').textContent,/3 \/ 15 units selected/);
  q(h,'picker-done').click();assert.equal(q(h,'mapper-dialog').open,false);assert.deepEqual(h.errors,[]);
 }finally{h.dispose();}
});
test('CIT upper-division picker is filtered and switching routes removes inactive selections',async()=>{
 const h=await launchHarness();try{
  const choose=value=>q(h,'cit-domain-panel').querySelectorAll('[data-domain-route]').find(b=>b.dataset.domainRoute===value).trigger('change');
  choose('approved-package');q(h,'cit-domain-courses').click();q(h,'course-search').value='RE414';q(h,'course-search').trigger('input');h.document.querySelectorAll('[data-pick]').find(b=>b.dataset.pick==='RE-414').click();q(h,'picker-done').click();
  choose('cit-comp-electives');assert.equal(!!card(h,'RE-414'),false);q(h,'cit-domain-courses').click();
  q(h,'course-search').value='COMP485';q(h,'course-search').trigger('input');assert.equal(q(h,'course-results').querySelectorAll('[data-pick]').length,0);
  q(h,'course-search').value='COMP310';q(h,'course-search').trigger('input');h.document.querySelectorAll('[data-pick]').find(b=>b.dataset.pick==='COMP-310').click();assert.ok(card(h,'COMP-310'));assert.deepEqual(h.errors,[]);
 }finally{h.dispose();}
});
test('minor route removes the extra CIT block and non-CIT programs hide the panel',async()=>{
 const h=await launchHarness();try{
  for(const id of ['minor-in-computer-science','minor-in-information-systems'])assert.ok(q(h,'minor-select').querySelectorAll('option').find(o=>o.value===id).disabled);
  q(h,'minor-select').value='real-estate-minor';q(h,'setup-form').trigger('submit');assert.match(q(h,'cit-domain-panel').textContent,/minor is your emphasis route/);assert.equal(q(h,'cit-domain-panel').querySelectorAll('[data-domain-route]').length,0);
  q(h,'major-select').value='biology-b-a';q(h,'major-select').trigger('change');q(h,'setup-form').trigger('submit');assert.equal(q(h,'cit-domain-panel').hidden,true);assert.deepEqual(h.errors,[]);
 }finally{h.dispose();}
});
test('real course Move handler allows 18 and refuses 21, with distinct suggestion text',async()=>{
 const h=await launchHarness();try{
  h.app.openCourse('CIT-101/L');q(h,'detail-term').value='2027-spring';q(h,'detail-move').click();
  assert.equal(h.app.state().positions['CIT-101/L'],'2027-spring');const term=h.document.querySelectorAll('[data-term-id]').find(t=>t.dataset.termId==='2027-spring');assert.match(term.querySelector('.pm-term-load').textContent,/18 \/ 18 units.*Suggested 15/);
  h.app.openCourse('CIT-256');const old=h.app.state().positions['CIT-256'];q(h,'detail-term').value='2027-spring';q(h,'detail-move').click();assert.equal(h.app.state().positions['CIT-256'],old);assert.match(q(h,'dialog-error').textContent,/18/);assert.deepEqual(h.errors,[]);
 }finally{h.dispose();}
});
test('linked cards have visible red-style hooks and red SVG arrow connections',async()=>{
 const h=await launchHarness();try{
  assert.ok(card(h,'CIT-101/L').classList.contains('has-course-links'));
  const paths=h.document.querySelectorAll('.pm-link-path');assert.ok(paths.length>10);assert.ok(paths.every(p=>p.getAttribute('marker-end')==='url(#pm-connection-arrow)'));
  assert.match(h.document.querySelector('#pm-connection-arrow').innerHTML,/#d71920/);
  q(h,'show-links').checked=false;q(h,'show-links').trigger('change');assert.equal(h.document.querySelectorAll('.pm-link-path').length,0);assert.equal(card(h,'CIT-101/L').classList.contains('has-course-links'),false);assert.deepEqual(h.errors,[]);
 }finally{h.dispose();}
});
