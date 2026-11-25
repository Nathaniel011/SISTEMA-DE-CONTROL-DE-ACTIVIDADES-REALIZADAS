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
  styles: `
    :host { --wave-color: var(--p-primary-400); }
    :host-context(.scar-dark) { --wave-color: var(--p-primary-950); }
  `,
})
export class AppNotFound {

}
