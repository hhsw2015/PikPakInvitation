import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 100000,
  headers: {
    'Content-Type': 'application/json',
  },
});


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

// 获取账号列表
export const fetchAccounts = async () => {
  return api.get('/fetch_accounts');
};

// 删除账号
export const deleteAccount = async (filename: string) => {
  const formData = new FormData();
  formData.append('filename', filename);
  return api.post('/delete_account', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

// 批量删除账号
export const deleteAccounts = async (filenames: string[]) => {
  const formData = new FormData();
  
  // 将多个文件名添加到 FormData
  filenames.forEach(filename => {
    formData.append('filenames', filename);
  });
  
  return api.post('/delete_account', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

// 更新账号
export const updateAccount = async (filename: string, accountData: any) => {
  return api.post('/update_account', {
    filename,
    account_data: accountData,
  });
};

export default api; 
