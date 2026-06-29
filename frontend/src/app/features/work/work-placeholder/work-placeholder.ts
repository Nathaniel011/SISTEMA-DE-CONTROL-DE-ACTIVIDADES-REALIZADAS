import {Component, inject} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {Button} from 'primeng/button';
import {RouterLink} from '@angular/router';

@Component({
  selector: 'app-work-placeholder',
  imports: [Button, RouterLink],
  templateUrl: './work-placeholder.html',
})
export class WorkPlaceholder {
  private route = inject(ActivatedRoute);
  title = this.route.snapshot.data['title'] as string;
  description = this.route.snapshot.data['description'] as string;
  icon = (this.route.snapshot.data['icon'] as string) ?? 'pi pi-box';
}
