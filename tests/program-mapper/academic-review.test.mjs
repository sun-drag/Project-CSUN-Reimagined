import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as m from '../../js/pages/program-mapper-core.mjs';
import {buildPlan} from '../../js/pages/program-mapper-catalog.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../../data/program-mapper/catalog.json',import.meta.url)));
const allNodes=n=>[n,...(n.children||[]).flatMap(allNodes),...(n.options||[]).flatMap(o=>allNodes(o.rule))];
const programRule=id=>data.requirements.find(r=>r.program_id===id).rule;
const plan=(id,selections={})=>buildPlan(data,{major_id:id,selections});

test('no program or minor receives an automatic curriculum choice',()=>{
  for(const p of data.programs){const s=m.initialState();if(p.type==='major')s.settings.major=p.program_id;else s.settings.minor=p.program_id;
    assert.deepEqual(m.withSuggestedPaths(data,s).selections,{},p.name);}
});
test('CIT math remains one 3–5 unit choice and does not duplicate GE mathematics',()=>{
  const p=m.derivePlan(data,m.initialState()),slot=p.items.find(c=>c.choiceId==='cit-math');
  assert.ok(slot);assert.equal(slot.units_min,3);assert.equal(slot.units_max,5);
  for(const id of ['MATH-103','MATH-150A','MATH-255A'])assert.equal(p.items.some(c=>c.id===id),false);
  assert.equal(p.items.some(c=>c.geArea==='2-LD'),false);
  assert.ok(p.baseAreas.find(a=>a.area_id==='2-LD').reserved_by_choices.includes('cit-math'));
  assert.equal(p.checklist.planning_complete,false);
});
test('each of CIT’s official math alternatives can be selected independently',()=>{
  for(const id of ['MATH-103','MATH-150A','MATH-255A']){
    const s=m.initialState();s.selections['cit-math']=id;s.selections['cit-programming']='comp110';
    const p=m.derivePlan(data,s);assert.deepEqual(p.items.filter(c=>['MATH-103','MATH-150A','MATH-255A'].includes(c.id)).map(c=>c.id),[id]);
    assert.equal(p.items.some(c=>c.geArea==='2-LD'),false);
  }
});
test('CIT programming route reserves four to six units and leaves both routes unselected',()=>{
  const p=m.derivePlan(data,m.initialState()),slot=p.items.find(c=>c.choiceId==='cit-programming');
  assert.equal(slot.units_min,4);assert.equal(slot.units_max,6);
  assert.equal(p.items.some(c=>c.id==='COMP-110/L'),false);
});
test('the unselected CIT reference reserves 15 minimum-estimate units per semester',()=>{
  const state=m.autoSchedule(data,m.initialState()),derived=m.derivePlan(data,state);
  assert.deepEqual(derived.terms.map(t=>derived.items.filter(c=>state.positions[c.id]===t.id).reduce((sum,c)=>sum+m.courseUnits(c),0)),Array(8).fill(15));
});
test('legacy saves require explicit confirmation while retaining completed work and notes',()=>{
  const s=m.initialState();s.schemaVersion=1;s.selections={'cit-math':'MATH-103','cit-programming':'comp110'};s.completed=['CIT-101/L'];s.notes['CIT-101/L']='Transfer reviewed';
  const restored=m.importPlan(JSON.stringify(s),data);assert.equal(restored.schemaVersion,2);assert.deepEqual(restored.selections,{});
  assert.equal(restored.legacySelections['cit-math'],'MATH-103');assert.deepEqual(restored.completed,s.completed);assert.deepEqual(restored.notes,s.notes);
});
test('unselected prerequisite alternatives never enroll the first option automatically',()=>{
  const s=m.initialState();s.selections['cit-programming']='comp110';
  const p=m.derivePlan(data,s);assert.ok(p.pendingPrerequisites.some(c=>c.course_id==='COMP-110/L'));
  assert.equal(p.items.some(c=>c.id==='MATH-102'),false);assert.equal(p.items.some(c=>c.id==='MATH-103'),false);
  const choice=p.pendingPrerequisites.find(c=>c.course_id==='COMP-110/L');
  s.prerequisiteSelections[choice.choice_id]=choice.options.find(o=>o.label.includes('MATH 105')).id;
  const selected=m.derivePlan(data,s);assert.ok(selected.items.some(c=>c.id==='MATH-105'));
  assert.equal(selected.items.some(c=>c.id==='MATH-102'),false);
  assert.ok(selected.prerequisiteChoices.some(c=>c.choice_id===choice.choice_id));
});
test('course prerequisites take priority and surface the CIT sample-roadmap conflict',()=>{
  const s=m.initialState();s.selections['cit-math']='MATH-103';s.selections['cit-programming']='comp110';
  const scheduled=m.autoSchedule(data,s),d=m.derivePlan(data,scheduled),terms=d.terms.map(t=>t.id);
  assert.ok(terms.indexOf(scheduled.positions['MATH-103'])<terms.indexOf(scheduled.positions['COMP-110/L']));
  assert.ok(m.validatePlan(data,scheduled,d).some(i=>i.kind==='source-conflict'&&i.id==='COMP-110/L'));
});
test('all linked official four-year roadmap references have complete captured semester sections',()=>{
  assert.equal(data.roadmaps.length,156);assert.equal(new Set(data.roadmaps.map(r=>r.program_id)).size,139);
  for(const r of data.roadmaps){assert.ok(r.academic_lines_complete,r.source_url);assert.ok(r.semesters.length>=7,r.source_url);assert.match(r.source_url,/^https:\/\/catalog\.csun\.edu\//);}
});
test('English extended study is a single emphasis choice, not all eight emphases',()=>{
  const id='english-b-a-subject-matter-program-for-the-single-subject-credential-option',p=plan(id);
  assert.ok(p.choices.some(c=>c.choice_id===id+':extended-study'));
  for(const c of ['LING-417','AAS-321','ENGL-306','ENGL-368','TH-111'])assert.equal(p.required_courses.some(r=>r.course_id===c),false,c);
  const chosen=plan(id,{[id+':extended-study']:'emphasis-2'});assert.ok(chosen.required_courses.some(c=>c.course_id==='ENGL-208'));
  assert.ok(chosen.choices.some(c=>c.choice_id===id+':writing-300'));assert.equal(chosen.required_courses.some(c=>c.course_id==='LING-417'),false);
});
test('environmental science requires two elective options from each category',()=>{
  const id='environmental-science-b-a',key=id+':110:categories';
  const bad=plan(id,{[key]:['option-1','option-2','option-3','option-4']});
  assert.ok(bad.choices.find(c=>c.choice_id===key).missing_subsets.some(s=>s.label==='Social science electives'));
  const good=plan(id,{[key]:['option-1','option-2','option-19','option-20']});
  assert.equal(good.choices.some(c=>c.choice_id===key),false);
});
test('kinesiology alternative biology paths remain distinct choices',()=>{
  for(const p of data.programs.filter(p=>p.program_id.startsWith('kinesiology-b-s-'))){
    const route=allNodes(programRule(p.program_id)).find(n=>n.choice_id===p.program_id+':biology-route');
    if(!route)continue;
    assert.equal(route.options.length,2);const result=plan(p.program_id);
    assert.equal(result.required_courses.some(c=>c.course_id==='BIOL-382/L'),false,p.name);
    assert.ok(result.choices.some(c=>c.choice_id===route.choice_id));
  }
});
test('Kinesiology Dance uses 25 approved units instead of every dance elective',()=>{
  const p=plan('kinesiology-b-s-dance-option');assert.ok(p.choices.some(c=>c.minimum_units===25&&c.approval_needed));
  assert.equal(p.required_courses.some(c=>c.course_id==='DANC-426'),false);
});
test('numbered CHS and Deaf Studies alternative lists stay optional until selected',()=>{
  const chs=plan('chicano-and-chicana-studies-b-a-chicana-o-studies-social-science-subject-matter-waiver-program-option');
  assert.equal(chs.required_courses.some(c=>c.course_id==='AIS-304'),false);
  const deaf=plan('deaf-studies-b-a');assert.equal(deaf.required_courses.some(c=>c.course_id==='DEAF-300'),false);
  assert.ok(deaf.choices.some(c=>c.minimum_count===2&&c.minimum_units===6));
});
test('CTVA management footnote restricts the common-core selection',()=>{
  const id='cinema-and-television-arts-b-a-entertainment-media-management-option',key=id+':71:pool1';
  const node=allNodes(programRule(id)).find(n=>n.choice_id===key);
  assert.deepEqual(node.options.map(o=>o.rule.course_id),['CTVA-351','CTVA-482']);
  assert.ok(plan(id,{[key]:['option-2']}).errors.length);
});
test('CIT offers eligible upper-division electives and a separately approved domain package',()=>{
  let s=m.initialState();let descriptors=m.choiceDescriptors(data,s);const route=descriptors.find(c=>c.choice_id==='cit-domain:route');assert.equal(route.options.length,2);
  s.selections['cit-domain:route']='approved-package';descriptors=m.choiceDescriptors(data,s);const approved=descriptors.find(c=>c.choice_id==='cit-domain:approved');
  assert.ok(approved.approval_needed);assert.equal(approved.maximum_lower_division_units,6);assert.equal(approved.ge_overlap_allowed,false);
});
test('mapper header, navigation destinations and footer match index.html',()=>{
  const index=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8'),html=fs.readFileSync(new URL('../../pages/program-mapper.html',import.meta.url),'utf8');
  const section=(s,tag,cls)=>s.match(new RegExp(`<${tag}[^>]*class="${cls}"[\\s\\S]*?<\\/${tag}>`))?.[0];
  assert.equal(section(html,'header','site-header'),section(index,'header','site-header'));
  const links=s=>[...s.matchAll(/<a[^>]*href="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>/g)].map(m=>[m[1].replace(/^\.\.\//,'').replace(/^pages\//,''),m[2].trim()]);
  assert.deepEqual(links(section(html,'nav','main-nav')),links(section(index,'nav','main-nav')));
  assert.equal(section(html,'footer','site-footer'),section(index,'footer','site-footer'));
  assert.match(html,/href="\.\.\/css\/main.css"/);
});

test('all source-derived alternative pools remain represented or have a reviewed source disposition',()=>{
  const evidence=JSON.parse(fs.readFileSync(new URL('./source-choice-pools.json',import.meta.url)));
  const audit=JSON.parse(fs.readFileSync(new URL('../../data/program-mapper/academic-audit.json',import.meta.url)));
  assert.equal(evidence.length,317);
  for(const fact of evidence){
    const rule=programRule(fact.program_id),ids=allNodes(rule).flatMap(n=>[...(n.course_id?[n.course_id]:[]),...(n.course_ids||[]),...(n.candidate_course_ids||[])]);
    const disposition=audit.reviewed_choice_flags.find(r=>r.program_id===fact.program_id&&r.source_line===fact.source_line);
    for(const id of fact.pool_ids)assert.ok(ids.includes(id)||disposition?.review_disposition,`${fact.program_id}: ${id}`);
  }
  assert.equal(audit.programs.length,158);assert.ok(audit.programs.every(p=>p.academic_source_section_complete));
});

test('a GE-eligible course in an approved domain package cannot also cover GE',()=>{
  const key='cit-domain:approved',p=buildPlan(data,{major_id:'cit-bs',selections:{'cit-domain:route':'approved-package',[key]:['ECON-160']},approved_choices:[key]});
  assert.ok(p.required_courses.find(c=>c.course_id==='ECON-160').exclude_from_ge);
  assert.equal(p.ge_requirements.find(a=>a.area_id==='4').covered_by_planned_courses.includes('ECON-160'),false);
});

test('summer and fifth-year reference sessions retain their own timing',()=>{
  const reference=data.roadmaps.find(r=>r.program_id==='radiologic-sciences-b-s');assert.ok(reference);
  assert.ok(reference.semesters.some(s=>s.season==='Summer'));assert.ok(reference.semesters.some(s=>s.year===5));
  const s=m.initialState();s.settings.major='radiologic-sciences-b-s';const issues=m.validatePlan(data,s);
  assert.ok(issues.some(i=>i.kind==='roadmap-horizon'));assert.ok(issues.some(i=>i.kind==='roadmap-session'));
});
