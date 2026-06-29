import {Component, inject} from '@angular/core';
import {RouterLink, RouterOutlet} from '@angular/router';
import {Button} from 'primeng/button';
import {Card} from 'primeng/card';
import {Toolbar} from 'primeng/toolbar';
import {AppService} from '../../../core/services/app.service';

@Component({
  selector: 'nv-attentions-home',
  imports: [
    Card,
    Button,
    Toolbar,
    RouterOutlet,
    RouterLink
  ],
  templateUrl: './attentions-home.html',
})
export class AttentionsHome {
  appService = inject(AppService);
}
