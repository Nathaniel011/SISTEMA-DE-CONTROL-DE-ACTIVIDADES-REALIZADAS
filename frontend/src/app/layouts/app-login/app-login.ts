import {Component, inject, signal} from '@angular/core';
import {Button} from 'primeng/button';
import {IconField} from 'primeng/iconfield';
import {InputIcon} from 'primeng/inputicon';
import {InputText} from 'primeng/inputtext';
import {Image} from 'primeng/image';
import {Message} from 'primeng/message';
import {FormsModule} from '@angular/forms';
import {AuthService} from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  imports: [
    Button,
    IconField,
    InputIcon,
    InputText,
    Image,
    Message,
    FormsModule,
  ],
  templateUrl: './app-login.html',
})
export class AppLogin {
  authService = inject(AuthService);

  username = signal('administrador');
  password = signal('');
  loading = signal(false);
  error = signal<string | null>(null);

  async login(): Promise<void> {
    this.error.set(null);
    this.loading.set(true);
    try {
      const identifier = this.username().trim();
      await this.authService.login({
        username: identifier.includes('@') ? identifier.toLowerCase() : identifier,
        password: this.password(),
      });
    } catch {
      this.error.set('Credenciales inválidas o API no disponible.');
    } finally {
      this.loading.set(false);
    }
  }
}
