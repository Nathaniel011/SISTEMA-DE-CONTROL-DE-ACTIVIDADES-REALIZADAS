import {HttpErrorResponse} from '@angular/common/http';
import {Component, ElementRef, inject, signal, viewChild} from '@angular/core';
import { Button } from 'primeng/button';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Image } from 'primeng/image';
import { Message } from 'primeng/message';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

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
  styleUrl: './app-login.css',
})
export class AppLogin {
  authService = inject(AuthService);
  private usernameField = viewChild.required<ElementRef<HTMLInputElement>>('usernameField');
  private passwordField = viewChild.required<ElementRef<HTMLInputElement>>('passwordField');

  username = signal('');
  password = signal('');
  loading = signal(false);
  error = signal<string | null>(null);
  submitted = signal(false);

  async login(): Promise<void> {
    if (this.loading()) return;
    this.submitted.set(true);
    const identifier = this.username().trim();
    const password = this.password();
    if (!identifier || !password) {
      if (!identifier) {
        this.error.set(password ? 'Ingresa tu usuario o correo.' : 'Ingresa tu usuario o correo y tu contraseña.');
        this.usernameField().nativeElement.focus();
      } else {
        this.error.set('Ingresa tu contraseña.');
        this.passwordField().nativeElement.focus();
      }
      return;
    }

    this.error.set(null);
    this.loading.set(true);
    try {
      await this.authService.login({
        username: identifier.includes('@') ? identifier.toLowerCase() : identifier,
        password,
      });
    } catch (error) {
      const status = error instanceof HttpErrorResponse ? error.status : undefined;
      if (status === 401 || status === 403) {
        this.error.set('El usuario, correo o contraseña no son correctos.');
      } else if (status === 429) {
        this.error.set('Demasiados intentos. Espera unos minutos antes de volver a intentar.');
      } else if (status === 400) {
        this.error.set('Revisa el usuario, correo o contraseña que ingresaste.');
      } else {
        this.error.set('No pudimos iniciar sesión. Intenta de nuevo en unos momentos.');
      }
    } finally {
      this.loading.set(false);
    }
  }
}
