import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {TestBed} from '@angular/core/testing';
import {expect, it} from 'vitest';
import {NotificationService} from './notification.service';

it('ignores notifications that arrive after logout', async () => {
  TestBed.configureTestingModule({providers: [provideHttpClient(), provideHttpClientTesting()]});
  const notifications = TestBed.inject(NotificationService);
  const network = TestBed.inject(HttpTestingController);
  const previousRefresh = notifications.refresh();
  const previous = network.expectOne('/api/notifications');

  notifications.stopPolling();
  const currentRefresh = notifications.refresh();
  network.expectOne('/api/notifications').flush([{id: 'current', read: false}]);
  await currentRefresh;
  previous.flush([{id: 'previous', read: false}]);
  await previousRefresh;

  expect(notifications.notifications().map(item => item.id)).toEqual(['current']);
  network.verify();
});
