import {Component, effect, inject, signal} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {Button} from 'primeng/button';
import {Card} from 'primeng/card';
import {InputText} from 'primeng/inputtext';
import {AuthService} from '../../../core/services/auth.service';

@Component({
  selector: 'nv-account-profile',
  imports: [
    ReactiveFormsModule,
    Card,
    InputText,
    Button
  ],
  templateUrl: './account-profile.html',
})
export class AccountProfile {
  private formBuilder = inject(FormBuilder);
  private authService = inject(AuthService);

  saving = signal(false);
  saveError = signal<string | null>(null);
  saveSuccess = signal(false);

  form = this.formBuilder.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    username: [{value: '', disabled: true}],
    email: ['', [Validators.required, Validators.email]],
    roles: [{value: '', disabled: true}],
  });

  constructor() {
    effect(() => {
      const user = this.authService.currentUser();
      if (!user) {
        return;
      }

      this.form.patchValue({
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        roles: user.roles.join(', '),
      });
    });
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);
    this.saveSuccess.set(false);
    try {
      await this.authService.updateProfile({
        fullName: this.form.getRawValue().fullName ?? '',
        email: this.form.getRawValue().email ?? '',
      });
      this.saveSuccess.set(true);
    } catch {
      this.saveError.set('No se pudo guardar el perfil. Inténtalo de nuevo.');
    } finally {
      this.saving.set(false);
    }
  }
}
