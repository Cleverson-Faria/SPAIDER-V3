/**
 * Biblioteca de compatibilidade entre navegadores
 * Detecta navegador, testa features e define estratégia de cache ideal
 */

export type StorageStrategy = 'localStorage' | 'sessionStorage' | 'memory' | 'none';

export interface BrowserInfo {
  name: string;
  version: string;
  isChrome: boolean;
  isSafari: boolean;
  isFirefox: boolean;
  isEdge: boolean;
}

export interface StorageCapabilities {
  hasLocalStorage: boolean;
  hasSessionStorage: boolean;
  localStorageQuota: number;
  localStorageUsed: number;
  canWriteLocalStorage: boolean;
  canWriteSessionStorage: boolean;
  recommendedStrategy: StorageStrategy;
}

/**
 * Detecta o navegador do usuário
 */
export function detectBrowser(): BrowserInfo {
  const ua = navigator.userAgent;
  
  const isChrome = /Chrome/.test(ua) && /Google Inc/.test(navigator.vendor);
  const isSafari = /Safari/.test(ua) && /Apple Computer/.test(navigator.vendor);
  const isFirefox = /Firefox/.test(ua);
  const isEdge = /Edg/.test(ua);
  
  let name = 'Unknown';
  let version = 'Unknown';
  
  if (isEdge) {
    name = 'Edge';
    const match = ua.match(/Edg\/(\d+)/);
    version = match ? match[1] : 'Unknown';
  } else if (isChrome) {
    name = 'Chrome';
    const match = ua.match(/Chrome\/(\d+)/);
    version = match ? match[1] : 'Unknown';
  } else if (isSafari) {
    name = 'Safari';
    const match = ua.match(/Version\/(\d+)/);
    version = match ? match[1] : 'Unknown';
  } else if (isFirefox) {
    name = 'Firefox';
    const match = ua.match(/Firefox\/(\d+)/);
    version = match ? match[1] : 'Unknown';
  }
  
  return {
    name,
    version,
    isChrome,
    isSafari,
    isFirefox,
    isEdge
  };
}

/**
 * Calcula quota e uso do localStorage
 */
async function getStorageQuota(): Promise<{ quota: number; used: number }> {
  try {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        quota: estimate.quota || 0,
        used: estimate.usage || 0
      };
    }
  } catch (e) {
    console.warn('⚠️ Não foi possível estimar quota de storage:', e);
  }
  
  // Fallback: calcular manualmente
  try {
    let used = 0;
    for (const key in localStorage) {
      if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
        used += localStorage[key].length + key.length;
      }
    }
    return {
      quota: 10 * 1024 * 1024, // ~10MB (estimativa padrão)
      used: used * 2 // bytes (cada char = 2 bytes em UTF-16)
    };
  } catch (e) {
    return { quota: 0, used: 0 };
  }
}

/**
 * Testa se consegue escrever no localStorage
 */
function testLocalStorage(): boolean {
  const testKey = '__storage_test__';
  try {
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Testa se consegue escrever no sessionStorage
 */
function testSessionStorage(): boolean {
  const testKey = '__storage_test__';
  try {
    sessionStorage.setItem(testKey, 'test');
    sessionStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Verifica capacidades de storage do navegador
 */
export async function checkStorageCapabilities(): Promise<StorageCapabilities> {
  const browser = detectBrowser();
  
  const hasLocalStorage = typeof localStorage !== 'undefined';
  const hasSessionStorage = typeof sessionStorage !== 'undefined';
  
  const canWriteLocalStorage = hasLocalStorage && testLocalStorage();
  const canWriteSessionStorage = hasSessionStorage && testSessionStorage();
  
  const { quota, used } = await getStorageQuota();
  
  // Determinar estratégia recomendada
  let recommendedStrategy: StorageStrategy = 'none';
  
  if (canWriteLocalStorage) {
    const percentUsed = quota > 0 ? (used / quota) * 100 : 0;
    
    // Se localStorage está muito cheio (>80%), usar sessionStorage
    if (percentUsed > 80 && canWriteSessionStorage) {
      console.warn(`⚠️ LocalStorage ${percentUsed.toFixed(1)}% cheio, usando sessionStorage`);
      recommendedStrategy = 'sessionStorage';
    } else {
      recommendedStrategy = 'localStorage';
    }
  } else if (canWriteSessionStorage) {
    console.warn('⚠️ LocalStorage indisponível, usando sessionStorage');
    recommendedStrategy = 'sessionStorage';
  } else {
    console.warn('⚠️ Nenhum storage disponível, usando memória');
    recommendedStrategy = 'memory';
  }
  
  const capabilities = {
    hasLocalStorage,
    hasSessionStorage,
    localStorageQuota: quota,
    localStorageUsed: used,
    canWriteLocalStorage,
    canWriteSessionStorage,
    recommendedStrategy
  };
  
  console.log('🔍 [Browser Compat] Capacidades detectadas:', {
    browser: `${browser.name} ${browser.version}`,
    ...capabilities,
    quotaFormatted: `${(used / 1024 / 1024).toFixed(2)} MB / ${(quota / 1024 / 1024).toFixed(2)} MB`,
    percentUsed: quota > 0 ? `${((used / quota) * 100).toFixed(1)}%` : 'N/A'
  });
  
  return capabilities;
}

/**
 * Wrapper genérico de storage que usa a estratégia recomendada
 */
export class AdaptiveStorage {
  private strategy: StorageStrategy;
  private memoryStore: Map<string, string>;
  
  constructor(strategy: StorageStrategy) {
    this.strategy = strategy;
    this.memoryStore = new Map();
  }
  
  setItem(key: string, value: string): boolean {
    try {
      switch (this.strategy) {
        case 'localStorage':
          localStorage.setItem(key, value);
          return true;
        
        case 'sessionStorage':
          sessionStorage.setItem(key, value);
          return true;
        
        case 'memory':
          this.memoryStore.set(key, value);
          return true;
        
        default:
          return false;
      }
    } catch (e) {
      console.error(`❌ Erro ao salvar em ${this.strategy}:`, e);
      
      // Fallback: tentar próxima estratégia
      if (this.strategy === 'localStorage') {
        console.log('🔄 Tentando sessionStorage como fallback...');
        try {
          sessionStorage.setItem(key, value);
          this.strategy = 'sessionStorage';
          return true;
        } catch (e2) {
          console.log('🔄 Usando memória como último recurso...');
          this.memoryStore.set(key, value);
          this.strategy = 'memory';
          return true;
        }
      }
      
      return false;
    }
  }
  
  getItem(key: string): string | null {
    try {
      switch (this.strategy) {
        case 'localStorage':
          return localStorage.getItem(key);
        
        case 'sessionStorage':
          return sessionStorage.getItem(key);
        
        case 'memory':
          return this.memoryStore.get(key) || null;
        
        default:
          return null;
      }
    } catch (e) {
      console.error(`❌ Erro ao ler de ${this.strategy}:`, e);
      return null;
    }
  }
  
  removeItem(key: string): void {
    try {
      switch (this.strategy) {
        case 'localStorage':
          localStorage.removeItem(key);
          break;
        
        case 'sessionStorage':
          sessionStorage.removeItem(key);
          break;
        
        case 'memory':
          this.memoryStore.delete(key);
          break;
      }
    } catch (e) {
      console.error(`❌ Erro ao remover de ${this.strategy}:`, e);
    }
  }
  
  clear(): void {
    try {
      switch (this.strategy) {
        case 'localStorage':
          localStorage.clear();
          break;
        
        case 'sessionStorage':
          sessionStorage.clear();
          break;
        
        case 'memory':
          this.memoryStore.clear();
          break;
      }
    } catch (e) {
      console.error(`❌ Erro ao limpar ${this.strategy}:`, e);
    }
  }
  
  getStrategy(): StorageStrategy {
    return this.strategy;
  }
}
