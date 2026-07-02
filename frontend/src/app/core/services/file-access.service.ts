import {inject, Injectable, OnDestroy} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {firstValueFrom} from 'rxjs';
import {resolveWorkFileUrl} from '../../features/work/work.utils';

@Injectable({ providedIn: 'root' })
export class FileAccessService implements OnDestroy {
  private http = inject(HttpClient);
  private cache = new Map<string, string>();

  async getBlobUrl(fileUrl: string): Promise<string> {
    const resolved = resolveWorkFileUrl(fileUrl);
    const cached = this.cache.get(resolved);
    if (cached) return cached;

    const blob = await firstValueFrom(this.http.get(resolved, { responseType: 'blob' }));
    const objectUrl = URL.createObjectURL(blob);
    this.cache.set(resolved, objectUrl);
    return objectUrl;
  }

  async openFile(fileUrl: string, fileName: string): Promise<void> {
    const url = await this.getBlobUrl(fileUrl);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    anchor.download = fileName;
    anchor.click();
  }

  revoke(fileUrl: string): void {
    const resolved = resolveWorkFileUrl(fileUrl);
    const cached = this.cache.get(resolved);
    if (!cached) return;
    URL.revokeObjectURL(cached);
    this.cache.delete(resolved);
  }

  ngOnDestroy(): void {
    for (const url of this.cache.values()) {
      URL.revokeObjectURL(url);
    }
    this.cache.clear();
  }
}
