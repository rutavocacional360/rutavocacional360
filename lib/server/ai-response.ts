export async function readAIResponse(response: Response) {
  const fail = (message: string, status = 502, code = 'AI_RESPONSE'): never => { throw Object.assign(new Error(message), {status, code}); };
  if(!response.ok){
    if(response.status===429)fail('La IA alcanzó su límite temporal. Vuelve a intentar en unos minutos.',429,'AI_LIMIT');
    if([400,401,403].includes(response.status))fail('Revisa la credencial y el modelo de IA configurados en el servidor.',503,'AI_CONFIG');
    fail('El proveedor de IA no está disponible temporalmente. Intenta nuevamente.',503,'AI_PROVIDER');
  }
  try{
    const payload=await response.json(),candidate=payload.candidates?.[0];
    if(candidate?.finishReason!=='STOP')fail('La respuesta de IA quedó incompleta. Intenta nuevamente.');
    const text=candidate.content?.parts?.filter((p:any)=>!p.thought).map((p:any)=>p.text||'').join('');
    const value=JSON.parse(text||'null');
    if(!value||typeof value!=='object'||Array.isArray(value))fail('La IA devolvió una respuesta no válida.');
    return value;
  }catch(error:any){
    if(error.code==='AI_RESPONSE')throw error;
    fail('La IA devolvió una respuesta no válida. Intenta nuevamente.');
  }
}
