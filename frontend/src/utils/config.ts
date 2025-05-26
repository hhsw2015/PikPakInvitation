/**
 * Configuration utility for managing settings in localStorage
 */

// Default configuration
export interface AppConfig {
  savedInviteCode: string;
  useProxy: boolean;
  useProxyPool: boolean;
  useEmailProxy: boolean;
}

const DEFAULT_CONFIG: AppConfig = {
  savedInviteCode: '',
  useProxy: false,
  useProxyPool: false,
  useEmailProxy: false
};

const CONFIG_KEY = 'pikpak_config';

/**
 * Load configuration from localStorage
 */
export const loadConfig = (): AppConfig => {
  try {
    const savedConfig = localStorage.getItem(CONFIG_KEY);
    if (savedConfig) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(savedConfig) };
    }
    
    // For backward compatibility: migrate old invite code if exists
    const savedInviteCode = localStorage.getItem('savedInviteCode');
    if (savedInviteCode) {
      const config = { ...DEFAULT_CONFIG, savedInviteCode };
      saveConfig(config);
      return config;
    }
  } catch (error) {
    console.error('Failed to load configuration from localStorage:', error);
  }
  
  return DEFAULT_CONFIG;
};

/**
 * Save configuration to localStorage
 */
export const saveConfig = (config: Partial<AppConfig>): void => {
  try {
    const currentConfig = loadConfig();
    const newConfig = { ...currentConfig, ...config };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(newConfig));
  } catch (error) {
    console.error('Failed to save configuration to localStorage:', error);
  }
};

/**
 * Update a specific configuration value
 */
export const updateConfig = <K extends keyof AppConfig>(key: K, value: AppConfig[K]): void => {
  try {
    const config = loadConfig();
    config[key] = value;
    saveConfig(config);
  } catch (error) {
    console.error(`Failed to update configuration key ${key}:`, error);
  }
};

/**
 * Get a specific configuration value
 */
export const getConfigValue = <K extends keyof AppConfig>(key: K): AppConfig[K] => {
  const config = loadConfig();
  return config[key];
}; 