import React, { useState, useEffect } from "react";
import {
  Form,
  Input,
  Button,
  Card,
  message,
  Switch,
  Row,
  Col,
  Tag,
  Spin,
  Checkbox,
  Progress,
} from "antd";
import { CheckboxChangeEvent } from "antd/es/checkbox";
import "./index.css";
import {
  testProxy,
  initialize,
  verifyCaptha,
  getEmailVerificationCode,
  register,
} from "../../services/api";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  SafetyCertificateOutlined,
  MailOutlined,
} from "@ant-design/icons";

const { TextArea } = Input;

// 定义账号信息接口
interface AccountInfo {
  id: number;
  account: string;
  password: string;
  clientId: string;
  token: string;
  status:
    | "pending"
    | "processing"
    | "initializing"
    | "captcha_pending"
    | "email_pending"
    | "success"
    | "error";
  message?: string;
}

const Register: React.FC = () => {
  const [current, setCurrent] = useState(0);
  const [form] = Form.useForm();
  const [useProxy, setUseProxy] = useState(false);
  const [useProxyPool, setUseProxyPool] = useState(false);
  const [_, setUseEmailProxy] = useState(true); // 默认开启邮件代理
  const [loading, setLoading] = useState(false); // Represents the overall batch processing state
  const [accountList, setAccountList] = useState<AccountInfo[]>([]);
  const [processingIndex, setProcessingIndex] = useState<number>(-1); // -1 indicates not started, >= 0 is the index being processed
  const [testingProxy, setTestingProxy] = useState(false);
  const [proxyTestResult, setProxyTestResult] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [isCaptchaVerified, setIsCaptchaVerified] = useState(false);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [emailVerifyLoading, setEmailVerifyLoading] = useState(false); // Loading state for email verification step
  const [allAccountsProcessed, setAllAccountsProcessed] = useState(false); // Checklist item 1: Add state
  const [autoFetchLoading, setAutoFetchLoading] = useState(false); // 新增状态
  const [saveInviteCode, setSaveInviteCode] = useState(false); // Added state for checkbox
  
  // 添加错误跟踪和重试状态
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [emailVerificationError, setEmailVerificationError] = useState<string | null>(null);
  const [registrationError, setRegistrationError] = useState<string | null>(null);

  // 添加重置表单函数
  const resetForm = () => {
    // 保留邀请码
    const savedInviteCode = form.getFieldValue("invite_code");
    
    // 重置表单
    form.resetFields(["accountInfo", "verification_code"]);
    if (savedInviteCode && saveInviteCode) {
      form.setFieldValue("invite_code", savedInviteCode);
    }
    
    // 重置状态
    setLoading(false);
    setAccountList([]);
    setProcessingIndex(-1);
    setCurrent(0);
    setIsCaptchaVerified(false);
    setCaptchaLoading(false);
    setEmailVerifyLoading(false);
    setAllAccountsProcessed(false);
    setAutoFetchLoading(false);
    
    // 重置错误状态
    setCaptchaError(null);
    setEmailVerificationError(null);
    setRegistrationError(null);
    
    message.success("已重置，可以开始新一轮注册");
  };

  // Load saved invite code on mount
  useEffect(() => {
    try {
      const savedCode = localStorage.getItem("savedInviteCode");
      if (savedCode) {
        form.setFieldsValue({ invite_code: savedCode });
        setSaveInviteCode(true);
      }
    } catch (error) {
      console.error("无法访问 localStorage:", error);
      // Don't block rendering, just log error
    }
  }, [form]); // Run once on mount, depends on form instance

  // 初始化重试的专门函数
  const handleRetryInitialization = () => {
    if (processingIndex >= 0 && processingIndex < accountList.length) {
      handleInitializeCurrentAccount(processingIndex);
    }
  };
  
  // 更新移动到下一账号或完成的函数，重置错误状态
  const moveToNextAccountOrComplete = () => {
    // 重置所有错误状态
    setCaptchaError(null);
    setEmailVerificationError(null);
    setRegistrationError(null);
    
    const nextIndex = processingIndex + 1;
    if (nextIndex >= accountList.length) {
      setAllAccountsProcessed(true);
      setLoading(false);
      message.success("所有账号均已处理完毕!");
    } else {
      setAllAccountsProcessed(false);
      setAccountList((prev) =>
        prev.map((acc) =>
          acc.id === nextIndex ? { ...acc, status: "pending" } : acc
        )
      );
      handleStartNextAccount(nextIndex);
    }
    setCurrent(3);
  };

  const handleStartNextAccount = (nextIndex: number) => {
    if (nextIndex >= 0 && nextIndex < accountList.length) {
      // Reset states for the next account's steps
      setProcessingIndex(nextIndex);
      setCurrent(0);
      setIsCaptchaVerified(false);
      setCaptchaLoading(false);
      setEmailVerifyLoading(false);
      form.setFieldsValue({ verification_code: "" }); // Clear previous code
    } else {
      message.info("所有账号均已处理。");
    }
  };

  const handleInitializeCurrentAccount = async (index: number) => {
    if (index < 0 || index >= accountList.length) {
      console.warn(
        "handleInitializeCurrentAccount called with invalid index or empty list",
        index,
        accountList.length
      );
      return;
    }

    const account = accountList[index];
    const inviteCode = form.getFieldValue("invite_code");
    const formUseProxyPool = form.getFieldValue("use_proxy_pool");
    const formUseEmailProxy = form.getFieldValue("use_email_proxy");
    const proxyUrl = form.getFieldValue("use_proxy") && !formUseProxyPool
      ? form.getFieldValue("proxy_url")
      : undefined;

    setAccountList((prev) =>
      prev.map((acc) =>
        acc.id === account.id
          ? { ...acc, status: "initializing", message: "开始初始化..." }
          : acc
      )
    );

    try {
      const dataToSend: any = {
        invite_code: inviteCode,
        email: account.account,
        use_proxy: form.getFieldValue("use_proxy"),
        use_proxy_pool: formUseProxyPool,
        use_email_proxy: formUseEmailProxy,
      };
      if (proxyUrl) {
        dataToSend.proxy_url = proxyUrl;
      }

      let formData = new FormData();
      for (const key in dataToSend) {
        formData.append(key, dataToSend[key]);
      }

      const response = await initialize(formData);
      const responseData = response.data;
      console.log(
        `[${account.account}] Initialize API response:`,
        responseData
      );

      if (responseData.status === "success") {
        setAccountList((prev) =>
          prev.map((acc) =>
            acc.id === account.id
              ? {
                  ...acc,
                  status: "captcha_pending",
                  message: responseData.message || "初始化成功, 等待验证码",
                }
              : acc
          )
        );
        setCurrent(1); // Move to captcha step for this account

        // 直接调用过滑块验证
        setTimeout(() => {
          handleCaptchaVerification();
        }, 1000);
      } else {
        throw new Error(responseData.message || "初始化返回失败状态");
      }
    } catch (error: any) {
      console.error(`[${account.account}] 初始化失败:`, error);
      const errorMessage = error.message || "未知错误";
      // Update status first
      setAccountList((prev) =>
        prev.map((acc) =>
          acc.id === account.id
            ? {
                ...acc,
                status: "error",
                message: `初始化失败: ${errorMessage}`,
              }
            : acc
        )
      );
      // 不再自动跳到下一个账号，让用户选择是重试还是跳过
      // moveToNextAccountOrComplete(); // 移除这行代码
    }
  };

  const startProcessing = async () => {
    try {
      const values = await form.validateFields([
        "invite_code",
        "accountInfo",
        "use_proxy",
        "proxy_url",
      ]); // Validate needed fields
      setLoading(true);
      setAccountList([]);
      setProcessingIndex(-1);
      setCurrent(0);
      setIsCaptchaVerified(false);
      setCaptchaLoading(false);

      const lines = values.accountInfo
        .split("\n")
        .filter((line: string) => line.trim() !== "");
      const parsedAccounts: AccountInfo[] = [];
      let formatError = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const parts = line.split("----");
        if (
          parts.length < 4 ||
          parts.some((part: string) => part.trim() === "")
        ) {
          message.error(`第 ${i + 1} 行格式错误或包含空字段，请检查！`);
          formatError = true;
          break; // Stop parsing on first error
        }
        parsedAccounts.push({
          id: i,
          account: parts[0].trim(),
          password: parts[1].trim(),
          clientId: parts[2].trim(),
          token: parts[3].trim(),
          status: "pending",
        });
      }

      if (formatError) {
        setLoading(false);
        return;
      }

      if (parsedAccounts.length === 0) {
        message.warning("请输入至少一条有效的账号信息。");
        setLoading(false);
        return;
      }
      // console.log(parsedAccounts, "----------------"); // Keep user's log if desired
      setAccountList(parsedAccounts);
      setProcessingIndex(0); // Start with the first account
      setLoading(true); // Ensure loading is true when processing starts
      setAllAccountsProcessed(false); // Reset completion flag
      setCurrent(0); // Ensure starting at step 0
      setIsCaptchaVerified(false); // Reset step-specific states
      setCaptchaLoading(false);
      setEmailVerifyLoading(false);
    } catch (error) {
      console.error("表单验证失败或解析错误:", error);
      setLoading(false);
      // Validation errors are handled by Antd form
    }
  };

  const handleCaptchaVerification = async () => {
    if (processingIndex < 0 || processingIndex >= accountList.length) return;
    const currentAccount = accountList[processingIndex];

    setCaptchaLoading(true);
    setIsCaptchaVerified(false);
    setCaptchaError(null); // 重置验证码错误状态
    
    try {
      console.log(`[${currentAccount.account}] 调用 verifyCaptha API...`);
      let formData = new FormData();
      formData.append("email", currentAccount.account); // Pass current email
      const response = await verifyCaptha(formData);
      const responseData = response.data;
      console.log(
        `[${currentAccount.account}] verifyCaptha API response:`,
        responseData
      );

      if (responseData.status === "success") {
        message.success(responseData.message || "验证成功！");
        setIsCaptchaVerified(true); // Set verification success
        // 可以点击下一步
        setAccountList((prev) =>
          prev.map((acc) =>
            acc.id === currentAccount.id
              ? {
                  ...acc,
                  status: "email_pending",
                  message: "验证码成功, 等待邮箱验证",
                }
              : acc
          )
        );
        // 验证成功时自动移至下一步
        setCurrent(2);
        // DO NOT call next() here, user clicks the button
        // 获取验证码
        setTimeout(() => {
          handleAutoFetchCode();
        }, 200);
      } else {
        const errorMessage = responseData.message || "验证失败，请确保已完成滑块验证后重试";
        message.error(errorMessage);
        setIsCaptchaVerified(false);
        setCaptchaError(errorMessage); // 设置错误信息
        
        // 更新账号状态为错误，但保持在当前步骤
        setAccountList((prev) =>
          prev.map((acc) =>
            acc.id === currentAccount.id
              ? { 
                  ...acc, 
                  message: `滑块验证失败: ${errorMessage}` 
                }
              : acc
          )
        );
      }
    } catch (error: any) {
      // Added type annotation
      console.error(`[${currentAccount.account}] 验证码 API 调用失败:`, error);
      const errorMessage = error.message || "未知错误";
      message.error(`验证码验证出错: ${errorMessage}`);
      setIsCaptchaVerified(false);
      setCaptchaError(errorMessage); // 设置错误信息
      
      // 更新账号状态为错误，但保持在当前步骤
      setAccountList((prev) =>
        prev.map((acc) =>
          acc.id === currentAccount.id
            ? { 
                ...acc, 
                message: `滑块验证出错: ${errorMessage}` 
              }
            : acc
        )
      );
    } finally {
      setCaptchaLoading(false);
      // 移除这里的setCurrent(2)，让步骤只在验证成功时前进
      // setCurrent(2);
    }
  };

  // 添加滑块验证重试功能
  const handleRetryCaptcha = () => {
    setCaptchaError(null);
    handleCaptchaVerification();
  };

  const handleEmailVerification = async () => {
    if (processingIndex < 0 || processingIndex >= accountList.length) return;
    const currentAccount = accountList[processingIndex];
    const verificationCode = form.getFieldValue("verification_code"); // Get code from form

    if (!verificationCode) {
      message.error("请输入邮箱验证码！");
      return;
    }

    setEmailVerifyLoading(true);
    setRegistrationError(null); // 重置注册错误状态
    setAccountList((prev) =>
      prev.map((acc) =>
        acc.id === currentAccount.id
          ? { ...acc, message: "正在提交注册信息..." }
          : acc
      )
    ); // 更新提示信息

    try {
      console.log(`[${currentAccount.account}] 调用注册 API...`, {
        code: verificationCode,
      });

      // --- 替换模拟代码为实际 API 调用 ---
      // 准备数据
      const formData = new FormData();
      formData.append("email", currentAccount.account);
      formData.append("verification_code", verificationCode);

      const response = await register(formData);
      const responseData = response.data;
      console.log(
        `[${currentAccount.account}] Register API response:`,
        responseData
      );

      // 处理响应
      if (responseData.status === "success") {
        // 成功情况
        console.log(`[${currentAccount.account}] 注册成功`);
        message.success(responseData.message || "注册成功!");
        // 更新状态和消息
        setAccountList((prev) =>
          prev.map((acc) =>
            acc.id === currentAccount.id
              ? {
                  ...acc,
                  status: "success",
                  message: responseData.message || "注册成功",
                  // 可选: 存储 responseData.account_info
                }
              : acc
          )
        );
        // 移动到下一步或完成
        moveToNextAccountOrComplete();
        setLoading(false);
      } else {
        // 失败情况 (后端返回非成功状态)
        const errorMessage = responseData.message || "注册返回失败状态";
        throw new Error(errorMessage);
      }
      // --- 结束替换 ---
    } catch (error: any) {
      console.error(`[${currentAccount.account}] 注册失败:`, error);
      const errorMessage = error.message || "未知错误";
      message.error(`注册失败: ${errorMessage}`);
      setRegistrationError(errorMessage); // 设置注册错误状态
      
      // 更新状态和消息，但不移动到下一个账号
      setAccountList((prev) =>
        prev.map((acc) =>
          acc.id === currentAccount.id
            ? { ...acc, message: `注册失败: ${errorMessage}` }
            : acc
        )
      );
    } finally {
      setEmailVerifyLoading(false);
    }
  };

  // 添加注册重试功能
  const handleRetryRegistration = () => {
    setRegistrationError(null);
    handleEmailVerification();
  };

  const getCurrentAccount = () => {
    if (processingIndex >= 0 && processingIndex < accountList.length) {
      return accountList[processingIndex];
    }
    return null;
  };

  const handleTestProxy = async () => {
    setProxyTestResult("idle");
    const proxyUrl = form.getFieldValue("proxy_url");
    if (!proxyUrl || !proxyUrl.trim()) {
      message.error("请输入代理地址再进行测试！");
      return;
    }
    if (!proxyUrl.startsWith("http://") && !proxyUrl.startsWith("https://")) {
      message.warning(
        "代理地址格式似乎不正确，请检查 (应以 http:// 或 https:// 开头)"
      );
    }

    setTestingProxy(true);
    const formData = new FormData();
    formData.append("proxy_url", proxyUrl);

    try {
      const response = await testProxy(formData);
      const responseData = response.data;
      if (responseData.status === "success") {
        setProxyTestResult("success");
      } else {
        setProxyTestResult("error");
      }
    } catch (error: any) {
      console.error("测试代理失败:", error);
      setProxyTestResult("error");
    } finally {
      setTestingProxy(false);
    }
  };

  useEffect(() => {
    if (
      accountList.length > 0 &&
      processingIndex < accountList.length &&
      accountList[processingIndex].status === "pending"
    ) {
      console.log("useEffect triggering initialization for index 0");
      // Call the initialization function for the first account
      handleInitializeCurrentAccount(processingIndex);
    }
    // Dependencies: run when the index changes or the list is populated
  }, [processingIndex, accountList]);

  const handleAutoFetchCode = async () => {
    const currentAccount = getCurrentAccount();
    setAutoFetchLoading(true);
    setEmailVerificationError(null); // 重置验证码获取错误状态
    
    try {
      const formData = new FormData();
      formData.append("email", currentAccount?.account || "");
      formData.append("password", currentAccount?.password || "");
      formData.append("token", currentAccount?.token || "");
      formData.append("client_id", currentAccount?.clientId || "");

      const response = await getEmailVerificationCode(formData);

      const result = response.data;

      if (result.status === "success" && result.verification_code) {
        form.setFieldValue("verification_code", result.verification_code);
        message.success(result.msg || "验证码已自动填入");
        console.log("收到验证码：", result.verification_code);
        
        // 验证邮箱
        setTimeout(() => {
          handleEmailVerification();
        }, 1000);
      } else {
        // 显示后端返回的更具体的错误信息
        const errorMessage = result.msg || "未能获取验证码，请检查邮箱和密码或手动输入";
        message.error(errorMessage);
        setEmailVerificationError(errorMessage); // 设置错误信息
        
        // 更新账号状态显示错误
        if (currentAccount) {
          setAccountList((prev) =>
            prev.map((acc) =>
              acc.id === currentAccount.id
                ? { 
                    ...acc, 
                    message: `获取验证码失败: ${errorMessage}` 
                  }
                : acc
            )
          );
        }
      }
    } catch (error: any) {
      const errorMessage = error.message || "未知错误";
      message.error(`获取验证码时出错: ${errorMessage}`);
      setEmailVerificationError(errorMessage); // 设置错误信息
      console.error("Auto fetch code error:", error);
      
      // 更新账号状态显示错误
      if (currentAccount) {
        setAccountList((prev) =>
          prev.map((acc) =>
            acc.id === currentAccount.id
              ? { 
                  ...acc, 
                  message: `获取验证码出错: ${errorMessage}` 
                }
              : acc
          )
        );
      }
    } finally {
      setAutoFetchLoading(false);
    }
  };

  // 添加获取验证码重试功能
  const handleRetryEmailVerification = () => {
    setEmailVerificationError(null);
    handleAutoFetchCode();
  };

  const handleSaveInviteCodeChange = (e: CheckboxChangeEvent) => {
    const isChecked = e.target.checked;
    setSaveInviteCode(isChecked);
    const currentCode = form.getFieldValue("invite_code");
    try {
      if (isChecked && currentCode) {
        localStorage.setItem("savedInviteCode", currentCode);
      } else {
        localStorage.removeItem("savedInviteCode");
      }
    } catch (error) {
      console.error("无法访问 localStorage:", error);
      message.error("无法保存邀请码设置，存储不可用。");
    }
  };

  const handleInviteCodeInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newCode = e.target.value;
    if (saveInviteCode) {
      try {
        if (newCode) {
          localStorage.setItem("savedInviteCode", newCode);
        } else {
          // If code is cleared while save is checked, remove from storage
          localStorage.removeItem("savedInviteCode");
        }
      } catch (error) {
        console.error("无法访问 localStorage:", error);
        // Optionally show message, but might be too noisy on every input change
      }
    }
  };

  const steps = [
    {
      title: "初始化",
      content: (() => {
        const currentAccount = getCurrentAccount();
        const status = currentAccount?.status || "pending";

        // 根据状态决定不同的初始化步骤样式
        if (status === "pending") {
          return (
            <div
              className="step-content-container"
              style={{ textAlign: "center", padding: "12px" }}
            >
              <div
                style={{
                  fontSize: "42px",
                  color: "#8c8c8c",
                  marginBottom: "10px",
                }}
              >
                <SafetyCertificateOutlined />
              </div>
              <h3
                style={{
                  marginBottom: "10px",
                  fontSize: "18px",
                  fontWeight: "bold",
                }}
              >
                等待初始化
              </h3>
              <p style={{ color: "#666", marginBottom: "10px" }}>
                系统准备就绪，正在等待开始初始化流程
              </p>
              <Progress percent={0} status="normal" />
            </div>
          );
        } else if (status === "initializing") {
          return (
            <div
              className="step-content-container"
              style={{ textAlign: "center", padding: "12px" }}
            >
              <div
                style={{
                  fontSize: "42px",
                  color: "#1890ff",
                  marginBottom: "10px",
                }}
              >
                <SyncOutlined spin />
              </div>
              <h3
                style={{
                  marginBottom: "10px",
                  fontSize: "18px",
                  fontWeight: "bold",
                }}
              >
                正在初始化
              </h3>
              <p style={{ color: "#666", marginBottom: "10px" }}>
                系统正在准备您的注册环境，请稍候...
              </p>
              <Progress percent={25} status="active" />
            </div>
          );
        } else if (status === "error") {
          return (
            <div
              className="step-content-container"
              style={{ textAlign: "center", padding: "12px" }}
            >
              <div
                style={{
                  fontSize: "42px",
                  color: "#ff4d4f",
                  marginBottom: "10px",
                }}
              >
                <CloseCircleOutlined />
              </div>
              <h3
                style={{
                  marginBottom: "10px",
                  fontSize: "18px",
                  fontWeight: "bold",
                }}
              >
                初始化失败
              </h3>
              <p style={{ color: "#666", marginBottom: "10px" }}>
                {currentAccount?.message ||
                  "初始化过程中遇到错误，请检查网络或代理设置"}
              </p>
              <Progress percent={25} status="exception" />
              <div style={{ marginTop: "8px" }}>
                <Button
                  type="primary"
                  danger
                  onClick={handleRetryInitialization}
                  style={{ marginRight: "8px" }}
                >
                  重试初始化
                </Button>
                <Button
                  onClick={moveToNextAccountOrComplete}
                >
                  跳过此账号
                </Button>
              </div>
            </div>
          );
        } else {
          // 其他状态表示已初始化完成
          return (
            <div
              className="step-content-container"
              style={{ textAlign: "center", padding: "12px" }}
            >
              <div
                style={{
                  fontSize: "42px",
                  color: "#52c41a",
                  marginBottom: "10px",
                }}
              >
                <CheckCircleOutlined />
              </div>
              <h3
                style={{
                  marginBottom: "10px",
                  fontSize: "18px",
                  fontWeight: "bold",
                }}
              >
                初始化完成
              </h3>
              <p style={{ color: "#666", marginBottom: "10px" }}>
                环境准备就绪，可以继续下一步操作
              </p>
              <Progress percent={100} status="success" />
            </div>
          );
        }
      })(),
    },
    {
      title: "滑块验证",
      content: (() => {
        // 滑块验证步骤的UI
        if (captchaLoading) {
          return (
            <div
              className="step-content-container"
              style={{ textAlign: "center", padding: "12px" }}
            >
              <div
                style={{
                  fontSize: "42px",
                  color: "#1890ff",
                  marginBottom: "10px",
                }}
              >
                <SyncOutlined spin />
              </div>
              <h3
                style={{
                  marginBottom: "10px",
                  fontSize: "18px",
                  fontWeight: "bold",
                }}
              >
                正在进行滑块验证
              </h3>
              <p style={{ color: "#666", marginBottom: "10px" }}>
                系统正在自动完成滑块验证，请稍候...
              </p>
              <Progress percent={50} status="active" />
            </div>
          );
        } else if (isCaptchaVerified) {
          return (
            <div
              className="step-content-container"
              style={{ textAlign: "center", padding: "12px" }}
            >
              <div
                style={{
                  fontSize: "42px",
                  color: "#52c41a",
                  marginBottom: "10px",
                }}
              >
                <CheckCircleOutlined />
              </div>
              <h3
                style={{
                  marginBottom: "10px",
                  fontSize: "18px",
                  fontWeight: "bold",
                }}
              >
                滑块验证成功
              </h3>
              <p style={{ color: "#666", marginBottom: "10px" }}>
                成功完成滑块验证，验证码已发送至邮箱
              </p>
              <Progress percent={100} status="success" />
            </div>
          );
        } else if (captchaError) {
          // 滑块验证失败时显示错误和重试按钮
          return (
            <div
              className="step-content-container"
              style={{ textAlign: "center", padding: "12px" }}
            >
              <div
                style={{
                  fontSize: "42px",
                  color: "#ff4d4f",
                  marginBottom: "10px",
                }}
              >
                <CloseCircleOutlined />
              </div>
              <h3
                style={{
                  marginBottom: "10px",
                  fontSize: "18px",
                  fontWeight: "bold",
                }}
              >
                滑块验证失败
              </h3>
              <p style={{ color: "#666", marginBottom: "10px" }}>
                {captchaError}
              </p>
              <Progress percent={50} status="exception" />
              <div style={{ marginTop: "8px" }}>
                <Button
                  type="primary"
                  danger
                  onClick={handleRetryCaptcha}
                  style={{ marginRight: "8px" }}
                >
                  重试滑块验证
                </Button>
                <Button
                  onClick={moveToNextAccountOrComplete}
                >
                  跳过此账号
                </Button>
              </div>
            </div>
          );
        } else {
          return (
            <div
              className="step-content-container"
              style={{ textAlign: "center", padding: "12px" }}
            >
              <div
                style={{
                  fontSize: "42px",
                  color: "#8c8c8c",
                  marginBottom: "10px",
                }}
              >
                <SyncOutlined />
              </div>
              <h3
                style={{
                  marginBottom: "10px",
                  fontSize: "18px",
                  fontWeight: "bold",
                }}
              >
                等待滑块验证
              </h3>
              <p style={{ color: "#666", marginBottom: "10px" }}>
                点击下方的"开始验证"按钮进行滑块验证
              </p>
              <Progress percent={40} status="normal" />
            </div>
          );
        }
      })(),
    },
    {
      title: "邮箱验证",
      content: (() => {
        const currentAccount = getCurrentAccount();
        
        // 根据不同状态显示不同内容
        if (emailVerifyLoading) {
          return (
            <div
              className="step-content-container"
              style={{ textAlign: "center", padding: "12px" }}
            >
              <div
                style={{
                  fontSize: "42px",
                  color: "#1890ff",
                  marginBottom: "10px",
                }}
              >
                <SyncOutlined spin />
              </div>
              <h3
                style={{
                  marginBottom: "10px",
                  fontSize: "18px",
                  fontWeight: "bold",
                }}
              >
                正在验证
              </h3>
              <p style={{ color: "#666", marginBottom: "10px" }}>
                正在验证您的邮箱验证码，请稍候...
              </p>
              <Progress percent={75} status="active" />
            </div>
          );
        } else if (registrationError) {
          // 注册失败时显示
          return (
            <div
              className="step-content-container"
              style={{ textAlign: "center", padding: "12px" }}
            >
              <div
                style={{
                  fontSize: "42px",
                  color: "#ff4d4f",
                  marginBottom: "10px",
                }}
              >
                <CloseCircleOutlined />
              </div>
              <h3
                style={{
                  marginBottom: "10px",
                  fontSize: "18px",
                  fontWeight: "bold",
                }}
              >
                注册失败
              </h3>
              <p style={{ color: "#666", marginBottom: "10px" }}>
                {registrationError}
              </p>
              <Form form={form}>
              <Form.Item
                name="verification_code"
                style={{ maxWidth: "300px", margin: "0 auto 10px" }}
              >
                <Input placeholder="输入邮箱验证码" />
              </Form.Item>
              </Form>
              <div style={{ marginTop: "8px" }}>
                <Button
                  type="primary"
                  danger
                  onClick={handleRetryRegistration}
                  style={{ marginRight: "8px" }}
                >
                  重试注册
                </Button>
                <Button
                  onClick={moveToNextAccountOrComplete}
                >
                  跳过此账号
                </Button>
              </div>
            </div>
          );
        } else if (emailVerificationError) {
          // 获取验证码失败时显示
          return (
            <div
              className="step-content-container"
              style={{ textAlign: "center", padding: "12px" }}
            >
              <div
                style={{
                  fontSize: "42px",
                  color: "#ff4d4f",
                  marginBottom: "10px",
                }}
              >
                <CloseCircleOutlined />
              </div>
              <h3
                style={{
                  marginBottom: "10px",
                  fontSize: "18px",
                  fontWeight: "bold",
                }}
              >
                获取验证码失败
              </h3>
              <p style={{ color: "#666", marginBottom: "10px" }}>
                {emailVerificationError}
              </p>
              <div style={{ marginTop: "8px" }}>
                <Button
                  type="primary"
                  danger
                  onClick={handleRetryEmailVerification}
                  style={{ marginRight: "8px" }}
                >
                  重试获取验证码
                </Button>
                <Button
                  onClick={moveToNextAccountOrComplete}
                >
                  跳过此账号
                </Button>
              </div>
            </div>
          );
        } else {
          // 默认显示内容
          return (
            <div
              className="step-content-container"
              style={{ textAlign: "center", padding: "12px" }}
            >
              <div
                style={{
                  fontSize: "42px",
                  color: "#1890ff",
                  marginBottom: "10px",
                }}
              >
                <MailOutlined />
              </div>
              <h3
                style={{
                  marginBottom: "10px",
                  fontSize: "18px",
                  fontWeight: "bold",
                }}
              >
                邮箱验证
              </h3>
              <p style={{ color: "#666", marginBottom: "10px" }}>
                {currentAccount ? `验证码已发送至 ${currentAccount.account}` : "验证码已发送至邮箱"}
              </p>
              <Form.Item
                label="验证码"
                name="verification_code"
                style={{ maxWidth: "300px", margin: "0 auto 10px" }}
              >
                <Input placeholder="输入邮箱验证码" />
              </Form.Item>
              <Button
                type="default"
                onClick={handleAutoFetchCode}
                loading={autoFetchLoading}
                style={{ marginRight: "8px" }}
              >
                自动获取验证码
              </Button>
              <Progress percent={60} status="active" style={{ marginTop: "10px" }} />
            </div>
          );
        }
      })(),
    },
    {
      title: "结果",
      content: (() => {
        if (allAccountsProcessed) {
          return (
            <div
              className="step-content-container"
              style={{ textAlign: "center", padding: "12px" }}
            >
              <div
                style={{
                  fontSize: "42px",
                  color: "#52c41a",
                  marginBottom: "10px",
                }}
              >
                <CheckCircleOutlined />
              </div>
              <h3
                style={{
                  marginBottom: "10px",
                  fontSize: "18px",
                  fontWeight: "bold",
                }}
              >
                所有账号处理完成！
              </h3>
              <p style={{ color: "#666", marginBottom: "10px" }}>
                所有账号已处理完毕，可以在右侧查看处理结果
              </p>
              <Progress percent={100} status="success" />
            </div>
          );
        } else {
          return (
            <div
              className="step-content-container"
              style={{ textAlign: "center", padding: "12px" }}
            >
              <div
                style={{
                  fontSize: "42px",
                  color: "#8c8c8c",
                  marginBottom: "10px",
                }}
              >
                <SyncOutlined />
              </div>
              <h3
                style={{
                  marginBottom: "10px",
                  fontSize: "18px",
                  fontWeight: "bold",
                }}
              >
                等待完成注册
              </h3>
              <p style={{ color: "#666", marginBottom: "10px" }}>
                等待完成前面的步骤
              </p>
              <Progress percent={0} status="normal" />
            </div>
          );
        }
      })(),
    },
  ];

  const next = () => {
    if (current < steps.length - 1) {
      setCurrent(current + 1);
    }
  };

  const handleMainButtonClick = async () => {
    if (current === 0) {
      // 初始化页面
      const currentAccount = getCurrentAccount();
      
      // 如果当前有错误状态的账号，提供重试选项
      if (currentAccount && currentAccount.status === "error") {
        handleRetryInitialization();
      } else {
        await startProcessing();
      }
    } else if (current === 1) {
      // 滑块验证页面
      if (captchaError) {
        // 如果有错误，重试滑块验证
        handleRetryCaptcha();
      } else if (isCaptchaVerified) {
        next(); // 验证已通过，移至下一步
      } else {
        // 未开始验证，显示警告
        console.log("请先完成滑块验证！");
        message.warning("请先完成滑块验证！");
      }
    } else if (current === 2) {
      // 邮箱验证页面
      if (registrationError) {
        // 注册失败，重试注册
        handleRetryRegistration();
      } else if (emailVerificationError) {
        // 获取验证码失败，重试获取
        handleRetryEmailVerification();
      } else {
        // 正常验证
        await handleEmailVerification();
      }
    } else if (current === 3) {
      // 结果页面
      if (allAccountsProcessed) {
        // 如果所有账号都已处理完成，重置表单
        resetForm();
      } else {
        // 否则，开始处理下一个账号
        handleStartNextAccount(processingIndex + 1);
      }
    }
  };

  let mainButtonText = "开始处理";
  let mainButtonLoading = loading;
  let mainButtonDisabled = false;

  if (current === 0) {
    const currentAccount = getCurrentAccount();
    if (currentAccount && currentAccount.status === "error") {
      mainButtonText = "重试初始化";
      mainButtonDisabled = false;
    } else {
      mainButtonText = "开始处理";
      mainButtonDisabled = loading || processingIndex !== -1; // Disable if already processing
    }
  } else if (current === 1) {
    // 滑块验证页面
    if (captchaError) {
      mainButtonText = "重试滑块验证";
      mainButtonLoading = captchaLoading;
    } else if (isCaptchaVerified) {
      mainButtonText = "下一步";
      mainButtonDisabled = false;
    } else {
      mainButtonText = "开始验证";
      mainButtonLoading = captchaLoading;
    }
  } else if (current === 2) {
    // 邮箱验证页面
    if (registrationError) {
      mainButtonText = "重试注册";
      mainButtonLoading = emailVerifyLoading;
    } else if (emailVerificationError) {
      mainButtonText = "重试获取验证码";
      mainButtonLoading = autoFetchLoading;
    } else {
      mainButtonText = "验证邮箱";
      mainButtonLoading = emailVerifyLoading;
      mainButtonDisabled = form.getFieldValue("verification_code") === "";
    }
  } else if (current === 3) {
    if (allAccountsProcessed) {
      mainButtonText = "完成并重置";
    } else if (processingIndex === accountList.length - 1) {
      mainButtonText = "完成";
    } else {
      mainButtonText = "开始下一个账号";
    }
  }

  return (
    <div className="register-container">
      <Card title="PikPak 账号注册" variant="borderless" className="register-card">
        <Row gutter={24}>
          <Col xs={24} md={24}>
            {" "}
            {/* 左侧表单 */}
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                accountInfo: "",
                use_proxy: false,
                use_proxy_pool: false,
                use_email_proxy: true,
                proxy_url: "http://127.0.0.1:7890",
              }}
            >
              <Form.Item label="邀请码" required>
                <Row align="middle" gutter={8}>
                  <Col flex="auto">
                    <Form.Item
                      name="invite_code"
                      noStyle
                      rules={[{ required: true, message: "请输入邀请码" }]}
                    >
                      <Input
                        placeholder="请输入邀请码"
                        disabled={loading}
                        onChange={handleInviteCodeInputChange}
                      />
                    </Form.Item>
                  </Col>
                  <Col>
                    <Checkbox
                      checked={saveInviteCode}
                      onChange={handleSaveInviteCodeChange}
                      disabled={loading}
                    >
                      保存
                    </Checkbox>
                  </Col>
                </Row>
              </Form.Item>
              <Form.Item
                label="微软邮箱信息 (每行一条)"
                name="accountInfo"
                rules={[
                  { required: true, message: "请输入账号信息" },
                  // 可选：添加更复杂的自定义验证器
                ]}
              >
                <TextArea
                  rows={10}
                  placeholder="格式: 账号----密码----clientId----授权令牌"
                  disabled={loading}
                />
              </Form.Item>
              <Form.Item
                label="使用代理"
                name="use_proxy"
                valuePropName="checked"
              >
                <Switch
                  onChange={(checked) => {
                    setUseProxy(checked);
                    if (!checked) {
                      // 关闭代理时，同时关闭代理池和邮件代理
                      setUseProxyPool(false);
                      setUseEmailProxy(false);
                      form.setFieldsValue({ 
                        use_proxy_pool: false,
                        use_email_proxy: false 
                      });
                    } else {
                      // 开启代理时，默认开启邮件代理
                      setUseEmailProxy(true);
                      form.setFieldsValue({ use_email_proxy: true });
                    }
                  }}
                  disabled={loading}
                />
              </Form.Item>
              {useProxy && (
                <Form.Item
                  label="使用内置代理池"
                  name="use_proxy_pool"
                  valuePropName="checked"
                  tooltip="启用后将自动从代理池中选择可用代理，无需手动输入代理地址"
                >
                  <Switch 
                    onChange={(checked) => {
                      setUseProxyPool(checked);
                      if (checked) {
                        // 启用代理池时，清空手动输入的代理地址
                        form.setFieldsValue({ proxy_url: '' });
                        setProxyTestResult("idle");
                      }
                    }}
                    disabled={loading} 
                  />
                </Form.Item>
              )}
              {useProxy && (
                <Form.Item
                  label="获取邮件使用代理"
                  name="use_email_proxy"
                  valuePropName="checked"
                  tooltip="启用后获取邮件验证码时也会使用代理"
                >
                  <Switch 
                    onChange={(checked) => setUseEmailProxy(checked)}
                    disabled={loading} 
                  />
                </Form.Item>
              )}
              {useProxy && !useProxyPool && (
                <Form.Item label="代理地址" required={useProxy}>
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      alignItems: "center",
                    }}
                  >
                    <Form.Item
                      name="proxy_url"
                      rules={[
                        { required: useProxy, message: "请输入代理地址" },
                      ]}
                      style={{ flexGrow: 1, marginBottom: 0 }}
                    >
                      <Input
                        placeholder="例如: http://127.0.0.1:7890"
                        disabled={loading}
                        onChange={() => setProxyTestResult("idle")}
                      />
                    </Form.Item>
                    <Button
                      onClick={handleTestProxy}
                      loading={testingProxy}
                      disabled={loading}
                    >
                      测试代理
                    </Button>
                    {proxyTestResult === "success" && (
                      <CheckCircleOutlined
                        style={{ color: "#52c41a", fontSize: "18px" }}
                      />
                    )}
                    {proxyTestResult === "error" && (
                      <CloseCircleOutlined
                        style={{ color: "#ff4d4f", fontSize: "18px" }}
                      />
                    )}
                  </div>
                </Form.Item>
              )}
            </Form>
          </Col>
        </Row>{" "}
        {/* Add current to key */}
        <div className="steps-action">
          {current <= 3 && (
            <Button
              type="primary"
              onClick={handleMainButtonClick}
              loading={mainButtonLoading}
              disabled={mainButtonDisabled}
            >
              {mainButtonText}
            </Button>
          )}
        </div>
      </Card>
      <div className="register-right">
        {/* 右侧状态/说明 */}
        <Row gutter={24}>
          <Card
            className="register-card"
            title={`处理状态 ${
              processingIndex >= 0
                ? `(账号 ${processingIndex + 1} / ${accountList.length})`
                : ""
            }`}
          >
            {processingIndex === -1 && accountList.length === 0 && (
              <div>
                <p>请在左侧输入微软邮箱信息，每行一条，格式如下:</p>
                <pre>
                  <code>邮箱----密码----clientId----授权令牌</code>
                </pre>
                <p>例如:</p>
                <pre>
                  <code>
                    user@example.com----password123----client_abc----token_xyz
                  </code>
                </pre>
                <p>输入完成后，点击"开始处理"开始处理。</p>
              </div>
            )}
            {(processingIndex !== -1 || accountList.length > 0) && (
              <div style={{ maxHeight: "calc(50vh - 127px)", overflowY: "auto" }}>
                {accountList.map((acc, index) => (
                  <div
                    key={acc.id}
                    style={{
                      marginBottom: "10px",
                      padding: "8px",
                      border:
                        index === processingIndex
                          ? "2px solid #1890ff"
                          : "1px solid #eee",
                      borderRadius: "4px",
                      background:
                        index === processingIndex ? "#e6f7ff" : "transparent",
                      opacity:
                        acc.status === "success" || acc.status === "error"
                          ? 0.7
                          : 1,
                    }}
                  >
                    <Spin
                      spinning={
                        acc.status === "processing" ||
                        acc.status === "initializing"
                      }
                      size="small"
                      style={{ marginRight: "8px" }}
                    >
                      <strong>账号:</strong> {acc.account}
                    </Spin>
                    <div style={{ marginTop: "5px" }}>
                      <strong>状态:</strong>{" "}
                      {acc.status === "pending" && <Tag>待处理</Tag>}
                      {acc.status === "processing" && (
                        <Tag color="processing">处理中</Tag>
                      )}
                      {acc.status === "initializing" && (
                        <Tag color="processing">初始化中</Tag>
                      )}
                      {acc.status === "captcha_pending" && (
                        <Tag color="warning">等待验证码</Tag>
                      )}
                      {acc.status === "email_pending" && (
                        <Tag color="warning">等待邮箱验证</Tag>
                      )}
                      {acc.status === "success" && (
                        <Tag color="success">注册成功</Tag>
                      )}
                      {acc.status === "error" && (
                        <Tag color="error">失败</Tag>
                      )}
                    </div>
                    {acc.message && (
                      <div style={{ marginTop: "5px", fontSize: "12px" }}>
                        <strong>消息:</strong>{" "}
                        <span style={{ 
                          color: acc.message && (acc.message.includes("失败") || acc.message.includes("错误"))
                            ? "#ff4d4f" 
                            : acc.message && acc.message.includes("成功") 
                              ? "#52c41a" 
                              : "#666" 
                        }}>
                          {acc.message}
                        </span>
                        {acc.message && (acc.message.includes("失败") || acc.message.includes("错误")) && (
                          <span>
                            <Button 
                              size="small" 
                              type="text" 
                              danger
                              style={{ marginLeft: "4px" }}
                              onClick={() => {
                                // 根据消息类型确定重试哪个步骤
                                if (index === processingIndex) {
                                  if (acc.message && acc.message.includes("初始化失败")) {
                                    handleRetryInitialization();
                                  } else if (acc.message && acc.message.includes("滑块验证")) {
                                    handleRetryCaptcha();
                                  } else if (acc.message && acc.message.includes("获取验证码")) {
                                    handleRetryEmailVerification();
                                  } else if (acc.message && acc.message.includes("注册失败")) {
                                    handleRetryRegistration();
                                  }
                                } else {
                                  // 如果不是当前处理的账号，先切换到它
                                  setProcessingIndex(index);
                                  message.info(`已切换到账号 ${acc.account}`);
                                }
                              }}
                            >
                              重试
                            </Button>
                            <Button
                              size="small"
                              type="text"
                              style={{ marginLeft: "4px" }}
                              onClick={() => {
                                if (index === processingIndex) {
                                  // 如果是当前处理的账号，直接跳过
                                  moveToNextAccountOrComplete();
                                } else {
                                  // 如果不是当前处理的账号，提示不能跳过
                                  message.info(`只能跳过当前正在处理的账号`);
                                }
                              }}
                            >
                              跳过
                            </Button>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Row>
        <Row gutter={24}>
          <Card title={steps[current].title} className="register-card">
            {steps[current].content}
          </Card>
        </Row>
      </div>
    </div>
  );
};

export default Register;
