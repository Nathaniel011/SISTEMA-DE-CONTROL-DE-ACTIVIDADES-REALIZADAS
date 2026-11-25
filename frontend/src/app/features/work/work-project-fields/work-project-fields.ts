import {ChangeDetectionStrategy, Component, input, output} from '@angular/core';
import {InputText} from 'primeng/inputtext';
import {IssueFieldValues, ProjectField, ProjectFieldKind} from '../../../core/services/project-configuration-api.service';

export const PROJECT_FIELD_KINDS: Record<ProjectFieldKind, string> = {
  text: 'Texto', integer: 'Número entero', date: 'Fecha', booleanValue: 'Sí / No', enumeration: 'Lista de opciones',
};

@Component({
  selector: 'app-work-project-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InputText],
  template: `
    @for (field of fields(); track field.id) {
      @let id = prefix() + '-' + field.id;
      @let value = values()[field.id] ?? '';
      <div class="grid min-w-0 gap-1.5">
        <label [for]="id" class="text-sm font-medium text-surface-700">{{ field.name }}</label>
        @if (readonly()) {
          <p [id]="id" class="m-0 break-words text-sm">{{ display(field, value) }}</p>
        } @else if (field.kind === 'enumeration' || field.kind === 'booleanValue') {
          <select [id]="id" class="p-inputtext w-full" [value]="value" [disabled]="disabled()"
            (change)="changed.emit({id: field.id, value: $any($event.target).value || null})">
            <option value="">Sin valor</option>
            @for (option of options(field); track option.value) {
              <option [value]="option.value" [selected]="option.value === value">{{ option.label }}</option>
            }
          </select>
        } @else {
          <input pInputText [id]="id" class="w-full" [type]="field.kind === 'integer' ? 'number' : field.kind"
            [value]="value" [disabled]="disabled()" maxlength="500"
            (input)="changed.emit({id: field.id, value: $any($event.target).value || null})" />
        }
      </div>
    }
  `,
})
export class WorkProjectFields {
  readonly fields = input.required<ProjectField[]>();
  readonly values = input.required<IssueFieldValues>();
  readonly prefix = input.required<string>();
  readonly readonly = input(false);
  readonly disabled = input(false);
  readonly changed = output<{id: string; value: string | null}>();

  protected options(field: ProjectField) {
    return field.kind === 'booleanValue' ? [
      {value: 'true', label: 'Sí'}, {value: 'false', label: 'No'},
    ] : field.options.map(value => ({value, label: value}));
  }

  protected display(field: ProjectField, value: string): string {
    if (!value) return 'Sin valor';
    return field.kind === 'booleanValue' ? (value === 'true' ? 'Sí' : 'No') : value;
  }
}
