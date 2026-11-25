import {ChangeDetectionStrategy, Component, computed, input, model, signal} from '@angular/core';
import {NgTemplateOutlet} from '@angular/common';
import {InputText} from 'primeng/inputtext';
import {Textarea} from 'primeng/textarea';
import {debouncedAction} from '../../../core/timing/debounced-action';

const VOCABULARY = `actividad actividades actualización actualizar actualizado adjuntar adjunto administración administrativo
agenda agendar análisis anexo aprobación aprobado aprobar archivo archivado asignación asignado asignar asistencia atención
atender auditoría autorización autorizado aviso bandeja borrador calendario cambio cancelación cancelar canal categoría
certificación certificado cierre clasificar cliente comentario comunicación comunicado comprobante confirmar confirmación
consulta consultar contacto control coordinación coordinador coordinar correo corrección corregir crítico cronograma dato datos
decisión demora dependencia descripción derivación derivar detalle diagnóstico dirección documento documentación duplicado
ejecución emergencia encargado enlace entrega enviar escritorio escalamiento estado estimación evaluación evidencia expediente
fecha formulario gestión gestionar guardado horario identificación implementación incidencia incidencias indicador información
informar informe integración interno inventario investigación jefatura licencia mantenimiento miembro modificación modificar
notificación notificar observación oficina operación operativo organización participante permiso personal planificación
planificar plazo política prioridad procedimiento proceso programación programar proyecto recepción recibir recibido recapitulación
reclamo recomendación recuperado recuperar referencia registración registrado registrar registro reintentar reprogramación
requisito resolución resolver respuesta revisar revisión riesgo ruta seguridad seguimiento servicio sesión sistema solicitud
solicitudes solicitante solución supervisión tablero tarea tareas técnico tiempo ticket trámite tramitación transferencia
transición actualización usuario validación validar vencido vencimiento verificación verificar visible visibilidad urgente
pendiente completado planificado solicitado reportado entrega confirmar ubicación horario responsable responsables recurso
recursos recibido resuelto enviando disponible disponibilidad contactar siguiente adjuntos adjunto públicas público pública`
  .split(/\s+/);

function searchKey(word: string): string {
  return word.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u0301\u0308]/g, '').normalize('NFC');
}

const WORDS = [...new Set(VOCABULARY)].map(word => ({word, key: searchKey(word)}));

@Component({
  selector: 'app-work-writing-field',
  imports: [InputText, Textarea, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './work-writing-field.html',
  host: {class: 'block min-w-0'},
})
export class WorkWritingField {
  readonly value = model('');
  readonly inputId = input.required<string>();
  readonly label = input.required<string>();
  readonly placeholder = input('');
  readonly maxLength = input(500);
  readonly rows = input(0);
  readonly required = input(false);
  readonly disabled = input(false);
  readonly fieldClass = input('');

  private readonly caret = signal(0);
  private readonly open = signal(false);
  private readonly composing = signal(false);
  private readonly ready = signal(false);
  private readonly suggestionDelay = debouncedAction(160);
  protected readonly selected = signal(-1);
  protected readonly listId = computed(() => `${this.inputId()}-suggestions`);
  private readonly token = computed(() => {
    const value = this.value();
    const caret = this.caret();
    const prefix = value.slice(0, caret).match(/[\p{L}\p{M}]+$/u)?.[0] ?? '';
    const suffix = value.slice(caret).match(/^[\p{L}\p{M}]+/u)?.[0] ?? '';
    return {prefix, start: caret - prefix.length, end: caret + suffix.length};
  });
  protected readonly suggestions = computed(() => {
    const {prefix, start, end} = this.token();
    if (!this.ready() || !this.open() || this.composing() || this.disabled() || prefix.length < 3) return [];
    const key = searchKey(prefix);
    const original = this.value().slice(start, end).toLocaleLowerCase('es');
    return WORDS.filter(({key: candidate}) => candidate.startsWith(key))
      .sort((a, b) => Number(b.key === key) - Number(a.key === key) || a.word.length - b.word.length)
      .map(({word}) => word)
      .filter(word => word !== original && this.value().length - (end - start) + word.length <= this.maxLength())
      .slice(0, 5)
      .map(word => this.matchCapitalization(word, prefix));
  });

  protected onInput(field: HTMLInputElement | HTMLTextAreaElement): void {
    this.value.set(field.value);
    this.onCaret(field);
  }

  protected onCaret(field: HTMLInputElement | HTMLTextAreaElement): void {
    this.caret.set(field.selectionStart ?? field.value.length);
    this.open.set(field.selectionStart === field.selectionEnd);
    this.selected.set(-1);
    this.ready.set(false);
    this.suggestionDelay.schedule(() => this.ready.set(true));
  }

  protected composition(active: boolean, field: HTMLInputElement | HTMLTextAreaElement): void {
    this.composing.set(active);
    if (!active) this.onInput(field);
  }

  protected close(): void {
    this.suggestionDelay.cancel();
    this.ready.set(false);
    this.open.set(false);
    this.selected.set(-1);
  }

  protected onKey(event: KeyboardEvent, field: HTMLInputElement | HTMLTextAreaElement): void {
    const suggestions = this.suggestions();
    if (event.isComposing || !suggestions.length) return;
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const current = this.selected();
      const next = current < 0 ? (event.key === 'ArrowDown' ? 0 : suggestions.length - 1)
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length;
      this.selected.set(next);
    } else if (event.key === 'Enter' && suggestions[this.selected()]) {
      event.preventDefault();
      this.accept(suggestions[this.selected()], field);
    }
  }

  protected accept(word: string, field: HTMLInputElement | HTMLTextAreaElement): void {
    const {start, end} = this.token();
    const value = this.value();
    const replacement = value.slice(0, start) + word + value.slice(end);
    this.value.set(replacement);
    field.value = replacement;
    field.focus();
    field.setSelectionRange(start + word.length, start + word.length);
    this.close();
  }

  private matchCapitalization(word: string, prefix: string): string {
    if (prefix === prefix.toLocaleUpperCase('es')) return word.toLocaleUpperCase('es');
    return /^\p{Lu}/u.test(prefix) ? word.charAt(0).toLocaleUpperCase('es') + word.slice(1) : word;
  }
}
