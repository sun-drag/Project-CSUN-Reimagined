import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as m from '../../js/pages/program-mapper-core.mjs';
import {buildPlan} from '../../js/pages/program-mapper-catalog.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../../data/program-mapper/catalog.json',import.meta.url)));
const total=items=>items.reduce((s,c)=>s+m.courseUnits(c),0);
const c=(id,areas=[])=>({course_id:id,code:id,title:id,units_min:3,units_max:3,components:[{component_id:id,code:id,units_min:3,units_max:3}],
 prerequisites:{type:'NOT_STATED'},corequisites:{type:'NOT_STATED'},ge_areas:areas,level:'lower_division'});
const req=id=>({type:'COURSE',course_id:id,component_ids:[id]});
function fixture(type='CHOOSE_OPTIONS') {
 const choice=type==='CHOOSE_OPTIONS'?{type,choice_id:'pool',label:'Choose two electives',minimum_count:2,maximum_count:2,minimum_units:6,
  options:['A','B','C'].map(id=>({id,label:id,rule:req(id)}))}:{type,choice_id:'pool',label:'Choose six elective units',minimum_units:6,candidate_course_ids:['A','B','C']};
 return {metadata:{catalog_year:'test'},courses:['A','B','C'].map(id=>c(id)),programs:[{program_id:'major',name:'Test major',type:'major',degree_unit_minimum:6}],
  requirements:[{program_id:'major',rule:choice}],ge_areas:[]};
}
const stateFor=()=>{const s=m.initialState();s.settings.major='major';return s;};

test('completed CIT GE is prior credit, leaving only the guide’s true degree-elective balance',()=>{
 const state=m.initialState();state.geCompleted=data.ge_areas.map(a=>a.area_id);
 const d=m.derivePlan(data,state);assert.equal(d.ledger.otherPriorUnits,37);assert.equal(d.ledger.degreeElectiveUnits,3);
 assert.equal(total(d.items.filter(c=>c.roles.includes('elective'))),3);assert.equal(d.items.some(c=>c.geArea),false);
 assert.equal(d.ledger.totalPlannedUnits,120);assert.equal(d.ledger.priorUnitsEstimated,true);
 assert.equal(d.items.filter(c=>c.roles.includes('elective')).length,1,'Prior progress allows one 3-unit elective instead of forcing separate 2- and 1-unit enrollments.');
 state.selections['cit-math']='MATH-150A';assert.equal(m.derivePlan(data,state).ledger.degreeElectiveUnits,1);
});
test('an inherited program-block credit target is not treated as unrestricted electives',()=>{
 const s=m.initialState();s.settings.major='political-science-b-a-public-policy-and-management-option';const p=m.derivePlan(data,s);
 assert.equal(p.ledger.degreeElectiveUnits,32);assert.equal(p.ledger.programReviewUnits,0);
 const choices=m.choiceDescriptors(data,s);assert.equal(choices.find(c=>c.choice_id.endsWith(':64:pool1')).minimum_units,9);
});
test('unreconciled catalog program credits stay separate from genuine degree electives',()=>{
 const s=m.initialState();s.settings.major='biology-b-a';const p=m.derivePlan(data,s);
 assert.equal(p.ledger.degreeElectiveUnits,15);assert.equal(p.ledger.programReviewUnits,14);
 assert.equal(total(p.items.filter(c=>c.programReview)),14);assert.ok(m.validatePlan(data,s,p).some(i=>i.kind==='program-credit-review'));
});
test('a transcript total replaces the GE estimate and completed cards count once',()=>{
 const s=m.initialState();s.geCompleted=data.ge_areas.map(a=>a.area_id);s.settings.priorUnitsMode='transcript';s.settings.transferUnits=40;s.completed=['CIT-101/L'];
 const d=m.derivePlan(data,s);assert.equal(d.ledger.otherPriorUnits,40);assert.equal(d.ledger.earnedUnits,43);assert.equal(d.ledger.priorUnitsEstimated,false);
 assert.equal(d.ledger.degreeElectiveUnits,0);assert.equal(d.ledger.totalPlannedUnits,120);
});
test('a single GE or overlay completion never creates arbitrary extra courses',()=>{
 const before=m.derivePlan(data,m.initialState());
 for(const area of data.ge_areas){const s=m.initialState();s.geCompleted=[area.area_id];const d=m.derivePlan(data,s);
  assert.ok(d.ledger.degreeElectiveUnits<=before.ledger.degreeElectiveUnits+.001,area.area_id);
  if(area.kind==='overlay')assert.equal(d.ledger.otherPriorUnits,0,area.area_id);
 }
});
test('major GE waivers do not award invented prior course credit',()=>{
 const d=fixture();d.programs[0].ge_overrides=[{targets:['ALL-GE'],rule:{type:'MAJOR_COMPLETION'}}];d.ge_areas=[{area_id:'X',kind:'base',name:'Waived area',required_units:3}];
 const s=stateFor();s.geCompleted=['X'];const p=m.derivePlan(d,s);assert.equal(p.ledger.otherPriorUnits,0);
});
test('an existing major course is automatically allocated to GE without another enrollment',()=>{
 const d=fixture();d.courses=[c('A',['3A','3B']),c('B',['3A'])];d.requirements[0].rule={type:'ALL_OF',children:[req('A'),req('B')]};
 d.ge_areas=[{area_id:'3A',kind:'base',name:'Arts',required_units:3},{area_id:'3B',kind:'base',name:'Humanities',required_units:3}];
 const p=buildPlan(d,{major_id:'major'});assert.equal(p.additional_base_ge_units_to_plan,0);
 assert.deepEqual(p.ge_requirements.find(a=>a.area_id==='3B').covered_by_planned_courses,['A']);assert.equal(p.known_curriculum_units,6);
});
test('a designated GE/campus overlap fulfills both checks while degree units remain single',()=>{
 const d=fixture();d.courses=[c('A',['4','CAMPUS-LL'])];d.requirements[0].rule=req('A');
 d.ge_areas=[{area_id:'4',kind:'base',name:'Social science',required_units:3},{area_id:'CAMPUS-LL',kind:'campus',name:'Lifelong learning',required_units:3}];
 const p=buildPlan(d,{major_id:'major'});assert.equal(p.additional_base_ge_units_to_plan,0);assert.equal(p.additional_campus_units_to_plan,0);assert.equal(p.known_curriculum_units,3);
});
test('a mandatory preparation course can cover GE without a second GE box',()=>{
 const d=fixture();d.courses=[c('A',['2-LD']),{...c('B'),prerequisites:req('A')}];d.requirements[0].rule=req('B');
 d.ge_areas=[{area_id:'2-LD',kind:'base',name:'Math',required_units:3}];const p=m.derivePlan(d,stateFor());
 assert.ok(p.items.some(c=>c.id==='A'));assert.equal(p.items.some(c=>c.geArea==='2-LD'),false);
});
test('a lecture required in one block and its bundle required elsewhere are one enrollment',()=>{
 const d=fixture();d.courses=[c('A'),{...c('A/L'),units_min:4,units_max:4,components:[{component_id:'A',code:'A',units_min:3,units_max:3},{component_id:'AL',code:'AL',units_min:1,units_max:1}]}];
 d.requirements[0].rule={type:'ALL_OF',children:[req('A'),{type:'COURSE',course_id:'A/L',component_ids:['A','AL']}]};
 const s=stateFor();s.completed=['A'];const p=m.derivePlan(d,s);
 assert.equal(p.items.filter(c=>!c.placeholder).length,1);const row=p.items.find(c=>c.id==='A/L');assert.equal(row.units_min,4);assert.equal(row.completed,false);
 assert.equal(row.completed_units,3);assert.equal(m.plannedCourseUnits(row),1);assert.equal(p.ledger.earnedUnits,3);
});
test('CIT domain exclusions apply to lecture/lab aliases too',()=>{
 const s=m.initialState();s.selections['cit-domain:route']='cit-comp-electives';const descriptor=m.choiceDescriptors(data,s).find(c=>c.choice_id==='cit-domain');
 assert.equal(m.choiceCourseOptions(data,descriptor).some(c=>c.course_id==='COMP-484/L'),false);
});
for(const type of ['CHOOSE_OPTIONS','APPROVED_ELECTIVES'])test(type+': choosing and replacing a multi-course box preserves the other selection',()=>{
 const d=fixture(type),s=stateFor(),terms=m.makeTerms(s);let p=m.derivePlan(d,s),slots=p.items.filter(c=>c.choiceId==='pool');
 s.positions[slots[0].id]=terms[0].id;s.positions[slots[1].id]=terms[1].id;
 let result=m.applyChoiceSelection(d,s,'pool','A',{placeholderId:slots[1].id});assert.equal(result.ok,true);let next=m.autoSchedule(d,result.state,{preserve:true});
 assert.equal(next.positions.A,terms[1].id);p=m.derivePlan(d,next);slots=p.items.filter(c=>c.choiceId==='pool');assert.equal(slots.length,1);assert.equal(next.positions[slots[0].id],terms[0].id);
 result=m.applyChoiceSelection(d,next,'pool','B',{placeholderId:slots[0].id});assert.equal(result.ok,true);next=m.autoSchedule(d,result.state,{preserve:true});const aTerm=next.positions.A;
 assert.equal(m.derivePlan(d,next).items.some(c=>c.choiceId==='pool'),false);
 result=m.applyChoiceSelection(d,next,'pool','C',{replaceValue:'B'});assert.equal(result.ok,true);next=m.autoSchedule(d,result.state,{preserve:true});p=m.derivePlan(d,next);
 assert.deepEqual([...next.selections.pool].sort(),['A','C']);assert.equal(next.positions.A,aTerm);assert.equal(p.items.some(c=>c.id==='B'),false);assert.equal(p.ledger.totalPlannedUnits,6);
 assert.equal(m.applyChoiceSelection(d,next,'pool','B').ok,false);
});
test('the four-year CIT plan recommends 15 units while allowing 18',()=>{
 const s=m.autoSchedule(data,m.initialState()),d=m.derivePlan(data,s);
 assert.deepEqual(d.terms.map(t=>t.limit),Array(8).fill(18));assert.deepEqual(d.terms.map(t=>t.target),Array(8).fill(15));assert.deepEqual(d.terms.map(t=>total(d.items.filter(c=>s.positions[c.id]===t.id))),Array(8).fill(15));
 assert.ok(d.terms.every(t=>t.loadSource==='official-roadmap'));
});
test('heavier semesters are permitted where the selected official guide lists them',()=>{
 const s=m.initialState();s.settings.major='computer-engineering-b-s';const d=m.derivePlan(data,s);
 assert.equal(d.roadmap.program_id,'computer-engineering-b-s');assert.deepEqual(d.terms.map(t=>t.target),[15,16,17,16,15,14,14,16]);
});
test('shorter plans never exceed 18 units and custom loads can set a lower maximum',()=>{
 const s=m.initialState();s.settings.years=3;assert.ok(m.derivePlan(data,s).terms.every(t=>t.limit===18&&t.target===18));
 s.settings.years=4;s.settings.regularLimit=21;assert.ok(m.derivePlan(data,s).terms.every(t=>t.limit===18));
 s.settings.loadMode='custom';s.settings.regularLimit=16;assert.ok(m.derivePlan(data,s).terms.every(t=>t.limit===16&&t.target===16));
});
test('older saves preserve selections while migrating to roadmap limits',()=>{
 const s=m.initialState();s.schemaVersion=2;delete s.settings.loadMode;delete s.settings.priorUnitsMode;s.settings.regularLimit=18;s.selections['cit-math']='MATH-255A';
 const restored=m.importPlan(JSON.stringify(s),data);assert.equal(restored.schemaVersion,4);assert.equal(restored.selections['cit-math'],'MATH-255A');assert.equal(restored.settings.loadMode,'roadmap');assert.equal(restored.settings.regularLimit,18);
});
test('every official roadmap has a parsed budget or a clearly conditional session',()=>{
 assert.equal(data.roadmaps.length,157);
 for(const r of data.roadmaps)for(const semester of r.semesters)assert.ok(semester.total_units_max>0||semester.conditional,r.source_url+': '+semester.year+' '+semester.season);
});
test('spring starts map summer budgets to the correct academic year',()=>{
 const s=m.initialState();s.settings.major='radiologic-sciences-b-s';s.settings.startSeason='Spring';s.settings.summer=true;
 const d=m.derivePlan(data,s);assert.equal(d.terms.find(t=>t.id==='2028-summer').target,3);
 assert.equal(d.terms.find(t=>t.id==='2028-summer').loadSource,'official-roadmap');
});
test('all majors, minors, roadmap variants and GE-complete states respect guide limits without phantom electives',()=>{
 const report=[];
 for(const program of data.programs){
  const s=m.initialState();if(program.type==='major')s.settings.major=program.program_id;else s.settings.minor=program.program_id;
  const before=m.derivePlan(data,s);s.geCompleted=data.ge_areas.map(a=>a.area_id);const after=m.derivePlan(data,s);
  assert.ok(after.ledger.degreeElectiveUnits<=before.ledger.degreeElectiveUnits+.001,program.name);
  assert.equal(after.items.some(c=>c.geArea),false,program.name);
  for(const input of [{...s,geCompleted:[]},s]){
   const scheduled=m.autoSchedule(data,input),plan=m.derivePlan(data,scheduled);
   for(const term of plan.terms)assert.ok(total(plan.items.filter(c=>!c.completed&&scheduled.positions[c.id]===term.id))<=term.limit+.001,program.name+': '+term.id);
  }
  report.push(program.program_id);
 }
 assert.equal(report.length,265);
 for(const reference of data.roadmaps){const s=m.initialState();s.settings.major=reference.program_id;s.settings.roadmap=reference.roadmap_id;
  const scheduled=m.autoSchedule(data,s),d=m.derivePlan(data,scheduled);
  for(const term of d.terms)assert.ok(total(d.items.filter(c=>!c.completed&&scheduled.positions[c.id]===term.id))<=term.limit+.001,reference.title);
 }
});
