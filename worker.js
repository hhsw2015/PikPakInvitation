addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  // 获取请求的 URL
  const url = new URL(request.url);

  // 根据路径决定目标主机
  let targetHost = 'api.kiteyuan.info'; // 默认目标主机
  if (url.pathname === '/infoInject') {
    targetHost = 'inject.kiteyuan.info';
  }

  // 将请求的目标主机替换为目标主机
  url.hostname = targetHost;
  url.protocol = 'https:';

  // 创建新的请求，保留原始请求的 headers、method 和 body
  const newRequest = new Request(url.toString(), request);

  // 发送请求到目标服务器
  const response = await fetch(newRequest);

  // 返回响应给客户端
  return response;
}
