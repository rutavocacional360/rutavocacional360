/** Keep saved reports readable without exposing provider details from older versions. */
export function reportLimitations(values: string[] = []): string[] {
 return [...new Set(values.map(value => /\bIA\b|inteligencia artificial|gemini/i.test(value)
  ? 'Esta orientación se basa en tus resultados y opciones de tu ruta. Contrasta las recomendaciones con asignaturas, experiencias y orientación docente.'
  : value))];
}
