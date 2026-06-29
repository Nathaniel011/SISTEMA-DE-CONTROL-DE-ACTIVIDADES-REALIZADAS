import {Component, inject, signal} from '@angular/core';
import {RouterLink} from '@angular/router';
import {Button} from 'primeng/button';
import {Dialog} from 'primeng/dialog';
import {InputText} from 'primeng/inputtext';
import {Textarea} from 'primeng/textarea';
import {FormsModule} from '@angular/forms';
import {Tag} from 'primeng/tag';
import {WorkService} from '../../../core/services/work.service';

@Component({
  selector: 'app-work-projects',
  imports: [RouterLink, Button, Dialog, InputText, Textarea, FormsModule, Tag],
  templateUrl: './work-projects.html',
})
export class WorkProjects {
  workService = inject(WorkService);
  createDialogOpen = signal(false);
  boardName = signal('');
  boardKey = signal('');
  boardDescription = signal('');

  openCreate(): void {
    this.boardName.set('');
    this.boardKey.set('');
    this.boardDescription.set('');
    this.createDialogOpen.set(true);
  }

  save(): void {
    const name = this.boardName().trim();
    if (!name) return;
    this.workService.createBoard({
      name,
      key: this.boardKey().trim() || name.slice(0, 3),
      description: this.boardDescription(),
    });
    this.createDialogOpen.set(false);
  }
}
