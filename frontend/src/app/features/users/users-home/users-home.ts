import {Component, inject} from '@angular/core';
import {Card} from 'primeng/card';
import {Menubar} from 'primeng/menubar';
import {Button, ButtonDirective} from 'primeng/button';
import {Toolbar} from 'primeng/toolbar';
import {StyleClass} from 'primeng/styleclass';
import {RouterLink, RouterOutlet} from '@angular/router';
import {AppService} from '../../../core/services/app.service';

@Component({
  selector: 'nv-users-home',
  imports: [
    Card,
    Button,
    Toolbar,
    RouterOutlet,
    RouterLink
  ],
  templateUrl: './users-home.html',
})
export class UsersHome {
  appService = inject(AppService);
}
