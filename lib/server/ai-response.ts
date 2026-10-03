export async function readAIResponse(response: Response) {
  const fail = (message: string, status = 502, code = 'AI_RESPONSE'): never => { throw Object.assign(new Error(message), {status, code}); };
  if(!response.ok){
    if(response.status===429)fail('La IA alcanzó su límite temporal. Vuelve a intentar en unos minutos.',429,'AI_LIMIT');
    const failure = await response.json().catch(() => null);
    const invalidKey = failure?.error?.details?.some((detail: any) => detail?.reason === 'API_KEY_INVALID') || /api[ _-]?key.*(?:invalid|expired|not valid)/i.test(failure?.error?.message || '');
    if([401,403,404].includes(response.status) || invalidKey)fail('Revisa la credencial y el modelo de IA configurados en el servidor.',503,'AI_CONFIG');
    if(response.status===400)fail('El proveedor rechazó el formato de la solicitud de IA. Revisa la versión de la aplicación; no es necesariamente un problema de credenciales.',502,'AI_REQUEST');
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
