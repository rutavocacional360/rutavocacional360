type Environment = Record<string, string | undefined>;

export function aiConnection(env: Environment = process.env) {
  const key = env.GEMINI_API_KEY?.trim() || '';
  const model = (env.GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite').replace(/^models\//, '');
  if (!key || ['REEMPLAZAR', 'YOUR_API_KEY', 'isolated-ci-not-a-provider-key'].includes(key) || !/^[a-zA-Z0-9_.-]+$/.test(model)) {
    throw Object.assign(Error('Revisa la credencial y el modelo de IA configurados en el servidor.'), {status: 503, code: 'AI_CONFIG'});
  }
  return {key, model};
}

/** Bounded retries for temporary upstream failures; never retry invalid keys or quota. */
export async function requestAI(payload: unknown, env: Environment = process.env, request: typeof fetch = fetch, timeout = 45000) {
  const {key, model} = aiConnection(env);
  const signal = AbortSignal.timeout(timeout);
  try {
    for (let attempt = 0; ; attempt++) {
      const response = await request(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', cache: 'no-store', headers: {'Content-Type': 'application/json', 'x-goog-api-key': key}, signal, body: JSON.stringify(payload),
      });
      if (attempt || ![500, 502, 503, 504].includes(response.status)) return response;
      await response.body?.cancel();
      await new Promise(resolve => setTimeout(resolve, 300));
      signal.throwIfAborted();
    }
  } catch (error: any) {
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw Object.assign(Error(timeout ? 'La IA tardó demasiado en responder. Vuelve a intentar.' : 'No se pudo conectar con la IA. Vuelve a intentar.'), {status: 503, code: timeout ? 'AI_TIMEOUT' : 'AI_UNAVAILABLE'});
  }
}
