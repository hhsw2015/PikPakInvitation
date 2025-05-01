import React, { useState, useEffect } from "react";
import {
  Form,
  Input,
  Button,
  Card,
  Steps,
  message,
  Switch,
  Divider,
  Row,
  Col,
  Tag,
  Spin,
  Alert,
  Checkbox,
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
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";

const { Step } = Steps;
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saveInviteCode, setSaveInviteCode] = useState(false); // Added state for checkbox

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

  // 定义账号信息接口
  const moveToNextAccountOrComplete = () => {
    const nextIndex = processingIndex + 1;
    setProcessingIndex(nextIndex); // Increment index first
    setCurrent(3); // Always go to the intermediate/final complete step

    if (nextIndex >= accountList.length) {
      setAllAccountsProcessed(true); // Mark all as processed
      setLoading(false); // Stop global loading only when truly finished
      message.success("所有账号均已处理完毕!");
    } else {
      setAllAccountsProcessed(false); // Ensure it's false if there are more accounts
      setAccountList((prev) =>
        prev.map((acc) =>
          acc.id === nextIndex
            ? { ...acc, status: "pending" }
            : acc
        )
      );
      handleStartNextAccount();
    }
  };

  const handleStartNextAccount = () => {
    if (processingIndex >= 0 && processingIndex < accountList.length) {
      // Reset states for the next account's steps
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
    const proxyUrl = form.getFieldValue("use_proxy")
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
        use_proxy: !!proxyUrl,
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
      // Then move to intermediate complete step
      moveToNextAccountOrComplete(); // Modified call
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
        // DO NOT call next() here, user clicks the button
        // 获取验证码
        setTimeout(() => {
          handleAutoFetchCode();
        }, 1000);
      } else {
        message.error(
          responseData.message || "验证失败，请确保已完成滑块验证后重试"
        );
        setIsCaptchaVerified(false);
        // Optionally move to next account on captcha failure?
        // setAccountList(prev => prev.map(acc => acc.id === currentAccount.id ? { ...acc, status: 'error', message: `验证码失败: ${responseData.message || '未知'}` } : acc));
        // moveToNextAccountOrComplete();
      }
    } catch (error: any) {
      // Added type annotation
      console.error(`[${currentAccount.account}] 验证码 API 调用失败:`, error);
      message.error(`验证码验证出错: ${error.message}`);
      setIsCaptchaVerified(false);
      // Optionally move to next account on captcha error?
      // setAccountList(prev => prev.map(acc => acc.id === currentAccount.id ? { ...acc, status: 'error', message: `验证码错误: ${error.message}` } : acc));
      // moveToNextAccountOrComplete();
    } finally {
      setCaptchaLoading(false);
      setCurrent(2);
    }
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
        throw new Error(responseData.message || "注册返回失败状态");
      }
      // --- 结束替换 ---
    } catch (error: any) {
      console.error(`[${currentAccount.account}] 注册失败:`, error);
      const errorMessage = error.message || "未知错误";
      message.error(`注册失败: ${errorMessage}`);
      // 更新状态和消息
      setAccountList((prev) =>
        prev.map((acc) =>
          acc.id === currentAccount.id
            ? { ...acc, status: "error", message: `注册失败: ${errorMessage}` }
            : acc
        )
      );
      // 移动到下一步或完成
      moveToNextAccountOrComplete();
      setLoading(false);
    } finally {
      setEmailVerifyLoading(false);
    }
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
    setErrorMsg(null); // 清除之前的错误信息
    try {
      const formData = new FormData();
      formData.append("email", currentAccount?.account || "");
      formData.append("password", currentAccount?.password || "");
      formData.append("token", currentAccount?.token || "");
      formData.append("client_id", currentAccount?.clientId || "");

      const response = await getEmailVerificationCode(formData);

      const result = response.data;

      if (result.status === "success" && result.verification_code) {
        form.setFieldsValue({ verification_code: result.verification_code });
        message.success(result.msg || "验证码已自动填入");

        // 验证邮箱
        setTimeout(() => {
          handleEmailVerification();
        }, 1000);
      } else {
        // 显示后端返回的更具体的错误信息
        message.error(
          result.msg || "未能获取验证码，请检查邮箱和密码或手动输入"
        );
        // 可以在这里设置错误状态供UI显示
        // setErrorMsg(result.msg || '未能获取验证码...');
      }
    } catch (error: any) {
      message.error(`获取验证码时出错: ${error.message}`);
      setErrorMsg(`获取验证码时出错: ${error.message}`);
      console.error("Auto fetch code error:", error);
    } finally {
      setAutoFetchLoading(false);
    }
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
      content: (
        <Row gutter={24}>
          <Col xs={24} md={12}>
            {" "}
            {/* 左侧表单 */}
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                accountInfo: "",
                use_proxy: false,
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
                label="账号信息 (每行一条)"
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
                  onChange={(checked) => setUseProxy(checked)}
                  disabled={loading}
                />
              </Form.Item>
              {useProxy && (
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
          <Col xs={24} md={12}>
            {" "}
            {/* 右侧状态/说明 */}
            <Card
              title={`处理状态 ${
                processingIndex >= 0
                  ? `(账号 ${processingIndex + 1} / ${accountList.length})`
                  : ""
              }`}
              style={{ height: "100%" }}
            >
              {processingIndex === -1 && accountList.length === 0 && (
                <div>
                  <p>请在左侧输入账号信息，每行一条，格式如下:</p>
                  <pre>
                    <code>账号----密码----clientId----授权令牌</code>
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
                <div style={{ maxHeight: "400px", overflowY: "auto" }}>
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
                          <Tag color="blue">处理中...</Tag>
                        )}
                        {acc.status === "initializing" && (
                          <Tag color="processing">初始化中...</Tag>
                        )}
                        {acc.status === "captcha_pending" && (
                          <Tag color="warning">待验证码</Tag>
                        )}
                        {acc.status === "email_pending" && (
                          <Tag color="warning">待邮箱验证</Tag>
                        )}
                        {acc.status === "success" && (
                          <Tag color="success">成功</Tag>
                        )}
                        {acc.status === "error" && (
                          <Tag color="error">失败</Tag>
                        )}
                      </div>
                      {acc.message && (
                        <div
                          style={{
                            marginTop: "5px",
                            fontSize: "12px",
                            color: acc.status === "error" ? "red" : "grey",
                          }}
                        >
                          信息: {acc.message}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </Col>
        </Row>
      ),
    },
    {
      title: "验证码",
      content: (
        <div style={{ textAlign: "center", padding: "20px" }}>
          <p style={{ marginBottom: "20px" }}>
            请为账号 <Tag>{getCurrentAccount()?.account || "N/A"}</Tag>{" "}
            完成滑块验证。
          </p>
          <Button
            type="primary"
            onClick={handleCaptchaVerification}
            loading={captchaLoading}
            disabled={isCaptchaVerified || captchaLoading}
          >
            {isCaptchaVerified ? "验证已完成" : "开始滑块验证"}
          </Button>
          {isCaptchaVerified && (
            <div
              style={{
                marginTop: "15px",
                color: "#52c41a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircleOutlined style={{ marginRight: "8px" }} />
              验证成功, 请点击"下一步"转到邮箱验证
            </div>
          )}
        </div>
      ),
    },
    {
      title: "邮箱验证",
      content: (
        <Form form={form} layout="vertical">
          <p>
            请输入为账号 <Tag>{getCurrentAccount()?.account || "N/A"}</Tag>{" "}
            收到的邮箱验证码。
          </p>
          {/* 可以选择显示错误信息 */}
          {errorMsg && (
            <Alert
              message={errorMsg}
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}
          <Form.Item
            label="验证码"
            name="verification_code"
            rules={[{ required: true, message: "请输入验证码" }]}
          >
            <Input
              placeholder="请输入收到的验证码"
              disabled={emailVerifyLoading}
            />
          </Form.Item>
          <Divider />
          {/* 修改按钮 */}
          <Button
            type="dashed"
            onClick={handleAutoFetchCode}
            loading={autoFetchLoading}
            disabled={autoFetchLoading}
          >
            自动获取验证码
          </Button>
        </Form>
      ),
    },
    {
      title: "完成",
      content: (
        <div>
          {processingIndex > 0 && accountList[processingIndex - 1] && (
            // Display result of the *last* processed account
            <Card size="small" style={{ marginBottom: "20px" }}>
              <p>
                账号 <strong>{accountList[processingIndex - 1].account}</strong>{" "}
                处理结果:
              </p>
              <div>
                <strong>状态:</strong>{" "}
                {accountList[processingIndex - 1].status === "success" && (
                  <Tag color="success">成功</Tag>
                )}
                {accountList[processingIndex - 1].status === "error" && (
                  <Tag color="error">失败</Tag>
                )}
                {/* Add other statuses if needed */}
              </div>
              {accountList[processingIndex - 1].message && (
                <div
                  style={{
                    marginTop: "5px",
                    fontSize: "12px",
                    color:
                      accountList[processingIndex - 1].status === "error"
                        ? "red"
                        : "grey",
                  }}
                >
                  信息: {accountList[processingIndex - 1].message}
                </div>
              )}
            </Card>
          )}

          {!allAccountsProcessed ? (
            <>
              <p>剩余待处理账号数量: {accountList.length - processingIndex}</p>
              <Button
                type="primary"
                onClick={handleStartNextAccount}
                disabled={loading}
                loading={loading}
              >
                开始处理下一个账号 ({processingIndex + 1} / {accountList.length}
                )
              </Button>
            </>
          ) : (
            <p>所有账号均已处理完毕。</p>
          )}

          <Divider />
          <Button
            onClick={() => {
              setCurrent(0);
              setAccountList([]);
              setProcessingIndex(-1);
              setAllAccountsProcessed(false);
              form.resetFields();
              setLoading(false);
            }}
          >
            清空并开始新批次
          </Button>
        </div>
      ),
    },
  ];

  const next = () => {
    if (current < steps.length - 1) {
      setCurrent(current + 1);
    }
  };

  const prev = () => {
    if (current > 0) {
      setCurrent(current - 1);
      if (current === 2) setIsCaptchaVerified(false);
    }
  };

  const handleMainButtonClick = async () => {
    if (current === 0) {
      await startProcessing();
    } else if (current === 1) {
      if (isCaptchaVerified) {
        next(); // Move to current=2 (Email Verification step)
      } else {
        console.log("请先完成滑块验证！");
        message.warning("请先完成滑块验证！");
      }
    } else if (current === 2) {
      // Trigger email verification, which on completion will move to step 3
      await handleEmailVerification();
    }
  };

  let mainButtonText = "开始处理";
  let mainButtonLoading = loading;
  let mainButtonDisabled = false;

  if (current === 0) {
    mainButtonText = "开始处理";
    mainButtonDisabled = loading || processingIndex !== -1; // Disable if already processing
  } else if (current === 1) {
    mainButtonText = "下一步 (邮箱验证)"; // Clarify destination
    mainButtonLoading = captchaLoading;
    mainButtonDisabled = !isCaptchaVerified || captchaLoading; // Removed global loading check
  } else if (current === 2) {
    mainButtonText = "验证邮箱"; // Changed text
    mainButtonLoading = emailVerifyLoading;
    mainButtonDisabled = form.getFieldValue("verification_code") === "";
  } else if (current === 3) {
    // No main button needed here anymore, handled within step content
    mainButtonText = "完成"; // Placeholder, button will be hidden
    mainButtonDisabled = true;
  }

  return (
    <div className="register-container">
      <Card title="PikPak 账号注册" bordered={false} className="register-card">
        <Steps current={current}>
          {steps.map((item) => (
            <Step
              key={item.title}
              title={item.title}
              status={
                current === 3 && allAccountsProcessed && item.title === "完成"
                  ? "finish"
                  : undefined
              }
            />
          ))}
        </Steps>
        <div className="steps-content" key={`${processingIndex}-${current}`}>
          {steps[current].content}
        </div>{" "}
        {/* Add current to key */}
        <div className="steps-action">
          {current > 0 && current < 3 && !loading && (
            <Button
              style={{ margin: "0 8px" }}
              onClick={() => prev()}
              disabled={captchaLoading || emailVerifyLoading}
            >
              上一步
            </Button>
          )}
          {current < 3 && (
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
    </div>
  );
};

export default Register;
