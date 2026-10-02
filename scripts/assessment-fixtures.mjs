import {randomUUID} from 'node:crypto';

// Synthetic, fully answered submissions for isolated test databases only.
export async function completeAssessment({db,calculateTest,userId,instrument,dimension='I',at=new Date().toISOString(),publication='immediate'}) {
 const test={...instrument,scoring:instrument.scoring||(instrument.id==='valores'?'manual':'dimensions'),aggregation:instrument.aggregation||'sum',resultPublication:publication};
 const answers=Object.fromEntries(test.questions.filter(q=>q.type!=='info').map(q=>{
  const options=q.options||test.options||[];
  const value=q.dimension&&options.some(o=>o.value===5)?(q.dimension===dimension?5:2):options[0]?.value;
  return [q.id,['open','short'].includes(q.type)?'Respuesta de prueba':q.type==='number'?1:q.type==='multiple'?[value]:value];
 }));
 const result=calculateTest(test,answers),id=randomUUID();
 await db.prepare('INSERT INTO submissions VALUES(?,?,?,?,?,?,?,?)').run(id,userId,test.id,test.version,JSON.stringify(answers),JSON.stringify(result.scores),JSON.stringify(test),at);
 await db.prepare('INSERT INTO assessment_results VALUES(?,?,?,?,?,?)').run(id,1,JSON.stringify(result),'{}',null,at);
 return {id,test,answers,result};
}
