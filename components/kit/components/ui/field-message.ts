export function fieldMessage(field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  const validity = field.validity;
  if (!validity || validity.valid) return '';
  if (validity.valueMissing) return field.type === 'checkbox' ? 'Marca esta opción para continuar.' : 'Completa este campo para continuar.';
  if (validity.typeMismatch) return field.type === 'email' ? 'Escribe un correo válido, por ejemplo nombre@correo.com.' : 'Escribe una dirección válida.';
  if (validity.tooShort) return `Usa al menos ${(field as HTMLInputElement).minLength} caracteres.`;
  if (validity.tooLong) return `Usa como máximo ${(field as HTMLInputElement).maxLength} caracteres.`;
  if (validity.rangeUnderflow) return `El valor mínimo es ${(field as HTMLInputElement).min}.`;
  if (validity.rangeOverflow) return `El valor máximo es ${(field as HTMLInputElement).max}.`;
  if (validity.badInput || validity.stepMismatch) return 'Escribe un número válido dentro del rango indicado.';
  if (validity.patternMismatch) return 'Revisa el formato indicado para este campo.';
  return field.validationMessage || 'Revisa este campo para continuar.';
}
