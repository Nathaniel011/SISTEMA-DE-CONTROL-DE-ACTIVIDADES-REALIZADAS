import {inject, Injectable, signal} from '@angular/core';
import {firstValueFrom} from 'rxjs';
import {FileUploadResponse, IssueDetailsResponse, WorkApiService} from './work-api.service';
import {WorkService} from './work.service';
import {WorkAttachment, WorkComment, WorkTimeEntry} from '../../features/work/work.models';

export interface CardDetailState {
  attachments: WorkAttachment[];
  timeEntries: WorkTimeEntry[];
  comments: WorkComment[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

const EMPTY_DETAIL: CardDetailState = {
  attachments: [],
  timeEntries: [],
  comments: [],
  loaded: false,
  loading: false,
  error: null,
};

const MAX_CACHED_CARDS = 20;

@Injectable({ providedIn: 'root' })
export class WorkCardDetailStore {
  private workApi = inject(WorkApiService);
  private workService = inject(WorkService);

  private states = signal<Record<string, CardDetailState>>({});
  private inflight = new Map<string, Promise<void>>();
  private accessOrder: string[] = [];

  snapshot(cardId: string | null | undefined): CardDetailState {
    if (!cardId) return EMPTY_DETAIL;
    const state = this.states()[cardId];
    if (state) {
      this.markAccessed(cardId);
    }
    return state ?? EMPTY_DETAIL;
  }

  async load(cardId: string, force = false): Promise<void> {
    const current = this.snapshot(cardId);
    if (!force && (current.loaded || current.loading)) {
      if (current.loading && this.inflight.has(cardId)) {
        await this.inflight.get(cardId);
      }
      return;
    }

    const task = this.fetch(cardId);
    this.inflight.set(cardId, task);
    try {
      await task;
    } finally {
      this.inflight.delete(cardId);
    }
  }

  invalidate(cardId: string): void {
    const next = { ...this.states() };
    delete next[cardId];
    this.states.set(next);
    this.accessOrder = this.accessOrder.filter(id => id !== cardId);
  }

  setAttachments(cardId: string, attachments: WorkAttachment[]): void {
    this.patch(cardId, { attachments });
    this.syncCard(cardId);
  }

  addAttachment(cardId: string, attachment: WorkAttachment): void {
    const current = this.snapshot(cardId);
    this.patch(cardId, { attachments: [attachment, ...current.attachments] });
    this.workService.addAttachment(cardId, attachment);
  }

  removeAttachment(cardId: string, attachmentId: string): void {
    const current = this.snapshot(cardId);
    this.patch(cardId, {
      attachments: current.attachments.filter(a => a.id !== attachmentId),
    });
    this.workService.removeAttachment(cardId, attachmentId);
  }

  addTimeEntry(cardId: string, entry: WorkTimeEntry): void {
    const current = this.snapshot(cardId);
    if (current.timeEntries.some(item => item.id === entry.id)) {
      return;
    }
    this.patch(cardId, { timeEntries: [entry, ...current.timeEntries] });
  }

  addComment(cardId: string, comment: WorkComment): void {
    const current = this.snapshot(cardId);
    this.patch(cardId, { comments: [...current.comments, comment] });
    const card = this.workService.getCard(cardId);
    if (card) {
      this.workService.replaceCardPublic({ ...card, comments: [...card.comments, comment] });
    }
  }

  mapUploadResponse(response: FileUploadResponse): WorkAttachment {
    return {
      id: response.id,
      fileName: response.fileName,
      fileUrl: response.url,
      mimeType: response.mimeType,
      fileSize: response.fileSize,
      createdAt: response.createdAt ?? new Date().toISOString(),
    };
  }

  private async fetch(cardId: string): Promise<void> {
    this.patch(cardId, { ...this.snapshot(cardId), loading: true, error: null });
    try {
      const details = await firstValueFrom(this.workApi.getIssueDetails(cardId));
      this.applyDetails(cardId, details);
    } catch {
      this.patch(cardId, {
        ...this.snapshot(cardId),
        loading: false,
        error: 'No se pudieron cargar los detalles',
      });
    }
  }

  private applyDetails(cardId: string, details: IssueDetailsResponse): void {
    this.patch(cardId, {
      attachments: details.attachments,
      timeEntries: details.timeEntries,
      comments: details.comments,
      loaded: true,
      loading: false,
      error: null,
    });
    this.syncCard(cardId, details);
    this.syncTrackedMinutes(cardId, details.timeEntries);
  }

  private syncTrackedMinutes(cardId: string, timeEntries: WorkTimeEntry[]): void {
    const total = Math.max(0, timeEntries.reduce((sum, entry) => sum + entry.minutes, 0));
    const card = this.workService.getCard(cardId);
    if (!card || card.trackedMinutes === total) return;
    this.workService.replaceCardPublic({ ...card, trackedMinutes: total });
  }

  private syncCard(cardId: string, details?: IssueDetailsResponse): void {
    const card = this.workService.getCard(cardId);
    if (!card) return;
    const state = details
      ? {
          attachments: details.attachments,
          timeEntries: details.timeEntries,
          comments: details.comments,
        }
      : this.snapshot(cardId);
    this.workService.replaceCardPublic({
      ...card,
      attachments: state.attachments,
      timeEntries: state.timeEntries,
      comments: state.comments,
    });
  }

  private patch(cardId: string, partial: Partial<CardDetailState>): void {
    const current = this.snapshot(cardId);
    this.markAccessed(cardId);
    this.states.update(map => {
      const next = { ...map, [cardId]: { ...current, ...partial } };
      if (Object.keys(next).length <= MAX_CACHED_CARDS) {
        return next;
      }
      const toRemove = this.accessOrder.find(id => id !== cardId && !next[id]?.loading);
      if (toRemove && next[toRemove]) {
        const { [toRemove]: _, ...trimmed } = next;
        this.accessOrder = this.accessOrder.filter(id => id !== toRemove);
        return trimmed;
      }
      return next;
    });
  }

  private markAccessed(cardId: string): void {
    this.accessOrder = this.accessOrder.filter(id => id !== cardId);
    this.accessOrder.push(cardId);
  }
}
