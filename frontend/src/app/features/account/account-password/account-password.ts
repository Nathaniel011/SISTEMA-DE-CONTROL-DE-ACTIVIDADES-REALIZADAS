import {HttpErrorResponse} from '@angular/common/http';
import {Component, inject, signal} from '@angular/core';
import {AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators} from '@angular/forms';
import {Button} from 'primeng/button';
import {Card} from 'primeng/card';
import {Message} from 'primeng/message';
import {Password} from 'primeng/password';
import {AuthService} from '../../../core/services/auth.service';

const passwordMatchValidator = (control: AbstractControl): ValidationErrors | null => {
  const nextPassword = control.get('newPassword')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;

  return nextPassword && confirmPassword && nextPassword !== confirmPassword
    ? {passwordMismatch: true}
    : null;
};

@Component({
  selector: 'nv-account-password',
  imports: [
    ReactiveFormsModule,
    Card,
    Password,
    Button,
    Message,
  ],
  templateUrl: './account-password.html',
})
export class AccountPassword {
  private formBuilder = inject(FormBuilder);
  private authService = inject(AuthService);

  saving = signal(false);
  saveError = signal<string | null>(null);
  saveSuccess = signal(false);

  form = this.formBuilder.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  }, {validators: passwordMatchValidator});

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);
    this.saveSuccess.set(false);

    try {
      await this.authService.changePassword({
        currentPassword: this.form.getRawValue().currentPassword ?? '',
        newPassword: this.form.getRawValue().newPassword ?? '',
        confirmPassword: this.form.getRawValue().confirmPassword ?? '',
      });
      this.form.reset();
      this.saveSuccess.set(true);
    } catch (error) {
      this.saveError.set(this.resolveSaveError(error));
    } finally {
      this.saving.set(false);
    }
  }

  private resolveSaveError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (typeof error.error === 'string' && error.error.trim()) {
        return error.error;
      }
      const message = (error.error as { message?: string } | null)?.message;
      if (message) {
        return message;
      }
    }
    return 'No se pudo actualizar la contraseña. Inténtalo de nuevo.';
  }
}
