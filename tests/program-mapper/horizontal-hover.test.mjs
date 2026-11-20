import test from 'node:test';
import assert from 'node:assert/strict';
import {launchHarness} from './dom-harness.mjs';
const q=(h,id)=>h.document.getElementById(id);
const card=(h,id)=>h.document.querySelectorAll('.pm-course').find(c=>c.dataset.courseId===id);
const lines=h=>h.document.querySelectorAll('.pm-link-path');
function metrics(h){const board=q(h,'roadmap');board.scrollWidth=2400;board.clientWidth=600;board.scrollLeft=0;board.trigger('scroll');return board;}

test('hover traces linked cards and lines, leaving the card restores the quiet state',async()=>{
 const h=await launchHarness();try{
  assert.equal(h.document.querySelectorAll('.is-related').length,0);
  const edge=h.app.derived().edges.find(e=>card(h,e.from)&&card(h,e.to)),source=card(h,edge.from),state=JSON.stringify(h.app.state());
  source.trigger('pointerover',{pointerType:'mouse'});
  assert.ok(source.classList.contains('is-link-origin'));assert.ok(card(h,edge.to).classList.contains('is-related'));
  assert.ok(lines(h).some(p=>p.classList.contains('is-highlighted')));assert.ok(h.document.querySelectorAll('.pm-course').some(c=>c.classList.contains('is-dim')));
  assert.equal(q(h,'mapper-dialog').open,false);assert.equal(JSON.stringify(h.app.state()),state,'Hover never changes the saved plan.');
  source.trigger('pointerout',{relatedTarget:null});assert.equal(h.document.querySelectorAll('.is-related').length,0);assert.equal(lines(h).some(p=>p.classList.contains('is-highlighted')),false);assert.equal(h.document.querySelectorAll('.is-dim').length,0);assert.deepEqual(h.errors,[]);
 }finally{h.dispose();}
});
test('moving the pointer between controls inside one card keeps its links highlighted',async()=>{
 const h=await launchHarness();try{
  const source=card(h,'CIT-101/L'),button=source.querySelector('[data-complete]');source.trigger('pointerover',{pointerType:'mouse'});
  button.trigger('pointerout',{relatedTarget:source.querySelector('.pm-course-name')});assert.ok(source.classList.contains('is-related'));
  source.trigger('pointerout',{relatedTarget:q(h,'roadmap')});assert.equal(source.classList.contains('is-related'),false);assert.deepEqual(h.errors,[]);
 }finally{h.dispose();}
});
test('keyboard focus highlights the same relationships and moving focus away clears them',async()=>{
 const h=await launchHarness();try{
  const source=card(h,'CIT-101/L');source.trigger('focusin');assert.ok(source.classList.contains('is-link-origin'));assert.ok(lines(h).some(p=>p.classList.contains('is-highlighted')));
  source.trigger('focusout',{relatedTarget:q(h,'timeline-next')});assert.equal(source.classList.contains('is-related'),false);assert.equal(q(h,'mapper-dialog').open,false);assert.deepEqual(h.errors,[]);
 }finally{h.dispose();}
});
test('touch pointer events and Show links off do not leave a stuck highlight',async()=>{
 const h=await launchHarness();try{
  let source=card(h,'CIT-101/L');source.trigger('pointerover',{pointerType:'touch'});assert.equal(source.classList.contains('is-related'),false);
  source.trigger('pointerover',{pointerType:'mouse'});q(h,'show-links').checked=false;q(h,'show-links').trigger('change');
  source=card(h,'CIT-101/L');source.trigger('pointerover',{pointerType:'mouse'});assert.equal(h.document.querySelectorAll('.is-related').length,0);assert.equal(lines(h).length,0);assert.deepEqual(h.errors,[]);
 }finally{h.dispose();}
});
test('hovering one branch does not highlight a sibling sharing an earlier prerequisite',async()=>{
 const initial=await launchHarness();const saved=initial.app.state();initial.dispose();
 const ids=['CUSTOM-BASE','CUSTOM-LEFT','CUSTOM-RIGHT'];
 saved.customCourses=ids.map(id=>({course_id:id,code:id,title:id,units_min:3,units_max:3,description:'Test course'}));saved.added=ids;
 saved.links=[{id:'left',label:'Left sequence',kind:'sequence',members:[ids[0],ids[1]]},{id:'right',label:'Right sequence',kind:'sequence',members:[ids[0],ids[2]]}];
 const h=await launchHarness(JSON.stringify(saved));try{
  card(h,ids[1]).trigger('pointerover',{pointerType:'mouse'});assert.ok(card(h,ids[0]).classList.contains('is-related'));assert.equal(card(h,ids[2]).classList.contains('is-related'),false);
  assert.ok(lines(h).find(p=>p.dataset.from===ids[0]&&p.dataset.to===ids[1]).classList.contains('is-highlighted'));assert.ok(lines(h).find(p=>p.dataset.from===ids[0]&&p.dataset.to===ids[2]).classList.contains('is-dim'));assert.deepEqual(h.errors,[]);
 }finally{h.dispose();}
});
test('horizontal timeline navigation supports buttons and keyboard with clamped scrolling',async()=>{
 const h=await launchHarness();try{
  const board=metrics(h);assert.equal(board.getAttribute('tabindex'),'0');assert.equal(board.getAttribute('role'),'region');assert.equal(q(h,'timeline-previous').disabled,true);assert.equal(q(h,'timeline-next').disabled,false);
  q(h,'timeline-next').click();assert.equal(board.scrollLeft,480);q(h,'timeline-previous').click();assert.equal(board.scrollLeft,0);
  board.trigger('keydown',{key:'ArrowRight'});assert.equal(board.scrollLeft,300);board.trigger('keydown',{key:'End'});assert.equal(board.scrollLeft,1800);assert.equal(q(h,'timeline-next').disabled,true);
  board.trigger('keydown',{key:'Home'});assert.equal(board.scrollLeft,0);assert.equal(q(h,'timeline-previous').disabled,true);assert.deepEqual(h.errors,[]);
 }finally{h.dispose();}
});
test('timeline keeps its horizontal position while a course is marked complete',async()=>{
 const h=await launchHarness();try{
  const board=metrics(h);board.scrollLeft=850;card(h,'CIT-101/L').querySelector('[data-complete]').click();assert.equal(q(h,'roadmap').scrollLeft,850);assert.ok(h.app.state().completed.includes('CIT-101/L'));assert.deepEqual(h.errors,[]);
 }finally{h.dispose();}
});
test('dragging at a timeline edge scrolls horizontally without changing the plan',async()=>{
 const h=await launchHarness();try{
  const board=metrics(h),source=card(h,'CIT-160/L'),before=JSON.stringify(h.app.state()),dataTransfer={setData(){}};
  source.trigger('dragstart',{dataTransfer});source.closest('[data-term-id]').trigger('dragover',{dataTransfer,clientX:295,clientY:300});assert.equal(board.scrollLeft,24);
  source.trigger('dragend');assert.equal(JSON.stringify(h.app.state()),before);assert.deepEqual(h.errors,[]);
 }finally{h.dispose();}
});
test('horizontal link curves join the facing sides of courses in different semester columns',async()=>{
 const h=await launchHarness();try{
  const edge=h.app.derived().edges.find(e=>card(h,e.from)&&card(h,e.to)),source=card(h,edge.from),target=card(h,edge.to);
  source.getBoundingClientRect=()=>({left:20,right:300,top:200,bottom:300,width:280,height:100});
  target.getBoundingClientRect=()=>({left:340,right:620,top:350,bottom:450,width:280,height:100});
  source.trigger('pointerover',{pointerType:'mouse'});const path=lines(h).find(p=>p.dataset.from===edge.from&&p.dataset.to===edge.to);
  assert.equal(path.getAttribute('d'),'M300 250 C320 250,320 400,340 400');assert.ok(path.classList.contains('is-highlighted'));assert.deepEqual(h.errors,[]);
 }finally{h.dispose();}
});
test('optional winter and summer semesters remain chronological inside each horizontal year',async()=>{
 const h=await launchHarness();try{
  q(h,'include-winter').checked=true;q(h,'include-summer').checked=true;q(h,'setup-form').trigger('submit');
  const year=h.document.querySelector('.pm-year'),terms=year.querySelectorAll('[data-term-id]').map(t=>t.dataset.termId);
  assert.deepEqual(terms,['2026-fall','2027-winter','2027-spring','2027-summer']);assert.deepEqual(h.errors,[]);
 }finally{h.dispose();}
});
