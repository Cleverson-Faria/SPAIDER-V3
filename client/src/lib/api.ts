const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Classe de erro customizada para incluir dados adicionais (como errorLog)
class ApiError extends Error {
  errorLog?: any;
  response?: any;
  status?: number;
  
  constructor(message: string, errorData?: any) {
    super(message);
    this.name = 'ApiError';
    if (errorData) {
      this.errorLog = errorData.errorLog;
      this.response = errorData.response;
      this.status = errorData.status;
    }
  }
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('auth_token');
    }
    return this.token;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const token = this.getToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
      // Criar erro com dados adicionais (incluindo errorLog do backend)
      const apiError = new ApiError(
        errorData.error || `HTTP ${response.status}`,
        { 
          errorLog: errorData.errorLog,
          response: errorData,
          status: response.status 
        }
      );
      throw apiError;
    }

    return response.json();
  }

  // Métodos de autenticação
  async signIn(email: string, password: string) {
    const data = await this.request('/api/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  async signUp(email: string, password: string, fullName: string) {
    const data = await this.request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName }),
    });
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  async signOut() {
    this.setToken(null);
  }

  async getProfile() {
    return this.request('/api/auth/profile');
  }

  // Métodos genéricos para queries (substituir supabase.from())
  async query(table: string, options: {
    select?: string;
    where?: Record<string, any>;
    orderBy?: string;
    limit?: number;
    single?: boolean;
  } = {}) {
    return this.request(`/api/query/${table}/search`, {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  async get(table: string, id: string) {
    return this.request(`/api/query/${table}/${id}`);
  }

  async create(table: string, data: any) {
    return this.request(`/api/query/${table}/create`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async update(table: string, id: string, data: any) {
    return this.request(`/api/query/${table}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async delete(table: string, id: string) {
    return this.request(`/api/query/${table}/${id}`, {
      method: 'DELETE',
    });
  }

  // Método para invocar funções (substituir supabase.functions.invoke)
  async invoke(functionName: string, body: any) {
    // Mapear funções para endpoints específicos
    const endpointMap: Record<string, string> = {
      'spaider-chat': '/api/functions/spaider-chat',
      'sap-execute-test': '/api/sap/execute-test',
      'sap-integration': '/api/sap/full-flow',
    };

    const endpoint = endpointMap[functionName] || `/api/functions/${functionName}`;
    
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // Métodos específicos para SAP
  async sapConsult(orderId: string, domain?: string) {
    return this.request('/api/sap/consult', {
      method: 'POST',
      body: JSON.stringify({ orderId, domain }),
    });
  }

  async sapReplicate(orderId: string, domain?: string, warehouseCode?: string) {
    return this.request('/api/sap/replicate', {
      method: 'POST',
      body: JSON.stringify({ orderId, domain, warehouseCode }),
    });
  }

  async sapFullFlow(orderId: string, domain?: string, warehouseCode?: string) {
    return this.request('/api/sap/full-flow', {
      method: 'POST',
      body: JSON.stringify({ orderId, domain, warehouseCode }),
    });
  }

  async sapDelivery(salesOrderId: string, domain?: string) {
    return this.request('/api/sap/delivery', {
      method: 'POST',
      body: JSON.stringify({ salesOrderId, domain }),
    });
  }

  async sapPicking(deliveryDocument: string, domain?: string) {
    return this.request('/api/sap/picking', {
      method: 'POST',
      body: JSON.stringify({ deliveryDocument, domain }),
    });
  }

  async sapPgi(deliveryDocument: string, domain?: string) {
    return this.request('/api/sap/pgi', {
      method: 'POST',
      body: JSON.stringify({ deliveryDocument, domain }),
    });
  }

  async sapBilling(deliveryDocument: string, domain?: string) {
    return this.request('/api/sap/billing', {
      method: 'POST',
      body: JSON.stringify({ deliveryDocument, domain }),
    });
  }

  async sapNfe(billingDocument: string, domain?: string) {
    return this.request('/api/sap/nfe', {
      method: 'POST',
      body: JSON.stringify({ billingDocument, domain }),
    });
  }
}

export const api = new ApiClient();

