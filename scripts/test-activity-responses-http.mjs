import assert from 'node:assert/strict';

export async function runActivityResponsesHttp({request,cookie,adminCookie}) {
 const json=async(path,body,session=cookie,method=body?'POST':'GET')=>{
  const response=await request(path,body,session,method),value=await response.json();
  assert.equal(response.status,200,path+': '+(value.error||''));return value;
 };
 const state=await json('training');
 const course=await json('training/entity',{kind:'course',entity:{id:'',version:0,revision:0,status:'published',educationLevel:state.educationLevel,title:'Preguntas de curso HTTP',description:'Reflexiones personales',objectives:'Explorar intereses',level:'Inicial',type:'general',careerIds:[],institutions:[],fields:[],access:'all',studentIds:[],activities:[{id:'questions',module:'Mi futuro',title:'Reflexiona',kind:'text',content:'¿Qué disfrutas aprender?\n¿Qué apoyo necesitas?',required:true,completion:'read'}]}},adminCookie);
 const enrollment=await json('training/enroll',{courseId:course.id});
 const body={enrollmentId:enrollment.id,activityId:'questions',revision:0,answers:{'question-1':'Tecnología'},complete:false};
 assert.equal((await request('training/activity-response',body,'','PUT')).status,401);
 assert.equal((await request('training/activity-response',body,adminCookie,'PUT')).status,403);
 assert.equal((await request('training/activity-response',{...body,complete:true},cookie,'PUT')).status,400);
 const draft=await json('training/activity-response',body,cookie,'PUT');assert.equal(draft.response.revision,1);assert.deepEqual(draft.enrollment.completed,[]);
 const restored=await json('training/enroll',{courseId:course.id});assert.equal(restored.responses.questions.answers['question-1'],'Tecnología');
 assert.equal((await request('training/activity-response',body,cookie,'PUT')).status,409);
 const delivered=await json('training/activity-response',{...body,revision:1,complete:true,answers:{...body.answers,'question-2':'Orientación para comparar opciones'}},cookie,'PUT');
 assert(delivered.response.submittedAt);assert.equal(delivered.enrollment.progress.percent,100);
 const adminState=await json('training',null,adminCookie);
 assert.equal(adminState.enrollments.find(e=>e.id===enrollment.id).responses.questions.answers['question-2'],'Orientación para comparar opciones');
 console.log('PASS HTTP activity responses: authenticated student drafts, invalid submission/admin writes rejected, persisted answers reload, stale writes rejected, complete progress and admin review.');
}
