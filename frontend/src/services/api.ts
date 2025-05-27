import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 100000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 添加请求拦截器，自动添加会话ID头部
api.interceptors.request.use(
  (config) => {
    const sessionId = localStorage.getItem('session_id');
    if (sessionId) {
      config.headers['X-Session-ID'] = sessionId;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 测试代理
export const testProxy = async (data: any) => {
  return api.post('/test_proxy', data);
};

// 初始化注册
export const initialize = async (data: any) => {
  return api.post('/initialize', data, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

// 验证验证码
export const verifyCaptha = async (data:any) => {
  return api.post('/verify_captcha',data, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

// 注册账号
export const register = async (data: any) => {
  return api.post('/register', data, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

// 获取邮箱验证码
export const getEmailVerificationCode = async (data: any) => {
  return api.post('/get_email_verification_code', data);
};

// 激活账号
export const activateAccounts = async (key: string, names: string[], all: boolean=false) => {
  return api.post('/activate_account_with_names', { key, names, all });
};

// 顺序激活账号（带SSE支持）
export const activateAccountsSequential = (key: string, names: string[], all: boolean=false, minDelay: number=10, maxDelay: number=30) => {
  const sessionId = localStorage.getItem('session_id') || '';
  
  // 直接发送POST请求并建立SSE连接
  const url = '/api/activate_account_sequential';
  const body = JSON.stringify({ key, names, all, delay_min: minDelay, delay_max: maxDelay });
  
  // 使用fetch发送POST请求并获取流式响应
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-ID': sessionId,
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
    body: body,
    credentials: 'include',
  }).then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    if (!response.body) {
      throw new Error('No response body');
    }
    
    // 创建自定义的EventSource-like对象来处理流式响应
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    const eventSource = {
      onmessage: null as ((event: any) => void) | null,
      onerror: null as ((event: any) => void) | null,
      onopen: null as ((event: any) => void) | null,
      readyState: 1, // OPEN
      
      close: () => {
        reader.cancel();
        eventSource.readyState = 2; // CLOSED
      }
    };
    
    // 触发onopen事件
    if (eventSource.onopen) {
      eventSource.onopen({ type: 'open' });
    }
    
    // 读取流数据
    const readStream = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }
          
          buffer += decoder.decode(value, { stream: true });
          
          // 处理SSE格式的数据
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // 保留不完整的行
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6); // 移除 'data: ' 前缀
              if (data.trim() && eventSource.onmessage) {
                eventSource.onmessage({ data, type: 'message' });
              }
            }
          }
        }
      } catch (error) {
        console.error('SSE读取错误:', error);
        if (eventSource.onerror) {
          eventSource.onerror({ error, type: 'error' });
        }
      }
    };
    
    // 开始读取流
    readStream();
    
    return eventSource;
  });
};

// 获取账号列表
export const fetchAccounts = async () => {
  return api.get('/fetch_accounts');
};

// 删除账号
export const deleteAccount = async (accountId: string) => {
  return api.post('/delete_account', { id: accountId });
};

// 批量删除账号
export const deleteAccounts = async (accountIds: string[]) => {
  return api.post('/delete_account', { ids: accountIds });
};

// 更新账号
export const updateAccount = async (id: string, accountData: any) => {
  return api.post('/update_account', {
    id,
    account_data: accountData,
  });
};

// 账号管理 - 获取VIP信息
export const getAccountVipInfo = async (accountData: any) => {
  return api.post('/account/vip_info', {
    token: accountData.access_token || accountData.token,
    device_id: accountData.device_id,
    client_id: accountData.client_id,
    captcha_token: accountData.captcha_token
  });
};

// 账号管理 - 获取邀请码
export const getAccountInviteCode = async (accountData: any) => {
  return api.post('/account/invite_code', {
    token: accountData.access_token || accountData.token,
    device_id: accountData.device_id,
    captcha_token: accountData.captcha_token
  });
};

// 账号管理 - 获取邀请记录
export const getAccountInviteList = async (accountData: any, limit: number = 500) => {
  return api.post('/account/invite_list', {
    token: accountData.access_token || accountData.token,
    device_id: accountData.device_id,
    captcha_token: accountData.captcha_token,
    client_id: accountData.client_id || "YNxT9w7GMdWvEOKa",
    limit
  });
};

export default api; 