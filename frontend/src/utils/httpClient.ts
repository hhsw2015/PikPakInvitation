// HTTP客户端工具，自动处理会话ID
export class HttpClient {
  private static getSessionId(): string | null {
    return localStorage.getItem('session_id');
  }

  private static getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    const sessionId = this.getSessionId();
    if (sessionId) {
      headers['X-Session-ID'] = sessionId;
    }

    return headers;
  }

  static async get(url: string): Promise<Response> {
    return fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });
  }

  static async post(url: string, data?: any): Promise<Response> {
    return fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  static async put(url: string, data?: any): Promise<Response> {
    return fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  static async delete(url: string, data?: any): Promise<Response> {
    return fetch(url, {
      method: 'DELETE',
      headers: this.getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  // 表单数据提交（用于兼容现有的表单提交）
  static async postForm(url: string, formData: FormData): Promise<Response> {
    const sessionId = this.getSessionId();
    const headers: HeadersInit = {};
    
    if (sessionId) {
      headers['X-Session-ID'] = sessionId;
    }

    return fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });
  }
}

export default HttpClient; 