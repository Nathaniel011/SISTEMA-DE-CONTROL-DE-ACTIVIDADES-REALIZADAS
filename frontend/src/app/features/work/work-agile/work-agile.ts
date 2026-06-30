import {Component, computed, inject, OnInit, signal} from '@angular/core';
import {Router, RouterLink} from '@angular/router';
import {Button} from 'primeng/button';
import {Dialog} from 'primeng/dialog';
import {InputText} from 'primeng/inputtext';
import {Textarea} from 'primeng/textarea';
import {Select} from 'primeng/select';
import {FormsModule} from '@angular/forms';
import {WorkService} from '../../../core/services/work.service';

@Component({
  selector: 'app-work-agile',
  standalone: true,
  imports: [RouterLink, Button, Dialog, InputText, Textarea, Select, FormsModule],
  templateUrl: './work-agile.html',
})
export class WorkAgile implements OnInit {
  workService = inject(WorkService);
  private router = inject(Router);

  createDialogOpen = signal(false);
  boardName = signal('');
  boardKey = signal('');
  boardDescription = signal('');
  parentBoardId = signal<string | null>(null);

  parentBoardOptions = computed(() => [
    { label: 'Sin tablero padre', value: null },
    ...this.workService.boards().map(b => ({ label: b.name, value: b.id })),
  ]);

  ngOnInit(): void {
    const boards = this.workService.boards();
    if (boards.length === 1) {
      this.router.navigate(['/work/agile', boards[0].id], { replaceUrl: true });
    }
  }

  openCreate(): void {
    this.boardName.set('');
    this.boardKey.set('');
    this.boardDescription.set('');
    this.parentBoardId.set(null);
    this.createDialogOpen.set(true);
  }

  saveBoard(): void {
    const name = this.boardName().trim();
    if (!name) return;
    this.workService.createBoard({
      name,
      key: this.boardKey().trim() || name.slice(0, 4),
      description: this.boardDescription(),
      parentBoardId: this.parentBoardId(),
    });
    this.createDialogOpen.set(false);
  }
}
