export const environment = {
  production: false,
  environmentName: 'development',
  apiUrl: '',
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
    level: 'debug',
    enableConsole: true,
    enableRemote: false
  }
};

export type Environment = typeof environment;
