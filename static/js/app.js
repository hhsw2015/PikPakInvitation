// PikPak 注册助手应用
const app = Vue.createApp({
    data() {
        return {
            // 应用状态
            activeTab: 'register',
            
            // 步骤系统
            currentStep: 1,
            
            // 表单数据
            email: '',
            inviteCode: '',
            useProxy: false,
            proxyUrl: 'http://127.0.0.1:7890',
            verificationCode: '',
            
            // 状态标志
            isInitializing: false,
            isVerifying: false,
            isRegistering: false,
            isTestingProxy: false,
            verificationSuccess: false,
            
            // 结果数据
            proxyTestResult: null,
            deviceId: '',
            version: '',
            rtcToken: '',
            accountInfo: null,
            
            // 提示系统
            alertMessage: '',
            alertType: 'info', // success, info, warning, danger
            alertTimeout: null,
            
            // 账号历史
            accounts: [],
            isLoadingAccounts: false,
            selectedAccount: null,
            editingAccount: null,
            accountToDelete: null,
            isSaving: false,
            isDeleting: false,
            
            // JSON编辑器
            jsonEditText: '',
            jsonError: null,
            
            // 账号激活
            activationKey: '',
            isActivating: false,
            activationResult: null,
            
            // 模态框实例
            accountViewModal: null,
            accountEditModal: null,
            deleteConfirmModal: null,
            
            // Extract verification code tab
            sourceData: '',
            extractEmail: '',
            extractPassword: '',
            isFetchingCode: false,
            verificationResult: null,
            
            // 邮箱提取页面
            apiKey: '',
            emailType: 'hotmail',
            extractCount: 1,
            isChecking: false,
            isExtracting: false,
            inventoryInfo: null,
            balanceInfo: 0,
            extractedEmails: [],
        }
    },
    computed: {
        progressPercent() {
            return (this.currentStep - 1) * 33.33;
        }
    },
    mounted() {
        // 初始化Bootstrap模态框
        this.initModals();
        
        // 从localStorage加载API密钥和邀请码
        const savedApiKey = localStorage.getItem('apiKey');
        const savedInviteCode = localStorage.getItem('inviteCode');
        if (savedInviteCode) {
            this.inviteCode = savedInviteCode;
        }

        if (savedApiKey) {
            this.apiKey = savedApiKey;
            // 自动加载库存和余额信息
            this.checkInventoryAndBalance();
        }
    },
    methods: {
        // 模态框初始化
        initModals() {
            // 使用setTimeout确保DOM完全渲染
            setTimeout(() => {
                // 初始化Bootstrap模态框
                this.accountViewModal = new bootstrap.Modal(document.getElementById('accountViewModal'));
                this.accountEditModal = new bootstrap.Modal(document.getElementById('accountEditModal'));
                this.deleteConfirmModal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
            }, 100);
        },
        
        // 导航方法
        goToNextStep() {
            if (this.currentStep < 4) {
                this.currentStep++;
                window.scrollTo(0, 0);
            }
        },
        goToPreviousStep() {
            if (this.currentStep > 1) {
                this.currentStep--;
                window.scrollTo(0, 0);
            }
        },
        resetApp() {
            // 重置所有表单数据并返回第一步
            this.email = '';
            this.inviteCode = '';
            this.verificationCode = '';
            this.verificationSuccess = false;
            this.accountInfo = null;
            this.currentStep = 1;
            this.clearAlert();
            window.scrollTo(0, 0);
        },
        
        // 提示系统
        showAlert(message, type = 'info') {
            this.alertMessage = message;
            this.alertType = type;
            
            // 清除之前的超时
            if (this.alertTimeout) {
                clearTimeout(this.alertTimeout);
            }
            
            // 成功和信息提示5秒后自动隐藏
            if (type === 'success' || type === 'info') {
                this.alertTimeout = setTimeout(() => {
                    this.clearAlert();
                }, 5000);
            }
        },
        clearAlert() {
            this.alertMessage = '';
            this.alertType = 'info';
        },
        
        // API方法
        async testProxy() {
            this.isTestingProxy = true;
            this.proxyTestResult = null;
            
            try {
                const formData = new FormData();
                formData.append('proxy_url', this.proxyUrl);
                
                const response = await axios.post('/test_proxy', formData);
                
                if (response.data.status === 'success') {
                    this.proxyTestResult = true;
                } else {
                    this.proxyTestResult = false;
                }
            } catch (error) {
                console.error('代理测试失败:', error);
                this.proxyTestResult = false;
            } finally {
                this.isTestingProxy = false;
            }
        },
        
        async initialize() {
            this.isInitializing = true;
            this.clearAlert();
            
            try {
                const formData = new FormData();
                formData.append('use_proxy', this.useProxy);
                formData.append('proxy_url', this.proxyUrl);
                formData.append('invite_code', this.inviteCode);
                formData.append('email', this.email);
                
                const response = await axios.post('/initialize', formData);
                // 保存邀请码到localStorage
                localStorage.setItem('inviteCode', this.inviteCode);
                
                if (response.data.status === 'success') {
                    this.deviceId = response.data.device_id;
                    this.version = response.data.version;
                    this.rtcToken = response.data.rtc_token;
                    
                    // 显示成功消息并进入下一步
                    this.showAlert(response.data.message, 'success');
                    this.goToNextStep();
                } else {
                    this.showAlert(response.data.message, 'danger');
                }
            } catch (error) {
                console.error('初始化失败:', error);
                this.showAlert('初始化失败，请检查网络连接或重试', 'danger');
            } finally {
                this.isInitializing = false;
            }
        },
        
        async verifyCaptcha() {
            this.isVerifying = true;
            this.verificationSuccess = false;
            this.clearAlert();
            
            try {
                const response = await axios.post('/verify_captcha');
                
                if (response.data.status === 'success') {
                    this.verificationSuccess = true;
                    this.showAlert(response.data.message, 'success');
                } else {
                    this.verificationSuccess = false;
                    this.showAlert(response.data.message, 'danger');
                }
            } catch (error) {
                console.error('验证码验证失败:', error);
                this.verificationSuccess = false;
                this.showAlert('滑块验证失败，请重试', 'danger');
            } finally {
                this.isVerifying = false;
            }
        },
        
        async register() {
            this.isRegistering = true;
            this.clearAlert();
            
            try {
                const formData = new FormData();
                formData.append('verification_code', this.verificationCode);
                
                const response = await axios.post('/register', formData);
                
                if (response.data.status === 'success') {
                    // 存储账号信息
                    this.accountInfo = response.data.account_info;
                    
                    // 显示成功消息并进入完成步骤
                    this.showAlert(response.data.message, 'success');
                    this.goToNextStep();
                } else {
                    this.showAlert(response.data.message, 'danger');
                }
            } catch (error) {
                console.error('注册失败:', error);
                this.showAlert('注册失败，请检查验证码或重试', 'danger');
            } finally {
                this.isRegistering = false;
            }
        },
        
        // 辅助方法
        copyAccountInfo() {
            const accountInfoText = JSON.stringify(this.accountInfo, null, 2);
            
            navigator.clipboard.writeText(accountInfoText)
                .then(() => {
                    this.showAlert('账号信息已复制到剪贴板', 'success');
                })
                .catch(err => {
                    console.error('无法复制到剪贴板:', err);
                    this.showAlert('复制失败，请手动复制', 'warning');
                });
        },
        
        // 账号历史方法
        showAccountHistory() {
            this.activeTab = 'history';
            this.fetchAccounts();
        },
        
        // 账号激活方法
        showActivationTab() {
            this.activeTab = 'activate';
            this.activationResult = null;
            this.activationKey = '';
            
            // 确保账号列表已加载
            if (this.accounts.length === 0) {
                this.fetchAccounts();
            }
        },
        
        async activateAccount() {
            if (!this.activationKey || this.accounts.length === 0) {
                this.showAlert('请先加载账号并输入激活密钥', 'warning');
                return;
            }
            
            this.isActivating = true;
            this.activationResult = null;
            this.clearAlert();
            
            try {
                // 只需要发送密钥，后端会自动读取所有账号信息并处理
                const response = await axios.post('/activate_account', {
                    key: this.activationKey
                });
                
                if (response.data.status === 'success') {
                    this.activationResult = response.data;
                    this.showAlert(response.data.message, 'success');
                    
                    // 由于是批量操作，不再需要更新单个账号
                    // 重新获取账号列表以获取可能的更新
                    await this.fetchAccounts();
                } else {
                    this.showAlert(response.data.message, 'danger');
                }
            } catch (error) {
                console.error('账号激活失败:', error);
                this.showAlert('激活操作失败，请检查网络连接或重试', 'danger');
            } finally {
                this.isActivating = false;
            }
        },
        
        async fetchAccounts() {
            this.isLoadingAccounts = true;
            this.clearAlert();
            
            try {
                const response = await axios.get('/fetch_accounts');
                
                if (response.data.status === 'success') {
                    this.accounts = response.data.accounts;
                } else {
                    this.showAlert(response.data.message, 'danger');
                }
            } catch (error) {
                console.error('获取账号列表失败:', error);
                this.showAlert('获取账号列表失败，请重试', 'danger');
            } finally {
                this.isLoadingAccounts = false;
            }
        },
        
        viewAccount(account) {
            this.selectedAccount = JSON.parse(JSON.stringify(account)); // 深拷贝
            this.accountViewModal.show();
        },
        
        editAccount(account) {
            // 深拷贝账号数据并删除文件名属性用于编辑
            const accountCopy = JSON.parse(JSON.stringify(account));
            this.editingAccount = accountCopy;
            
            // 初始化JSON编辑器文本
            const jsonCopy = { ...accountCopy };
            delete jsonCopy.filename; // 在编辑器中显示前移除文件名
            this.jsonEditText = JSON.stringify(jsonCopy, null, 2);
            this.jsonError = null;
            
            // 显示模态框
            this.accountEditModal.show();
        },
        
        confirmDeleteAccount(account) {
            this.accountToDelete = account;
            this.deleteConfirmModal.show();
        },
        
        validateJson() {
            try {
                // 尝试解析JSON以验证格式
                JSON.parse(this.jsonEditText);
                this.jsonError = null; // 清除之前的错误
            } catch (e) {
                this.jsonError = e.message;
            }
        },
        
        async saveAccount() {
            if (!this.editingAccount) return;
            
            this.isSaving = true;
            
            try {
                let accountDataToSave;
                const filename = this.editingAccount.filename;
                
                // 检查哪个标签页是活动的并相应地保存
                const jsonTab = document.getElementById('json-tab');
                if (jsonTab && jsonTab.classList.contains('active')) {
                    // 用户在JSON模式下编辑，使用JSON编辑器文本
                    try {
                        accountDataToSave = JSON.parse(this.jsonEditText);
                    } catch (e) {
                        this.showAlert('JSON格式错误，无法保存', 'danger');
                        this.isSaving = false;
                        return;
                    }
                } else {
                    // 用户在基本模式下编辑，使用表单字段
                    const accountDataCopy = { ...this.editingAccount };
                    delete accountDataCopy.filename; // 保存前移除文件名
                    accountDataToSave = accountDataCopy;
                }
                
                const response = await axios.post('/update_account', {
                    filename: filename,
                    account_data: accountDataToSave
                });
                
                if (response.data.status === 'success') {
                    this.showAlert(response.data.message, 'success');
                    this.accountEditModal.hide();
                    this.fetchAccounts(); // 刷新账号列表
                } else {
                    this.showAlert(response.data.message, 'danger');
                }
            } catch (error) {
                console.error('保存账号失败:', error);
                this.showAlert('保存账号失败，请重试', 'danger');
            } finally {
                this.isSaving = false;
            }
        },
        
        async deleteAccount() {
            if (!this.accountToDelete) return;
            
            this.isDeleting = true;
            
            try {
                const formData = new FormData();
                formData.append('filename', this.accountToDelete.filename);
                
                const response = await axios.post('/delete_account', formData);
                
                if (response.data.status === 'success') {
                    this.showAlert(response.data.message, 'success');
                    this.deleteConfirmModal.hide();
                    this.fetchAccounts(); // 刷新账号列表
                } else {
                    this.showAlert(response.data.message, 'danger');
                }
            } catch (error) {
                console.error('删除账号失败:', error);
                this.showAlert('删除账号失败，请重试', 'danger');
            } finally {
                this.isDeleting = false;
            }
        },
        
        copySelectedAccountInfo() {
            if (!this.selectedAccount) return;
            
            const accountCopy = { ...this.selectedAccount };
            delete accountCopy.filename; // 复制前移除文件名
            
            const accountInfoText = JSON.stringify(accountCopy, null, 2);
            
            navigator.clipboard.writeText(accountInfoText)
                .then(() => {
                    this.showAlert('账号信息已复制到剪贴板', 'success');
                })
                .catch(err => {
                    console.error('无法复制到剪贴板:', err);
                    this.showAlert('复制失败，请手动复制', 'warning');
                });
        },
        
        // Parse source data to extract email and password
        parseSourceData() {
            if (!this.sourceData) {
                // 尝试从剪贴板读取内容
                navigator.clipboard.readText()
                    .then(clipText => {
                        if (clipText) {
                            this.sourceData = clipText;
                            // 递归调用解析方法
                            this.parseSourceData();
                        } else {
                            this.showAlert('请输入源数据', 'warning');
                        }
                    })
                    .catch(err => {
                        console.error('无法读取剪贴板:', err);
                        this.showAlert('请输入源数据', 'warning');
                    });
                return;
            }
            
            // Split by ---- delimiter and extract first two parts
            const parts = this.sourceData.split('----');
            if (parts.length < 2) {
                this.showAlert('格式错误，请确保数据包含使用----分隔的邮箱和密码', 'danger');
                return;
            }
            
            this.extractEmail = parts[0].trim();
            this.extractPassword = parts[1].trim();
            
            if (!this.extractEmail || !this.extractPassword) {
                this.showAlert('解析后的邮箱或密码为空，请检查格式', 'warning');
            } else {
                this.showAlert('数据解析成功', 'success');
            }
        },
        
        // Fetch verification code from the server
        fetchVerificationCode() {
            if (!this.extractEmail || !this.extractPassword) {
                this.showAlert('邮箱和密码不能为空', 'warning');
                return;
            }
            
            this.isFetchingCode = true;
            this.verificationResult = null;
            
            const formData = new FormData();
            formData.append('email', this.extractEmail);
            formData.append('password', this.extractPassword);
            
            axios.post('/get_verification', formData)
                .then(response => {
                    this.verificationResult = response.data;
                    if (response.data.code === 200) {
                        this.showAlert('验证码获取成功', 'success');
                    } else {
                        this.showAlert('验证码获取失败: ' + response.data.msg, 'danger');
                    }
                })
                .catch(error => {
                    console.error(error);
                    this.showAlert('请求失败，请检查网络连接', 'danger');
                })
                .finally(() => {
                    this.isFetchingCode = false;
                });
        },
        
        // Copy verification code to clipboard
        copyVerificationCode() {
            if (this.verificationResult && this.verificationResult.verification_code) {
                navigator.clipboard.writeText(this.verificationResult.verification_code)
                    .then(() => {
                        this.showAlert('验证码已复制到剪贴板', 'success');
                    })
                    .catch(err => {
                        console.error('无法复制验证码: ', err);
                        this.showAlert('复制验证码失败', 'danger');
                    });
            }
        },
        
        // Clear source data label when input changes
        clearSourceDataLabel() {
            // This method is called by the @input event on the textarea
            // The label will be hidden automatically by the v-if directive
        },
        
        // 邮箱提取相关方法
        async checkInventoryAndBalance() {
            if (!this.apiKey) {
                this.showAlert('请输入API密钥', 'warning');
                return;
            }
            
            // 保存API密钥到localStorage
            localStorage.setItem('apiKey', this.apiKey);
            
            this.isChecking = true;
            this.clearAlert();
            
            try {
                // 获取库存信息
                const inventoryResponse = await axios.get('/check_email_inventory');
                
                if (inventoryResponse.data.status === 'success') {
                    this.inventoryInfo = inventoryResponse.data.inventory;
                } else {
                    this.showAlert('获取库存信息失败: ' + inventoryResponse.data.message, 'danger');
                }
                
                // 获取余额信息
                const balanceResponse = await axios.get('/check_balance', {
                    params: { card: this.apiKey }
                });
                
                if (balanceResponse.data.status === 'success') {
                    if (balanceResponse.data.balance && typeof balanceResponse.data.balance === 'object') {
                        this.balanceInfo = balanceResponse.data.balance.num || 0;
                    } else {
                        this.balanceInfo = balanceResponse.data.balance || 0;
                    }
                } else {
                    this.showAlert('获取余额信息失败: ' + balanceResponse.data.message, 'danger');
                }
                
                this.showAlert('库存和余额信息已更新', 'success');
            } catch (error) {
                console.error('获取信息失败:', error);
                this.showAlert('获取信息失败，请检查网络连接或重试', 'danger');
            } finally {
                this.isChecking = false;
            }
        },
        
        async extractEmails() {
            if (!this.apiKey) {
                this.showAlert('请输入API密钥', 'warning');
                return;
            }
            
            if (!this.emailType) {
                this.showAlert('请选择邮箱类型', 'warning');
                return;
            }
            
            if (!this.extractCount || this.extractCount < 1 || this.extractCount > 2000) {
                this.showAlert('提取数量必须在1到2000之间', 'warning');
                return;
            }
            
            this.isExtracting = true;
            this.clearAlert();
            
            // 用于递归重试
            const makeRequest = async (retryCount = 0) => {
                try {
                    const response = await axios.get('/extract_emails', {
                        params: {
                            card: this.apiKey,
                            shuliang: this.extractCount,
                            leixing: this.emailType,
                            retry_count: retryCount
                        }
                    });
                    
                    if (response.data.status === 'success') {
                        // 成功获取邮箱
                        this.extractedEmails = response.data.emails;
                        const totalRetries = response.data.retries || 0;
                        this.showAlert(`成功提取 ${response.data.count} 个邮箱 (重试${totalRetries}次)`, 'success');
                        
                        // 提取成功后刷新余额
                        this.updateBalanceAfterExtraction();
                        return true;
                    } else if (response.data.status === 'retry') {
                        // 需要继续重试
                        const newRetryCount = response.data.retry_count || (retryCount + 1);
                        this.showAlert(response.data.message || `暂无邮箱库存，已重试${newRetryCount}次，继续尝试中...`, 'warning');
                        
                        // 使用setTimeout创建短暂延迟，避免阻塞UI
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        // 递归重试
                        return await makeRequest(newRetryCount);
                    } else {
                        // 其他错误状态
                        this.showAlert('提取邮箱失败: ' + (response.data.message || '未知错误'), 'danger');
                        return false;
                    }
                } catch (error) {
                    console.error('提取邮箱失败:', error);
                    this.showAlert('提取邮箱失败，请检查网络连接或重试', 'danger');
                    return false;
                }
            };
            
            try {
                await makeRequest();
            } finally {
                this.isExtracting = false;
            }
        },
        
        async updateBalanceAfterExtraction() {
            try {
                const balanceResponse = await axios.get('/check_balance', {
                    params: { card: this.apiKey }
                });
                
                if (balanceResponse.data.status === 'success') {
                    if (balanceResponse.data.balance && typeof balanceResponse.data.balance === 'object') {
                        this.balanceInfo = balanceResponse.data.balance.num || 0;
                    } else {
                        this.balanceInfo = balanceResponse.data.balance || 0;
                    }
                }
            } catch (error) {
                console.error('更新余额信息失败:', error);
            }
        },
        
        copyExtractedEmails() {
            if (this.extractedEmails.length === 0) {
                return;
            }
            
            const emailsText = this.extractedEmails.join('\n');
            
            navigator.clipboard.writeText(emailsText)
                .then(() => {
                    this.showAlert('邮箱列表已复制到剪贴板', 'success');
                })
                .catch(err => {
                    console.error('复制失败:', err);
                    this.showAlert('复制失败，请手动复制', 'danger');
                });
        },
    }
});

// 挂载Vue应用
app.mount('#app'); 