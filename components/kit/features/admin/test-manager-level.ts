import type {Instrument} from '../../types';
export type AdminTestLevel='bachillerato'|'universidad';
export function exactTestLevel(value:unknown):AdminTestLevel|undefined{return value==='bachillerato'||value==='universidad'?value:undefined;}
export const adminTestLevel=(value:unknown):AdminTestLevel=>exactTestLevel(value)||'bachillerato';
export const testLevelLabel=(level:AdminTestLevel)=>level==='bachillerato'?'Bachillerato':'Universidad';
export function testManagerHref(level:AdminTestLevel,id?:string){const query=new URLSearchParams({nivel:level});if(id)query.set('editar',id);return '/admin/evaluaciones?'+query.toString();}
export function testsForLevel<T extends Instrument>(tests:T[],level:AdminTestLevel){return tests.filter(test=>test.educationLevel===level);}
export function nextTestVersion(tests:Instrument[],test:Instrument,level:AdminTestLevel){return Math.max(test.educationLevel===level?Number.parseInt(test.version)||1:0,...testsForLevel(tests,level).filter(item=>(item.stableId||item.id)===(test.stableId||test.id)).map(item=>Number.parseInt(item.version)||1))+1;}
export function testsImportedForLevel<T extends Instrument>(tests:T[],level:AdminTestLevel):T[]{return tests.map(test=>({...test,educationLevel:level}));}
export function testImportForm(file:File,educationLevel:AdminTestLevel){const data=new FormData();data.append('file',file);data.append('educationLevel',educationLevel);return data;}
