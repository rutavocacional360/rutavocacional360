const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:1,target:9,esModuleInterop:true}}).outputText,f);
const {simulatorFromDocument}=require('../components/kit/lib/import-simulator.ts');
const base={title:'',durationMinutes:30,maxAttempts:3,instrument:{description:'',options:[]},questions:[],careerIds:[]};
const document={tests:[{title:'Software',description:'Instrucciones',durationMinutes:75,maxAttempts:5,careerLinks:[{careerId:'software'}],questions:[{id:'q1',text:'Elige cuatro',type:'likert',correctValues:[2],weight:3,options:[{label:'Tres',value:1},{label:'Cuatro',value:2}]}]}],warnings:[]};
const {simulator}=simulatorFromDocument(document,'archivo.html',base,[{id:'software',name:'Software'}]);assert.equal(simulator.durationMinutes,75);assert.equal(simulator.maxAttempts,5);assert.deepEqual(simulator.careerIds,['software']);assert.equal(simulator.questions[0].type,'single');assert.deepEqual(simulator.questions[0].correctValues,[2]);assert.equal(simulator.questions[0].weight,3);assert.equal(simulator.questions[0].reviewed,false);assert.notEqual(simulator.questions[0].id,'q1');
const append=simulatorFromDocument(document,'otro.html',simulator,[]).simulator;assert.equal(append.questions.length,2);assert.equal(new Set(append.questions.map(q=>q.id)).size,2);assert.equal(append.durationMinutes,75);assert.equal(document.tests[0].questions[0].id,'q1');
assert.throws(()=>simulatorFromDocument({tests:[]},'vacio.pdf',base,[]));console.log('PASS simulator import: explicit time, attempts, careers, answer keys, weights, fresh IDs and preserved source.');
const {schoolTrainingTargets}=require('../components/kit/data/school-training.ts');
const school=simulatorFromDocument({...document,tests:[{...document.tests[0],title:'Bachillerato en Ciencias',careerLinks:[]}]},'ciencias.html',base,schoolTrainingTargets);
assert.deepEqual(school.simulator.careerIds,['bachillerato:ciencias']);
assert(school.message.includes('opciones de bachillerato preseleccionadas'));
assert.equal(school.simulator.questions[0].reviewed,false,'Imported keys require administrative review');
console.log('PASS school document import: scoped target selection, explicit keys retained and review required.');
const late=simulatorFromDocument({tests:[{...document.tests[0],title:'Documento',careerLinks:[]}],text:'Contenido general '.repeat(200)+' Bachillerato en Ciencias'},'general.html',{...base,educationLevel:'bachillerato'},[...schoolTrainingTargets,{id:'software',name:'Software'}]);
assert.deepEqual(late.simulator.careerIds,['bachillerato:ciencias'],'Detect careers beyond the document introduction without crossing levels');
(async()=>{
 const original=global.fetch;
 try{
  for(const educationLevel of ['bachillerato','universidad']){
   const target=educationLevel==='bachillerato'?'bachillerato:ciencias':'software';let posts=0,polls=0;
   global.fetch=async(url,options)=>{
    if(options?.method==='POST'&&url==='/api/admin/import'){
     posts++;assert.equal(options.body.get('educationLevel'),educationLevel);assert.equal(options.body.get('reuse'),'1');assert.equal(options.body.get('file').name,'fixture.html');
     return Response.json({id:'job-'+educationLevel});
    }
    if(url.startsWith('/api/admin/import?id=')){
     polls++;return Response.json({status:'Completado',tests:[{...document.tests[0],careerLinks:[{careerId:target}],questions:document.tests[0].questions.map(q=>({...q,explanation:'Clave documentada.'}))}]});
    }
    throw Error('Unexpected request: '+url);
   };
   const result=await require('../components/kit/lib/import-simulator.ts').importSimulatorDocument(new File(['<h1>Fixture</h1>'],'fixture.html',{type:'text/html'}),{...base,educationLevel},[{id:target,name:'Opción QA'}]);
   assert.equal(posts,1);assert.equal(polls,1);assert.equal(result.simulator.educationLevel,educationLevel);assert.deepEqual(result.simulator.careerIds,[target]);
  }
  let cancelledPolls=0;
  global.fetch=async(url,options)=>options?.method==='POST'?Response.json({id:'cancelled'}):(cancelledPolls++,Response.json({status:'Cancelado',error:'Cancelado por administración.'}));
  await assert.rejects(require('../components/kit/lib/import-simulator.ts').importSimulatorDocument(new File(['<h1>Fixture</h1>'],'fixture.html'),{...base,educationLevel:'universidad'},[]),/Cancelado por administración/);
  assert.equal(cancelledPolls,1,'Cancelled jobs must fail immediately, without waiting for the extraction deadline');
  const timer=global.setTimeout;let slowPolls=0;
  try{
   global.setTimeout=(callback)=>timer(callback,0);
   global.fetch=async(url,options)=>options?.method==='POST'?Response.json({id:'slow'}):Response.json(++slowPolls<=185?{status:'Procesando'}:{status:'Completado',tests:[{...document.tests[0],questions:document.tests[0].questions.map(q=>({...q,explanation:'Clave documentada.'}))}]});
   const slow=await require('../components/kit/lib/import-simulator.ts').importSimulatorDocument(new File(['<h1>Fixture</h1>'],'fixture.html'),{...base,educationLevel:'universidad'},[{id:'software',name:'Software'}]);
   assert.equal(slowPolls,186);assert.equal(slow.simulator.questions.length,1,'Long extractions must remain recoverable past the former 180-poll deadline');
  }finally{global.setTimeout=timer;}
  console.log('PASS simulator upload and polling for both routes: multipart category, retained keys, scoped careers.');
 }finally{global.fetch=original;}
})().catch(e=>{console.error(e);process.exitCode=1});
