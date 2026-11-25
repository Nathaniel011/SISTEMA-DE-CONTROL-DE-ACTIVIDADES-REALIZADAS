import {HttpClient, provideHttpClient, withInterceptors} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {TestBed} from '@angular/core/testing';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {inFlightInterceptor} from './in-flight.interceptor';

describe('peticiones en curso', () => {
  let client: HttpClient;
  let network: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([inFlightInterceptor])), provideHttpClientTesting()],
    });
    client = TestBed.inject(HttpClient);
    network = TestBed.inject(HttpTestingController);
  });

  afterEach(() => network.verify());

  it('comparte un GET simultáneo y libera la respuesta al terminar', () => {
    const result: unknown[] = [];
    client.get('/api/work/bootstrap').subscribe(value => result.push(value));
    client.get('/api/work/bootstrap').subscribe(value => result.push(value));
    network.expectOne('/api/work/bootstrap').flush({ok: true});
    expect(result).toEqual([{ok: true}, {ok: true}]);
    client.get('/api/work/bootstrap').subscribe();
    network.expectOne('/api/work/bootstrap').flush({ok: true});
  });

  it('separa las credenciales y deja los cambios fuera de la deduplicación', () => {
    for (const token of ['a', 'b']) {
      client.get('/api/work/bootstrap', {headers: {Authorization: 'Bearer ' + token}}).subscribe();
    }
    const reads = network.match('/api/work/bootstrap');
    expect(reads).toHaveLength(2);
    reads.forEach(request => request.flush({}));
    client.post('/api/issues', {}).subscribe();
    client.post('/api/issues', {}).subscribe();
    const writes = network.match('/api/issues');
    expect(writes).toHaveLength(2);
    writes.forEach(request => request.flush({}));
  });
});
