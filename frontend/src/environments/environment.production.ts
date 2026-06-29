export const environment = {
  production: true,
  environmentName: 'production',
  apiUrl: 'http://localhost:8080',
  useApi: true,
  pagination: {
    defaultPageSize: 10,
    pageSizeOptions: [5, 10, 25, 50, 100],
  },
  timeouts: {
    apiTimeout: 30000,
    debounceTime: 300,
    toastDuration: 5000
  },
  logging: {
    level: 'error',
    enableConsole: false,
    enableRemote: true
  }
};

export type Environment = typeof environment;
