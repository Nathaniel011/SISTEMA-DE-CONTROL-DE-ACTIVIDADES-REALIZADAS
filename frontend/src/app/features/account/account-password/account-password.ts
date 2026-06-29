import {Component, inject} from '@angular/core';
import {AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators} from '@angular/forms';
import {Button} from 'primeng/button';
import {Card} from 'primeng/card';
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
    Button
  ],
  templateUrl: './account-password.html',
})
export class AccountPassword {
  private formBuilder = inject(FormBuilder);
  private authService = inject(AuthService);

  form = this.formBuilder.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  }, {validators: passwordMatchValidator});

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.authService.changePassword({
      currentPassword: this.form.getRawValue().currentPassword ?? '',
      newPassword: this.form.getRawValue().newPassword ?? '',
      confirmPassword: this.form.getRawValue().confirmPassword ?? '',
    });

    this.form.reset();
  }
}
