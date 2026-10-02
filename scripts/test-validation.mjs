import assert from 'node:assert/strict';
import {nameProblem,emailProblem,passwordProblem,textProblem,settingsProblem,studentDocumentProblem,normalizeName,filterNameInput} from '../lib/validation.ts';
let checks=0;
const accept=(check,values)=>{for(const value of values){assert.equal(check(value),'',JSON.stringify(value));checks++;}};
const reject=(check,values)=>{for(const value of values){assert(check(value),JSON.stringify(value));checks++;}};
accept(nameProblem,['María José','O’Connor',"D'Ávila",'Ana-María','Muñoz','李明','Jose\u0301 Pérez','Ana  Pérez','J. Pérez','Ana M. Pérez']);
for (const [input, expected] of [['79799',''],['Ana123','Ana'],['María １２３ Pérez','María  Pérez'],['José\nPérez','José Pérez'],['Ana🙂','Ana'],["D'Ávila", "D'Ávila"],['Ana-María','Ana-María'],['Jose\u0301','José']]) {
  assert.equal(filterNameInput(input),expected);checks++;
}
reject(nameProblem,['5546565','Ana123','<script>','Ana\nPérez','   ',null,{},['Ana'],'a'.repeat(141),'🙂','Ana@Pérez','-Ana']);
assert.equal(normalizeName(' José  Pérez '),'José Pérez');
accept(emailProblem,['ana@example.com',' ana+prueba@example.com ','o.connor@sub.example.ec']);
reject(emailProblem,['ana@@example.com','ana..a@example.com','.ana@example.com','ana@example..com','ana@-example.com','a'.repeat(65)+'@example.com','ana@example.com\r\nBcc:x@example.com',null,123,{},'ana@localhost']);
accept(passwordProblem,['Una frase privada y larga','a'.repeat(128)]);
reject(passwordProblem,['Admin123',' '.repeat(20),'a'.repeat(129),'\u0000'+'a'.repeat(20),null,{},['long password value']]);
reject(v=>textProblem(v,100),[{},null,'<script>','x'.repeat(101),'a\n']);
const settings={name:'Ruta 360',email:'soporte@example.com',year:'2026–2027',timezone:'America/Guayaquil',selfRegistration:'yes',reviewRequired:'yes'};
accept(settingsProblem,[settings,{...settings,timezone:'Pacific/Galapagos'}]);
reject(settingsProblem,[null,[],{...settings,name:123},{...settings,email:'a@@b.com'},{...settings,year:'2027–2026'},{...settings,timezone:'invalid'},{...settings,selfRegistration:true},{...settings,selfRegistration:['yes']},{...settings,timezone:['America/Guayaquil']},{...settings,reviewRequired:['no']}]);
const task={id:'test',title:'Visitar una universidad',date:'2028-02-29',done:false};
accept(v=>studentDocumentProblem('rv360:tasks',v),[[task],[]]);
reject(v=>studentDocumentProblem('rv360:tasks',v),[null,{},[task,task],[{...task,date:'2026-02-30'}],[{...task,title:[]}],[{...task,done:'false'}]]);
accept(v=>studentDocumentProblem('rv360:reflections',v),[{a:'Un texto\ncon varias líneas.'},{}]);
reject(v=>studentDocumentProblem('rv360:reflections',v),[[],null,{a:{}},{a:'a'.repeat(10001)}]);
reject(v=>studentDocumentProblem('rv360:course-done',v),[['8'],['0','0'],[0]]);
console.log(`PASS validation: ${checks} cases covering Unicode names, malformed types, email syntax, password limits, settings, dates and student documents.`);
