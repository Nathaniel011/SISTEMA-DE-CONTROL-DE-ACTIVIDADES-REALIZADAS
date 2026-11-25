import {ChangeDetectionStrategy, Component, input} from '@angular/core';
import {Skeleton} from 'primeng/skeleton';

@Component({
  selector: 'app-work-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Skeleton],
  template: `
    <div role="status" class="grid gap-2 rounded-xl border border-surface-200 bg-surface-0 px-4 py-3">
      <span class="sr-only">{{ label() }}</span>
      <div class="grid gap-2 motion-reduce:[&_.p-skeleton]:animate-none" aria-hidden="true">
        @for (size of widths; track $index) {
          <div class="grid min-h-10 grid-cols-[minmax(0,2fr)_minmax(3rem,1fr)_minmax(3rem,1fr)] items-center gap-3">
            <p-skeleton [width]="size" height=".95rem" />
            <p-skeleton width="72%" height=".75rem" />
            <p-skeleton width="56%" height=".75rem" />
          </div>
        }
      </div>
    </div>
  `,
})
export class WorkSkeleton {
  readonly label = input('Cargando resultados…');
  protected readonly widths = ['78%', '64%', '87%', '72%', '81%'];
}
