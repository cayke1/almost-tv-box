import type { AppConfig } from '../../src/types';

interface AppRegistryData {
  apps: AppConfig[];
}

const defaultApps: AppRegistryData = {
  apps: [
    {
      id: 'netflix',
      name: 'Netflix',
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23E50914"><path d="M4.5 3A1.5 1.5 0 0 0 3 4.5v15A1.5 1.5 0 0 0 4.5 21h15a1.5 1.5 0 0 0 1.5-1.5v-15A1.5 1.5 0 0 0 19.5 3h-15z"/></svg>',
      url: 'https://www.netflix.com',
      color: '#E50914',
      category: 'streaming',
      userAgent: 'Mozilla/5.0 (Linux; Android 11; Build/RKQ1.217093.16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    },
    {
      id: 'youtube',
      name: 'YouTube',
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23FF0000"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/></svg>',
      url: 'https://www.youtube.com/tv',
      color: '#FF0000',
      category: 'streaming',
      userAgent: 'Mozilla/5.0 (Linux; Android 11; Build/RKQ1.217093.16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    },
    {
      id: 'prime',
      name: 'Prime Video',
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2300A8E1"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg>',
      url: 'https://www.primevideo.com',
      color: '#00A8E1',
      category: 'streaming',
      userAgent: 'Mozilla/5.0 (Linux; Android 11; Build/RKQ1.217093.16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    },
    {
      id: 'stremio',
      name: 'Stremio',
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ff6b35"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
      url: '',
      color: '#ff6b35',
      category: 'streaming',
      externalPath: 'auto',
    },
    {
      id: 'browser',
      name: 'Browser',
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%234A90D9"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93z"/></svg>',
      url: '',
      color: '#4A90D9',
      category: 'browser',
    },
  ],
};

class AppRegistry {
  private apps: Map<string, AppConfig> = new Map();

  constructor() {
    this.loadApps(defaultApps);
  }

  private loadApps(data: AppRegistryData) {
    for (const app of data.apps) {
      this.apps.set(app.id, app);
    }
  }

  get(id: string): AppConfig | undefined {
    return this.apps.get(id);
  }

  getAll(): AppConfig[] {
    return Array.from(this.apps.values());
  }

  add(app: AppConfig): void {
    this.apps.set(app.id, app);
  }

  remove(id: string): void {
    this.apps.delete(id);
  }

  getByCategory(category: AppConfig['category']): AppConfig[] {
    return Array.from(this.apps.values()).filter(app => app.category === category);
  }
}

export const appRegistry = new AppRegistry();
