import {TestBed} from '@angular/core/testing';
import {of, Subject, throwError} from 'rxjs';
import {expect, it, vi} from 'vitest';
import {AuthService} from '../../../core/services/auth.service';
import {WhiteboardDto, WorkApiService} from '../../../core/services/work-api.service';
import {WorkService} from '../../../core/services/work.service';
import {WorkWhiteboards} from './work-whiteboards';

function editor() {
  const updateWhiteboard = vi.fn();
  TestBed.configureTestingModule({providers: [
    {provide: WorkApiService, useValue: {updateWhiteboard}},
    {provide: WorkService, useValue: {}},
    {provide: AuthService, useValue: {}},
  ]});
  const page = TestBed.runInInjectionContext(() => new WorkWhiteboards());
  page.selectedWhiteboardId.set('test-board');
  return {page, updateWhiteboard};
}

const saved = {id: 'test-board', updatedAt: '2026-11-24T10:00:00Z'} as WhiteboardDto;

it('waits for edits made during a save before letting the user leave', async () => {
  const {page, updateWhiteboard} = editor();
  const firstSave = new Subject<WhiteboardDto>();
  updateWhiteboard.mockReturnValueOnce(firstSave).mockReturnValueOnce(of(saved));
  page.boardDescription.set('Primera versión');
  page.scheduleSave();
  const leaving = page.canLeave();
  page.boardDescription.set('Última versión');
  page.scheduleSave();
  expect(updateWhiteboard).toHaveBeenCalledTimes(1);
  firstSave.next(saved);
  expect(await leaving).toBe(true);
  expect(updateWhiteboard.mock.calls[1][1].description).toBe('Última versión');
  page.ngOnDestroy();
});

it('retains a failed edit and retries it on the next navigation', async () => {
  const {page, updateWhiteboard} = editor();
  updateWhiteboard.mockReturnValueOnce(throwError(() => new Error('sin conexión'))).mockReturnValueOnce(of(saved));
  page.boardDescription.set('Cambio pendiente');
  page.scheduleSave();
  expect(await page.canLeave()).toBe(false);
  expect(page.saveError()).toBe(true);
  expect(await page.canLeave()).toBe(true);
  expect(page.saveError()).toBe(false);
  expect(updateWhiteboard.mock.calls[1][1]).toEqual(updateWhiteboard.mock.calls[0][1]);
  page.ngOnDestroy();
});
