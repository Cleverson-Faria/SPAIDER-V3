const MAX_STORAGE_ITEMS = 10; // Manter apenas últimos 10 testes
const COMPARISON_PREFIX = 'comparison_';
const FLOW_PREFIX = 'flow_';

export const localStorageManager = {
  /**
   * Verifica se localStorage está disponível e funcional
   */
  isLocalStorageAvailable: (): boolean => {
    try {
      const testKey = '__test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      console.warn('⚠️ LocalStorage não disponível:', e);
      return false;
    }
  },

  /**
   * Obtém quota e uso do localStorage
   */
  getStorageQuota: async (): Promise<{ quota: number; used: number; available: number }> => {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const quota = estimate.quota || 0;
        const used = estimate.usage || 0;
        return {
          quota,
          used,
          available: quota - used
        };
      }
    } catch (e) {
      console.warn('⚠️ Não foi possível estimar quota:', e);
    }
    
    // Fallback manual
    try {
      let used = 0;
      for (const key in localStorage) {
        if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
          used += (localStorage[key].length + key.length) * 2; // UTF-16 = 2 bytes por char
        }
      }
      const quota = 10 * 1024 * 1024; // ~10MB
      return {
        quota,
        used,
        available: quota - used
      };
    } catch (e) {
      return { quota: 0, used: 0, available: 0 };
    }
  },

  /**
   * Obtém tamanho de um item específico em bytes
   */
  getItemSize: (key: string): number => {
    try {
      const item = localStorage.getItem(key);
      if (!item) return 0;
      return (item.length + key.length) * 2; // UTF-16
    } catch (e) {
      return 0;
    }
  },

  /**
   * Limpar comparações antigas automaticamente
   * Mantém apenas os últimos MAX_STORAGE_ITEMS itens
   */
  cleanOldComparisons: () => {
    try {
      const keys = Object.keys(localStorage);
      const comparisonKeys = keys
        .filter(key => key.startsWith(COMPARISON_PREFIX) || key.startsWith(FLOW_PREFIX))
        .map(key => {
          try {
            const data = localStorage.getItem(key);
            const parsed = data ? JSON.parse(data) : null;
            return {
              key,
              timestamp: parsed?.timestamp || 0
            };
          } catch {
            return { key, timestamp: 0 };
          }
        })
        .sort((a, b) => b.timestamp - a.timestamp);

      // Remover itens excedentes (manter apenas MAX_STORAGE_ITEMS mais recentes)
      if (comparisonKeys.length > MAX_STORAGE_ITEMS) {
        const toRemove = comparisonKeys.slice(MAX_STORAGE_ITEMS);
        toRemove.forEach(item => {
          try {
            localStorage.removeItem(item.key);
          } catch (e) {
            console.error('Error removing item:', item.key, e);
          }
        });
        console.log(`🧹 Cleaned ${toRemove.length} old comparisons from localStorage`);
      }
    } catch (error) {
      console.error('Error cleaning localStorage:', error);
    }
  },

  /**
   * Salvar no localStorage com gerenciamento automático de espaço
   * Retorna true se salvou com sucesso, false caso contrário
   * NÃO lança exceções - sempre retorna boolean
   */
  setItem: (key: string, value: any): boolean => {
    try {
      // Adicionar timestamp para ordenação
      const dataWithTimestamp = {
        ...value,
        timestamp: Date.now()
      };
      
      localStorage.setItem(key, JSON.stringify(dataWithTimestamp));
      return true;
    } catch (error: any) {
      if (error.name === 'QuotaExceededError') {
        console.warn('⚠️ LocalStorage full, cleaning old items...');
        
        // Limpar e tentar novamente
        localStorageManager.cleanOldComparisons();
        
        try {
          const dataWithTimestamp = {
            ...value,
            timestamp: Date.now()
          };
          localStorage.setItem(key, JSON.stringify(dataWithTimestamp));
          console.log('✅ Saved after cleanup');
          return true;
        } catch (retryError) {
          console.error('❌ Failed to save even after cleanup:', retryError);
          // Limpeza de emergência
          localStorageManager.emergencyClean(key);
          return false;
        }
      } else {
        console.error('❌ Error saving to localStorage:', error);
        return false;
      }
    }
  },

  /**
   * Limpeza de emergência (remover TUDO exceto o item atual)
   */
  emergencyClean: (keepKey: string) => {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key !== keepKey && (key.startsWith(COMPARISON_PREFIX) || key.startsWith(FLOW_PREFIX))) {
          try {
            localStorage.removeItem(key);
          } catch (e) {
            console.error('Error during emergency cleanup:', e);
          }
        }
      });
      console.log('🚨 Emergency cleanup completed');
    } catch (error) {
      console.error('Emergency cleanup failed:', error);
    }
  },

  /**
   * Obter tamanho atual do localStorage em KB
   */
  getStorageSize: (): string => {
    try {
      let total = 0;
      for (const key in localStorage) {
        if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
          total += localStorage[key].length + key.length;
        }
      }
      return (total / 1024).toFixed(2);
    } catch (error) {
      console.error('Error calculating storage size:', error);
      return '0';
    }
  }
};
