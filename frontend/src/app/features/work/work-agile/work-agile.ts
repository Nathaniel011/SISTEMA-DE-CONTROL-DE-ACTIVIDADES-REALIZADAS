import {Component, inject, OnInit} from '@angular/core';
import {Router, RouterLink} from '@angular/router';
import {WorkService} from '../../../core/services/work.service';

@Component({
  selector: 'app-work-agile',
  imports: [RouterLink],
  templateUrl: './work-agile.html',
})
export class WorkAgile implements OnInit {
  workService = inject(WorkService);
  private router = inject(Router);

  ngOnInit(): void {
    const boards = this.workService.boards();
    if (boards.length === 1) {
      this.router.navigate(['/work/agile', boards[0].id], { replaceUrl: true });
    }
  }
}
