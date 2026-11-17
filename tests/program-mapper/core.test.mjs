import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as m from '../../js/pages/program-mapper-core.mjs';

const catalog=JSON.parse(fs.readFileSync(new URL('../../data/program-mapper/catalog.json',import.meta.url)));
const course=(id,prerequisites={type:'NOT_STATED'},corequisites={type:'NOT_STATED'})=>({course_id:id,code:id,title:id,
  units_min:3,units_max:3,components:[{component_id:id,code:id,units_min:3,units_max:3}],
  prerequisites,corequisites,ge_areas:[],level:'lower_division',needs_review:false,source_url:'https://catalog.csun.edu/'});
const req=id=>({type:'COURSE',course_id:id,component_ids:[id]});
function fixture(extra=[],required=['A','B','C']){
  return {metadata:{catalog_year:'test'},courses:[course('A'),course('B',req('A')),course('C',req('B')),...extra],
    programs:[{program_id:'major',name:'Test major',type:'major',degree_unit_minimum:required.length*3}],
    requirements:[{program_id:'major',rule:{type:'ALL_OF',children:required.map(req)}}],ge_areas:[]};
}
function base(data=fixture()){
  const s=m.initialState();s.settings.major='major';return m.autoSchedule(data,s);
}

test('Fall 2026 produces Spring 2027 and four academic years',()=>{
  const terms=m.makeTerms(m.initialState());
  assert.equal(terms.length,8);assert.equal(terms[0].id,'2026-fall');assert.equal(terms[1].id,'2027-spring');assert.equal(terms.at(-1).id,'2030-spring');
});
test('winter and summer terms appear in chronological order with their own limits',()=>{
  const s=m.initialState();s.settings.winter=s.settings.summer=true;
  const terms=m.makeTerms(s);assert.deepEqual(terms.slice(0,4).map(m.termLabel),['Fall 2026','Winter 2027','Spring 2027','Summer 2027']);assert.equal(terms[1].limit,3);assert.equal(terms[3].limit,6);
});
test('spring starts and specific extra terms retain calendar dates',()=>{
  const s=m.initialState();s.settings.startSeason='Spring';s.extraTerms=[{id:'2028-summer',season:'Summer',year:2028}];
  const t=m.makeTerms(s);assert.equal(t[0].id,'2026-spring');assert.equal(t.at(-1).id,'2029-fall');assert.equal(t.filter(x=>x.id==='2028-summer').length,1);
});
test('schedule respects the entire prerequisite chain',()=>{
  const d=fixture(),s=base(d);assert.deepEqual(m.validatePlan(d,s),[]);const t=m.makeTerms(s).map(x=>x.id);assert.ok(t.indexOf(s.positions.A)<t.indexOf(s.positions.B));assert.ok(t.indexOf(s.positions.B)<t.indexOf(s.positions.C));
});
test('moving a prerequisite later moves downstream courses atomically',()=>{
  const d=fixture(),s=base(d),t=m.makeTerms(s),result=m.moveCourse(d,s,'A',t[1].id);
  assert.equal(result.ok,true);assert.equal(result.state.positions.B,t[2].id);assert.equal(result.state.positions.C,t[3].id);assert.equal(s.positions.A,t[0].id);
});
test('a late chain that cannot finish is rejected without mutating the original plan',()=>{
  const d=fixture(),s=base(d),before=JSON.stringify(s),t=m.makeTerms(s),r=m.moveCourse(d,s,'A',t[6].id);assert.equal(r.ok,false);assert.match(r.message,/beyond|timeline/);assert.equal(JSON.stringify(s),before);
});
test('moving a dependent before its prerequisite is rejected',()=>{
  const d=fixture(),s=base(d),r=m.moveCourse(d,s,'C',m.makeTerms(s)[0].id);assert.equal(r.ok,false);assert.match(r.message,/before/);
});
test('completed prerequisites satisfy the chain without another enrollment',()=>{
  const d=fixture(),s=base(d);s.completed=['A','B'];const r=m.moveCourse(d,s,'C',m.makeTerms(s)[0].id);assert.equal(r.ok,true);assert.equal(m.validatePlan(d,r.state).filter(i=>i.severity==='error').length,0);
});
test('corequisites are placed and moved in the same semester',()=>{
  const d=fixture([course('X',undefined,req('L')),course('L')],['X','L']);const s=base(d),t=m.makeTerms(s);assert.equal(s.positions.X,s.positions.L);const r=m.moveCourse(d,s,'X',t[2].id);assert.equal(r.ok,true);assert.equal(r.state.positions.X,r.state.positions.L);
});
test('custom sequence links retain relative term offsets',()=>{
  const d=fixture(),s=base(d),t=m.makeTerms(s),linked=m.createLink(d,s,['A','C'],'sequence','Calculus sequence');assert.equal(linked.ok,true);const r=m.moveCourse(d,linked.state,'A',t[1].id);assert.equal(r.ok,true);assert.equal(t.findIndex(x=>x.id===r.state.positions.C)-t.findIndex(x=>x.id===r.state.positions.A),2);
});
test('custom corequisite link conflicting with a prerequisite is rejected',()=>{
  const d=fixture(),s=base(d),r=m.createLink(d,s,['A','B'],'corequisite','Invalid pair');assert.equal(r.ok,false);assert.match(r.message,/before/);
});
test('locked courses block ripple moves and survive auto-arrange',()=>{
  const d=fixture(),s=base(d);s.locked=['B'];assert.equal(m.moveCourse(d,s,'A',m.makeTerms(s)[1].id).ok,false);const arranged=m.autoSchedule(d,s);assert.equal(arranged.positions.B,s.positions.B);
});
test('ANY_OF uses an alternative that is actually early enough',()=>{
  const d=fixture([course('D'),course('X',{type:'ANY_OF',children:[req('A'),req('D')]})],['A','D','X']);const s=base(d),t=m.makeTerms(s);s.positions.A=t[0].id;s.positions.D=t[0].id;s.positions.X=t[1].id;const r=m.moveCourse(d,s,'A',t[3].id);assert.equal(r.ok,true);assert.equal(r.state.positions.X,t[1].id);
});
test('review-only reference lists never create hard dependencies',()=>{
  const d=fixture([course('X',{type:'REVIEW_REQUIRED',referenced_courses:['C'],message:'Placement review'})],['X']);const p=m.derivePlan(d,base(d));assert.equal(p.edges.length,0);assert.equal(p.items.some(c=>c.id==='C'),false);assert.equal(p.review.length,1);
});
test('missing preparation courses are included, with aliases resolving once',()=>{
  const d=fixture([],['C']);const p=m.derivePlan(d,base(d));assert.equal(p.items.filter(c=>['A','B','C'].includes(c.id)).length,3);assert.ok(p.items.find(c=>c.id==='A').roles.includes('preparation'));
});
test('minimum-standing rules are checked on manual moves',()=>{
  const d=fixture([course('X',{type:'MIN_COMPLETED_UNITS',units:6})],['A','B','X']),s=base(d),t=m.makeTerms(s);assert.equal(m.moveCourse(d,s,'X',t[0].id).ok,false);
});
test('CIT default plan has a complete, conflict-free dated layout',()=>{
  const s=m.autoSchedule(catalog,m.withSuggestedPaths(catalog,m.initialState())),p=m.derivePlan(catalog,s);
  assert.equal(Object.keys(s.positions).length,p.items.length);assert.equal(m.validatePlan(catalog,s).filter(i=>i.severity==='error').length,0);assert.equal(p.items.reduce((sum,c)=>sum+m.courseUnits(c),0),120);assert.equal(p.terms.at(-1).id,'2030-spring');
});
test('CIT with Real Estate minor resolves shared courses and retains required electives',()=>{
  let s=m.initialState();s.settings.minor='real-estate-minor';s.selections['real-estate-electives']=['RE-416','RE-420','BLAW-368'];s=m.autoSchedule(catalog,m.withSuggestedPaths(catalog,s));const p=m.derivePlan(catalog,s);assert.ok(p.items.some(c=>c.id==='RE-414'));assert.equal(new Set(p.items.map(c=>c.id)).size,p.items.length);assert.equal(p.checklist.choices.some(c=>c.type==='DOMAIN_EMPHASIS'),false);assert.equal(m.validatePlan(catalog,s).filter(i=>i.severity==='error').length,0);
});
test('all GE completed except biological science creates a 5B / B2 slot',()=>{
  const s=m.withSuggestedPaths(catalog,m.initialState());s.geCompleted=catalog.ge_areas.map(a=>a.area_id).filter(id=>id!=='5B');const p=m.derivePlan(catalog,s);const ge=p.items.filter(c=>c.geArea);assert.deepEqual(ge.map(c=>c.geArea),['5B']);assert.equal(m.GE_ALIASES['5B'],'B2');assert.ok(m.geOptions(catalog,'5B').some(c=>c.course_id==='BIOL-101'));
});
test('selecting an eligible GE course replaces the corresponding placeholder',()=>{
  const s=m.withSuggestedPaths(catalog,m.initialState()),pick=m.geOptions(catalog,'5B').find(c=>c.units_min===3);s.added=[pick.course_id];s.geAssignments[pick.course_id]='5B';const p=m.derivePlan(catalog,s);assert.ok(p.items.some(c=>c.id===pick.course_id));assert.equal(p.items.some(c=>c.geArea==='5B'),false);
});
test('removing a required GE-covered course restores needed GE space and a review issue',()=>{
  const s=m.withSuggestedPaths(catalog,m.initialState());s.removed=['MATH-103'];const p=m.derivePlan(catalog,s);assert.ok(p.items.some(c=>c.geArea==='2-LD'));assert.ok(m.validatePlan(catalog,s,p).some(i=>i.kind==='removed'));
});
test('verified Calculus III rules contain only the actual Calculus II prerequisite',()=>{
  const c=catalog.courses.find(c=>c.course_id==='MATH-250');assert.equal(c.prerequisites.course_id,'MATH-150B');assert.equal(c.prerequisites.minimum_grade,'C');assert.equal(c.source_url,'https://catalog.csun.edu/academics/math/courses/math-250/');assert.ok(catalog.course_details[c.details_key].description.includes('integral'));
});
test('descriptions and individual official sources are bundled for over 4,000 courses',()=>{
  assert.ok(catalog.courses.filter(c=>c.details_key).length>4000);assert.ok(Object.keys(catalog.course_details).length>4000);assert.equal(catalog.programs.length,265);
});
test('export/import retains customized positions, completion, links and notes',()=>{
  const d=fixture(),s=base(d);s.completed=['A'];s.name='A saved plan';s.notes.B='Ask advisor';s.links=[{id:'my-link',label:'Sequence',kind:'sequence',members:['B','C']}];const imported=m.importPlan(m.exportPlan(s,d),d);assert.deepEqual(imported,s);
});
test('import rejects fractional dates, oversized input and wrong program identifiers',()=>{
  const d=fixture(),s=base(d);s.settings.startYear=2026.5;assert.throws(()=>m.importPlan(JSON.stringify(s),d),/whole numbers/);s.settings.startYear=2026;s.settings.major='missing';assert.throws(()=>m.importPlan(JSON.stringify(s),d),/program/);assert.throws(()=>m.importPlan(' '.repeat(2_000_001),d),/2 MB/);
});
test('custom course imports cannot introduce executable URLs or prototypes',()=>{
  const d=fixture(),s=base(d);s.customCourses=[{...course('CUSTOM-1'),source_url:'javascript:alert(1)',title:'<img src=x onerror=alert(1)>'}];const raw=JSON.stringify(s).replace('"positions":{','"positions":{"__proto__":"bad",');const p=m.importPlan(raw,d);assert.equal(p.customCourses[0].source_url,'');assert.equal(Object.prototype.polluted,undefined);assert.equal(Object.hasOwn(p.positions,'__proto__'),false);
});
test('official links allow only HTTPS CSUN domains',()=>{
  assert.equal(m.safeOfficialUrl('https://catalog.csun.edu/academics/comp/'),'https://catalog.csun.edu/academics/comp/');assert.equal(m.safeOfficialUrl('https://csun.edu.evil.example/'),'');assert.equal(m.safeOfficialUrl('javascript:alert(1)'),'');
});
test('variable-unit courses use the student selection and preserve it through export/import',()=>{
  const c=course('V');c.units_min=1;c.units_max=3;c.components[0].units_min=1;c.components[0].units_max=3;
  const d=fixture([c],['V']),s=base(d);s.unitOverrides.V=3;
  assert.equal(m.derivePlan(d,s).items.find(c=>c.id==='V').units_min,3);
  assert.equal(m.importPlan(m.exportPlan(s,d),d).unitOverrides.V,3);
});
test('upper-division GE courses wait for junior standing and basic GE preparation',()=>{
  const s=m.withSuggestedPaths(catalog,m.initialState());const candidate=catalog.courses.find(c=>c.level==='upper_division'&&c.ge_areas.includes('3A'));
  assert.ok(candidate);s.added.push(candidate.course_id);s.geAssignments[candidate.course_id]='3A';
  const p=m.derivePlan(catalog,s),card=p.items.find(c=>c.id===candidate.course_id);assert.ok(card.minUnits>=60);assert.ok(p.edges.some(e=>e.to===candidate.course_id&&e.from.startsWith('ge:1C:')));
});
test('all 265 major and minor entries load and schedule without crashes or silent conflicts',()=>{
  const report=[];
  for(const p of catalog.programs){let s=m.initialState();if(p.type==='major')s.settings.major=p.program_id;else s.settings.minor=p.program_id;s=m.autoSchedule(catalog,m.withSuggestedPaths(catalog,s));const d=m.derivePlan(catalog,s);const errors=m.validatePlan(catalog,s,d).filter(i=>i.severity==='error');assert.equal(errors.length,0,p.name+': '+JSON.stringify(errors));assert.ok(d.items.length>0);report.push({program:p.program_id,items:d.items.length,scheduled:Object.keys(s.positions).length});}
  assert.equal(report.length,265);
});
