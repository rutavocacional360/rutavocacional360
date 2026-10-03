/** Synthetic examples exercise the same prompts, schema and validators as student reports. */
export function diagnosticReport(educationLevel) {
  const evidence = ['diagnostic-interest:dimension:I'];
  return {
    instruments: [{instrumentId: 'diagnostic-interest', instrument: {educationLevel}, scores: [{dimension: 'I', value: 20, min: 5, max: 25}]}],
    catalog: [{id: 'diagnostic-software', name: 'Ingeniería de Software'}],
    analysis: educationLevel === 'bachillerato'
      ? {pathway: {suggested: 'tecnico', science: [], technical: [{id: 'diagnostic-informatica', name: 'Informática', evidence}]}}
      : {recommendations: [{careerId: 'diagnostic-software', evidence}]},
  };
}
