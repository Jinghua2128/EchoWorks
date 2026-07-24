# Firebase 与 GitHub Pages 设置指南

English guide: [FIREBASE_GITHUB_PAGES.md](FIREBASE_GITHUB_PAGES.md)

本项目使用 GitHub Pages 发布网站，并使用 Firebase Authentication 与 Cloud Firestore 保存用户数据。所有情景内容继续保存在本地 JSON 文件中，不写入 Firestore。

## 已完成的内容

- GitHub Pages 工作流：.github/workflows/pages.yml
- Firebase 项目：echoworks-e3b4d
- Firestore 规则：firestore.rules
- Firestore 索引：firestore.indexes.json
- 可公开的网页配置：firebase-config.js
- 示例数据预览：sample-data/firestore-dashboard-sample.json
- 受保护的数据写入工具：scripts/seed-firestore.mjs

示例数据包含 12 位虚构学习者，以及完成路线、未完成路线、A/B/C 选择、CARE/REAL 分数、重玩记录、反思答案和学习进步。所有邮箱使用保留域名 echoworks.invalid，不是真实的 Firebase Authentication 用户。

## 重要安全说明

firebase-config.js 是网页端公开配置，可以随网站发布。真正的数据保护来自 Firebase Authentication、Firestore 安全规则、API 限制和授权域名。

服务账号 JSON 文件完全不同。它是会绕过 Firestore 规则的管理员私钥。不要把它提交到 GitHub、放进 public 文件夹、上传到网站或发送到聊天。项目的 .gitignore 已忽略常见私钥文件名，但最安全的做法仍然是把它保存在项目文件夹之外。

## 1. 准备 Firebase

在 echoworks-e3b4d 的 Firebase 控制台中：

1. 打开 Authentication > Sign-in method。
2. 启用 Email/Password。
3. 创建或使用管理员账号 liuguangxuan1230@gmail.com 登录。
4. 打开 Project settings > Service accounts。
5. 点击 Generate new private key。
6. 把下载的文件保存在项目之外，例如 D:\FirebaseSecrets\echoworks-admin.json。

此私钥只用于受信任的本机管理。完成设置后，如不再需要，应在 Google Cloud IAM 中撤销该密钥。

## 2. 安装并检查项目

打开 PowerShell：

~~~powershell
Set-Location 'D:\Program Files\EchoWorks\echowrks_vn'
npm ci
npm run verify
npm run test:rules
npm run sample:export
npm run sample:seed
~~~

sample:seed 默认只进行预演。它会显示预计写入的数量，但不会连接或修改 Firestore。

正式写入前，请先检查 sample-data/firestore-dashboard-sample.json。

## 3. 写入仪表板示例数据

只在当前 PowerShell 窗口中设置私钥路径：

~~~powershell
$env:GOOGLE_APPLICATION_CREDENTIALS='D:\FirebaseSecrets\echoworks-admin.json'
npm run sample:seed -- --write --project=echoworks-e3b4d --confirm-project=echoworks-e3b4d
~~~

此命令会写入：

- dashboardAdminEmails/liuguangxuan1230@gmail.com，角色为受保护的 owner
- 12 个 users 文档
- 61 个 scenarioResults 文档
- 41 个 scenarioReflections 文档
- 53 个 users/{uid}/scenarioProgress 文档

每条虚构学习记录都包含 seedNamespace = echoworks-dashboard-demo-v1 和 isSampleData = true。重复执行不会产生重复数据，而是覆盖同一批固定 ID 的示例文档。

管理员 owner 文档属于真实访问设置，因此清理命令会保留它。

只删除虚构学习者数据：

~~~powershell
npm run sample:cleanup -- --write --project=echoworks-e3b4d --confirm-project=echoworks-e3b4d
~~~

## 4. 不使用 Firebase 网页登录也能部署规则和索引

Firebase CLI 可以读取同一个 Application Default Credential，因此不需要完成失败的浏览器登录：

~~~powershell
$env:GOOGLE_APPLICATION_CREDENTIALS='D:\FirebaseSecrets\echoworks-admin.json'
firebase deploy --only firestore --project echoworks-e3b4d
~~~

如果出现 IAM 权限不足，请使用项目拥有者的凭据，或给该服务账号分配部署 Firestore 规则和索引所需的权限。

控制台备用方式：

1. 打开 Firestore Database > Rules。
2. 把本地 firestore.rules 的完整内容放入编辑器并发布。
3. 打开 Firestore Database > Indexes。
4. 根据 firestore.indexes.json 创建四个 Collection 索引：
   - frameworkId 升序，updatedAt 降序
   - frameworkId 升序，scenarioId 升序，updatedAt 降序
   - frameworkId 升序，selectedRole 升序，updatedAt 降序
   - frameworkId 升序，scenarioId 升序，selectedRole 升序，updatedAt 降序
5. 等待所有索引状态变为 Enabled。

请把本地规则和索引文件作为唯一标准。以后使用 CLI 部署时，会覆盖控制台中的规则。

## 5. 发布到 GitHub Pages

1. 把项目推送到 GitHub，并把正式版本推送或合并到 main。
2. 打开仓库的 Settings > Pages。
3. 在 Build and deployment 中把 Source 设为 GitHub Actions。
4. 打开 Actions，等待 Deploy GitHub Pages 成功完成。
5. 使用工作流显示的正式网址。

工作流会检查代码与 Firestore 规则，生成只含运行文件的 public 文件夹，然后发布。scripts、sample-data、服务账号私钥和测试文件不会被发布。

## 6. 添加 GitHub Pages 授权域名

在 Firebase 控制台打开 Authentication > Settings > Authorized domains，只加入主机名，例如：

~~~text
your-github-name.github.io
~~~

不要加入 https://，也不要加入仓库路径。以后若使用自定义域名，也要把该域名加入这里。

## 7. 检查仪表板

1. 用 HTTPS 打开已发布的网站。
2. 使用 liuguangxuan1230@gmail.com 登录。
3. 规则或 owner 文档更新后，先退出再登录一次，让 Firebase 刷新会话。
4. 主导航应显示 Dashboard。
5. 打开 admin.html，检查总分、A/B/C 分布、流失情景、学习者详情和反思答案。
6. 在 Firestore 中确认 owner 文档 ID 完全是小写邮箱地址。

如果仍显示无权限，请按顺序检查：

- 当前登录邮箱是否完全等于 liuguangxuan1230@gmail.com。
- dashboardAdminEmails/liuguangxuan1230@gmail.com 是否存在，并且 role 为 owner。
- 最新 firestore.rules 是否已发布到 echoworks-e3b4d。
- GitHub Pages 主机名是否已加入 Authentication 授权域名。
- 页面是否通过 HTTPS 打开，而不是 file://。
- 退出账号，强制刷新，再重新登录。

## 发布前检查

~~~powershell
npm run verify
npm run test:rules
npm run build
~~~

最后，用一个临时普通用户确认只能查看自己的记录；确认 owner 可以查看仪表板；确认 owner 添加的 viewer 只能查看、不能管理其他 viewer；并确认示例数据清理命令只删除虚构学习者。
