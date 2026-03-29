import { app } from 'electron';
import fs from 'fs';
import path from 'path';

export interface AppSettings {
  serverHost: string;
  serverPort: number;
  localWsPort: number;
  selectedInterface?: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  serverHost: '127.0.0.1',
  serverPort: 8080,
  localWsPort: 8081,
};

export class SettingsManager {
  private configPath: string;
  private settings: AppSettings;

  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'settings.json');
    this.settings = this.load();
  }

  private load(): AppSettings {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
      }
    } catch (error) {
      console.error('[SettingsManager] Failed to load settings:', error);
    }
    return { ...DEFAULT_SETTINGS };
  }

  public getSettings(): AppSettings {
    return this.settings;
  }

  public save(newSettings: Partial<AppSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.settings, null, 2));
      console.log('[SettingsManager] Settings saved to:', this.configPath);
    } catch (error) {
      console.error('[SettingsManager] Failed to save settings:', error);
    }
  }
}

let instance: SettingsManager | null = null;
export function getSettingsManager(): SettingsManager {
  if (!instance) instance = new SettingsManager();
  return instance;
}
