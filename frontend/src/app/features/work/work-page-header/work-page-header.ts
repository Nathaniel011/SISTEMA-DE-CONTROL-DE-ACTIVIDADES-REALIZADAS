import {ChangeDetectionStrategy, Component, input} from '@angular/core';

@Component({
  selector: 'app-work-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-surface-200 bg-surface-0 p-4 sm:p-5">
      <div class="flex min-w-0 items-start gap-3">
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-50 text-primary-800" aria-hidden="true">
          <i [class]="icon()"></i>
        </span>
        <div class="min-w-0">
          <h1 [id]="headingId()" class="m-0 break-words text-2xl font-semibold text-surface-950">{{ title() }}</h1>
          @if (description()) { <p class="mb-0 mt-1 text-sm text-surface-600">{{ description() }}</p> }
        </div>
      </div>
      <div class="flex max-w-full flex-wrap items-center gap-2"><ng-content /></div>
    </header>
  `,
})
export class WorkPageHeader {
  readonly title = input.required<string>();
  readonly icon = input.required<string>();
  readonly headingId = input.required<string>();
  readonly description = input('');
}
