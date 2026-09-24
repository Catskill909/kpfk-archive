'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const search=require('../../public/archive-search');
const rows=[
 {id:'a1',sho:'a',title:'Music Hour',host:'José',cat:'music',dt:20,published:[],episodeDesc:''},
 {id:'a2',sho:'a',title:'Music Hour',host:'José',cat:'music',dt:10,published:[{topic:'Housing in Los Angeles',guest:'Maria',notes:'Tenants and rent'}],episodeDesc:'Housing in Los Angeles'},
 {id:'b1',sho:'b',title:'Jazz',host:'Ann',cat:'arts',dt:30,published:[],episodeDesc:''}
];
const index=search.build(rows,{a:{name:'Music Hour',desc:'Jazz and improvisation every week'}},{music:'Music',arts:'Arts & Culture'});
test('description matches a show, not every episode; exact show name leads',()=>{
 const result=search.find(index,'jazz','all');assert.deepEqual(result.shows.map(s=>s.show.id),['b','a']);assert.deepEqual(result.episodes.map(e=>e.row.id),['b1']);assert.equal(result.shows[1].reason,'Show description');assert.equal(result.shows[1].show.count,2);
});
test('topics and guests find individual episodes, without inventing show matches',()=>{
 assert.deepEqual(search.find(index,'housing','all').episodes.map(e=>e.row.id),['a2']);assert.equal(search.find(index,'housing','all').shows.length,0);assert.equal(search.find(index,'maria','all').episodes[0].row.id,'a2');
});
test('accents and punctuation normalize; category filters both result types',()=>{
 assert.equal(search.find(index,'JOSE!','all').episodes.length,2);assert.equal(search.find(index,'jazz','music').shows.length,1);assert.equal(search.find(index,'jazz','music').episodes.length,0);assert.deepEqual(search.find(index,'!!!','all'),{shows:[],episodes:[]});
});
test('newest episode is chosen independently of input order and refresh replaces index',()=>{
 const rebuilt=search.build(rows.slice().reverse(),{},{});assert.equal(rebuilt.shows.find(s=>s.id==='a').latest.id,'a1');assert.equal(search.find(search.build([rows[0]],{},{}),'housing','all').episodes.length,0);
});
