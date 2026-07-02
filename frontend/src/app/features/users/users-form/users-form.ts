import {DatePipe, NgTemplateOutlet} from '@angular/common';
import {HttpErrorResponse} from '@angular/common/http';
import {Component, computed, inject, Input, OnChanges, OnInit, output, signal, SimpleChanges} from '@angular/core';
import {FormBuilder, FormsModule, ReactiveFormsModule, Validators} from '@angular/forms';
import {ActivatedRoute, Router} from '@angular/router';
import {Button} from 'primeng/button';
import {Card} from 'primeng/card';
import {Checkbox} from 'primeng/checkbox';
import {InputText} from 'primeng/inputtext';
import {Message} from 'primeng/message';
import {Tag} from 'primeng/tag';
import {ToggleSwitch} from 'primeng/toggleswitch';
import {UsersService} from '../../../core/services/users.service';
import {PermissionsService} from '../../../core/services/permissions.service';
import {MAX_USER_ROLES, USER_ROLE_OPTIONS, UserFormPayload, UserRecord} from '../users.models';

@Component({
  selector: 'nv-users-form',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    NgTemplateOutlet,
    Card,
    InputText,
    Checkbox,
    ToggleSwitch,
    Button,
    Message,
    Tag,
  ],
  templateUrl: './users-form.html',
})
export class UsersForm implements OnInit, OnChanges {
  private formBuilder = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private usersService = inject(UsersService);
  permissions = inject(PermissionsService);

  @Input() embedded = false;
  @Input() formMode: 'create' | 'edit' | 'view' = 'create';
  @Input() userId = '';

  cancelled = output<void>();
  saved = output<UserRecord>();

  private routeMode: 'create' | 'edit' | 'view' = this.route.snapshot.routeConfig?.path === 'create'
    ? 'create'
    : this.route.snapshot.routeConfig?.path === 'show'
      ? 'view'
      : 'edit';
  private routeUserId = this.route.snapshot.paramMap.get('id') ?? '';

  mode = signal<'create' | 'edit' | 'view'>('create');
  maxRoles = MAX_USER_ROLES;
  generatedPassword = signal<string | null>(null);
  saveError = signal<string | null>(null);
  saving = signal(false);
  currentUser = signal<UserRecord | undefined>(undefined);
  generatedUsername = computed(() => this.currentUser()?.username ?? 'Se generará automáticamente desde backend');
  cancelRoute = computed(() => this.currentUser() ? ['/users', this.currentUser()!.id, 'show'] : ['/users']);

  isViewMode = computed(() => this.mode() === 'view');
  isCreateMode = computed(() => this.mode() === 'create');

  assignableRoleOptions = computed(() => {
    if (this.permissions.isAdmin()) {
      return USER_ROLE_OPTIONS;
    }
    if (this.permissions.isChief()) {
      return USER_ROLE_OPTIONS.filter(option => option.value === 'SECRETARY');
    }
    return [];
  });

  selectedRolesCount = computed(() => (this.form.getRawValue().roles ?? []).length);

  form = this.formBuilder.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    username: [{value: '', disabled: true}],
    email: ['', [Validators.required, Validators.email]],
    roles: [<string[]>[]],
    active: [true, Validators.required],
  });

  ngOnInit(): void {
    if (!this.embedded) {
      const navigationPassword = history.state?.['temporaryPassword'] as string | undefined;
      if (navigationPassword) {
        this.generatedPassword.set(navigationPassword);
      }
    }
    this.syncModeAndUser();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.embedded && (changes['formMode'] || changes['userId'])) {
      this.syncModeAndUser();
    }
  }

  private syncModeAndUser(): void {
    const mode = this.embedded ? this.formMode : this.routeMode;
    const userId = this.embedded ? this.userId : this.routeUserId;
    this.mode.set(mode);
    this.saveError.set(null);

    const rolesControl = this.form.get('roles');
    rolesControl?.clearValidators();
    rolesControl?.updateValueAndValidity({ emitEvent: false });

    void this.usersService.loadUsers().then(() => {
      const user = userId ? this.usersService.getUserById(userId) : undefined;
      this.currentUser.set(user);
      if (user) {
        this.form.patchValue({
          fullName: user.fullName,
          username: user.username,
          email: user.email,
          roles: user.roles,
          active: user.active,
        });
      } else if (mode === 'create') {
        this.form.reset({
          fullName: '',
          username: '',
          email: '',
          roles: [],
          active: true,
        });
      }

      if (mode === 'view') {
        this.form.disable();
      } else {
        this.form.enable();
        this.form.get('username')?.disable();
      }
    });
  }

  isRoleSelected(role: string): boolean {
    return (this.form.getRawValue().roles ?? []).includes(role);
  }

  canSelectMoreRoles(): boolean {
    return this.selectedRolesCount() < this.maxRoles;
  }

  toggleRole(role: string, checked: boolean): void {
    if (checked) {
      this.form.patchValue({ roles: [role] });
    } else {
      this.form.patchValue({ roles: [] });
    }
    this.form.get('roles')?.markAsTouched();
    this.form.get('roles')?.updateValueAndValidity();
  }

  roleLabel(role: string): string {
    return this.permissions.roleLabel(role);
  }

  async save(): Promise<void> {
    if (this.isViewMode()) {
      return;
    }

    this.saveError.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const roles = this.isCreateMode() ? [] : (this.form.getRawValue().roles ?? []);
    if (!this.isCreateMode() && roles.length > this.maxRoles) {
      this.form.get('roles')?.setErrors({ maxRoles: true });
      return;
    }

    const payload: UserFormPayload = {
      fullName: this.form.getRawValue().fullName ?? '',
      email: this.form.getRawValue().email ?? '',
      roles,
      active: this.form.getRawValue().active ?? true,
    };

    this.saving.set(true);
    try {
      if (this.isCreateMode()) {
        const user = await this.usersService.createUser(payload);
        if (this.embedded) {
          this.saved.emit(user);
          return;
        }
        this.router.navigate(['/users', user.id, 'show'], {
          state: { temporaryPassword: user.temporaryPassword ?? null },
        });
        return;
      }

      const current = this.currentUser();
      if (!current) {
        if (this.embedded) {
          this.cancelled.emit();
        } else {
          this.router.navigate(['/users']);
        }
        return;
      }

      const updated = await this.usersService.updateUser(current.id, payload);
      if (this.embedded) {
        this.saved.emit(updated);
        return;
      }
      this.router.navigate(['/users', current.id, 'show']);
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
      if (error.status === 409) {
        return 'El correo ya está registrado.';
      }
    }
    return 'No se pudo guardar el usuario. Inténtalo de nuevo.';
  }

  cancel(): void {
    if (this.embedded) {
      this.cancelled.emit();
      return;
    }
    this.router.navigate(this.cancelRoute());
  }

  edit(): void {
    const current = this.currentUser();
    if (!current) {
      return;
    }
    if (this.embedded) {
      this.mode.set('edit');
      this.form.enable();
      this.form.get('username')?.disable();
      return;
    }
    this.router.navigate(['/users', current.id, 'edit']);
  }
}
