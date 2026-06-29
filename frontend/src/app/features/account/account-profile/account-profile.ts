import {Component, effect, inject} from '@angular/core';
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

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.authService.updateProfile({
      fullName: this.form.getRawValue().fullName ?? '',
      email: this.form.getRawValue().email ?? '',
    });
  }
}
