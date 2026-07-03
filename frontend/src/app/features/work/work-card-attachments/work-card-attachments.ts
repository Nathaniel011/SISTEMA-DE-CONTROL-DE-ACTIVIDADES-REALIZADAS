import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  OnDestroy,
  signal,
  ElementRef,
  viewChild,
} from '@angular/core';
import {Button} from 'primeng/button';
import {Dialog} from 'primeng/dialog';
import {firstValueFrom} from 'rxjs';
import {WorkApiService} from '../../../core/services/work-api.service';
import {WorkCardDetailStore} from '../../../core/services/work-card-detail.store';
import {FileAccessService} from '../../../core/services/file-access.service';
import {WorkAttachment} from '../work.models';

@Component({
  selector: 'app-work-card-attachments',
  imports: [Button, Dialog],
  templateUrl: './work-card-attachments.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkCardAttachments implements OnDestroy {
  private detailStore = inject(WorkCardDetailStore);
  private workApi = inject(WorkApiService);
  private fileAccess = inject(FileAccessService);

  cardId = input.required<string>();

  fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  uploading = signal(false);
  uploadProgress = signal('');
  deletingId = signal<string | null>(null);
  deleteError = signal<string | null>(null);
  uploadError = signal<string | null>(null);
  preview = signal<WorkAttachment | null>(null);
  previewSrc = signal<string | null>(null);
  blobUrls = signal<Record<string, string>>({});
  loadingBlobId = signal<string | null>(null);
  pendingPreviews = signal<Record<string, string>>({});

  detail = computed(() => this.detailStore.snapshot(this.cardId()));
  attachments = computed(() => this.detail().attachments);

  constructor() {
    effect(() => {
      const items = this.attachments();
      const current = this.blobUrls();
      for (const attachment of items) {
        if (!this.isImage(attachment.mimeType) || current[attachment.id]) continue;
        void this.loadThumbnail(attachment);
      }
    });
  }

  ngOnDestroy(): void {
    for (const attachment of this.attachments()) {
      this.fileAccess.revoke(attachment.fileUrl);
    }
    const preview = this.previewSrc();
    if (preview) URL.revokeObjectURL(preview);
    for (const url of Object.values(this.pendingPreviews())) {
      URL.revokeObjectURL(url);
    }
  }

  openPicker(): void {
    if (this.uploading()) return;
    this.fileInput()?.nativeElement.click();
  }

  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    const id = this.cardId();
    if (!files?.length || !id || this.uploading()) return;

    const fileList = Array.from(files).filter(file => this.isAllowedFile(file));
    const rejected = files.length - fileList.length;
    input.value = '';
    if (!fileList.length) {
      this.uploadError.set('Solo se permiten imágenes seguras y archivos PDF.');
      return;
    }
    this.uploadError.set(
      rejected > 0 ? 'Algunos archivos se omitieron: solo se permiten imágenes seguras y PDF.' : null
    );
    this.uploading.set(true);

    const previews: Record<string, string> = {};
    for (const file of fileList) {
      if (file.type.startsWith('image/')) {
        previews[file.name] = URL.createObjectURL(file);
      }
    }
    this.pendingPreviews.set(previews);

    try {
      const results = await Promise.all(
        fileList.map(async (file, index) => {
          this.uploadProgress.set(`${index + 1} / ${fileList.length}`);
          const response = await firstValueFrom(this.workApi.uploadFile(file, id));
          return this.detailStore.mapUploadResponse(response);
        })
      );
      for (const attachment of results) {
        this.detailStore.addAttachment(id, attachment);
      }
    } finally {
      Object.values(previews).forEach(url => URL.revokeObjectURL(url));
      this.pendingPreviews.set({});
      this.uploading.set(false);
      this.uploadProgress.set('');
    }
  }

  async deleteAttachment(attachmentId: string, event?: Event): Promise<void> {
    event?.stopPropagation();
    event?.preventDefault();

    const id = this.cardId();
    if (!id || this.deletingId()) return;

    const removed = this.attachments().find(a => a.id === attachmentId);
    this.deletingId.set(attachmentId);
    this.deleteError.set(null);
    this.detailStore.removeAttachment(id, attachmentId);
    if (removed) {
      this.fileAccess.revoke(removed.fileUrl);
      this.blobUrls.update(map => {
        const next = { ...map };
        delete next[attachmentId];
        return next;
      });
    }

    try {
      await firstValueFrom(this.workApi.deleteFile(attachmentId));
    } catch {
      this.deleteError.set('No se pudo eliminar el adjunto.');
      if (removed) {
        this.detailStore.addAttachment(id, removed);
      }
    } finally {
      this.deletingId.set(null);
    }
  }

  async openPreview(attachment: WorkAttachment): Promise<void> {
    if (attachment.mimeType.startsWith('image/')) {
      this.loadingBlobId.set(attachment.id);
      try {
        const src = await this.fileAccess.getBlobUrl(attachment.fileUrl);
        this.previewSrc.set(src);
        this.preview.set(attachment);
      } finally {
        this.loadingBlobId.set(null);
      }
      return;
    }
    await this.fileAccess.openFile(attachment.fileUrl, attachment.fileName);
  }

  closePreview(): void {
    this.preview.set(null);
    this.previewSrc.set(null);
  }

  isImage(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  private isAllowedFile(file: File): boolean {
    const name = file.name.toLowerCase();
    if (name.endsWith('.svg') || file.type.toLowerCase().includes('svg')) {
      return false;
    }
    if (/\.(jpe?g|png|gif|webp|bmp|pdf)$/.test(name)) {
      return true;
    }
    return (file.type.startsWith('image/') && !file.type.toLowerCase().includes('svg'))
      || file.type === 'application/pdf';
  }

  fileExtension(fileName: string): string {
    const dot = fileName.lastIndexOf('.');
    return dot >= 0 ? fileName.slice(dot + 1).toUpperCase() : 'FILE';
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  thumbnailSrc(attachment: WorkAttachment): string | null {
    return this.blobUrls()[attachment.id] ?? null;
  }

  private async loadThumbnail(attachment: WorkAttachment): Promise<void> {
    try {
      const src = await this.fileAccess.getBlobUrl(attachment.fileUrl);
      this.blobUrls.update(map => ({ ...map, [attachment.id]: src }));
    } catch {
      // Thumbnail opcional; el usuario puede abrir el archivo igualmente.
    }
  }
}
