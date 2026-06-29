import {Component, computed, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {Button} from 'primeng/button';
import {Card} from 'primeng/card';
import {InputText} from 'primeng/inputtext';
import {MultiSelect} from 'primeng/multiselect';
import {ToggleSwitch} from 'primeng/toggleswitch';
import {UsersService} from '../../../core/services/users.service';
import {USER_ROLE_OPTIONS, UserFormPayload} from '../users.models';

@Component({
  selector: 'nv-users-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Card,
    InputText,
    MultiSelect,
    ToggleSwitch,
    Button
  ],
  templateUrl: './users-form.html',
})
export class UsersForm {
  private formBuilder = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private usersService = inject(UsersService);

  private mode = this.route.snapshot.routeConfig?.path === 'create'
    ? 'create'
    : this.route.snapshot.routeConfig?.path === 'show'
      ? 'view'
      : 'edit';
  private userId = Number(this.route.snapshot.paramMap.get('id'));
  private currentUser = Number.isNaN(this.userId) ? undefined : this.usersService.getUserById(this.userId);

  isViewMode = this.mode === 'view';
  isCreateMode = this.mode === 'create';
  roleOptions = USER_ROLE_OPTIONS;
  generatedUsername = computed(() => this.currentUser?.username ?? 'Se generará automáticamente desde backend');
  cancelRoute = computed(() => this.currentUser ? ['/users', this.currentUser.id, 'show'] : ['/users']);

  form = this.formBuilder.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    username: [{value: '', disabled: true}],
    email: ['', [Validators.required, Validators.email]],
    roles: [<string[]>[], Validators.required],
    active: [true, Validators.required],
  });

  constructor() {
    if (this.currentUser) {
      this.form.patchValue({
        fullName: this.currentUser.fullName,
        username: this.currentUser.username,
        email: this.currentUser.email,
        roles: this.currentUser.roles,
        active: this.currentUser.active,
      });
    }

    if (this.isViewMode) {
      this.form.disable();
    }
  }

  save(): void {
    if (this.isViewMode) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload: UserFormPayload = {
      fullName: this.form.getRawValue().fullName ?? '',
      email: this.form.getRawValue().email ?? '',
      roles: this.form.getRawValue().roles ?? [],
      active: this.form.getRawValue().active ?? true,
    };

    if (this.isCreateMode) {
      const user = this.usersService.createUser(payload);
      this.router.navigate(['/users', user.id, 'show']);
      return;
    }

    if (!this.currentUser) {
      this.router.navigate(['/users']);
      return;
    }

    this.usersService.updateUser(this.currentUser.id, payload);
    this.router.navigate(['/users', this.currentUser.id, 'show']);
  }

  edit(): void {
    if (!this.currentUser) {
      return;
    }

    this.router.navigate(['/users', this.currentUser.id, 'edit']);
  }
}
