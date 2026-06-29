import { Component } from '@angular/core';
import {Button} from 'primeng/button';
import {RouterLink} from '@angular/router';

@Component({
  selector: 'app-app-not-found',
  imports: [
    Button,
    RouterLink
  ],
  templateUrl: './app-not-found.html',
})
export class AppNotFound {

}
