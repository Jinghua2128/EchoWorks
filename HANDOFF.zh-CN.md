# EchoWorks 项目交接文档

更新日期：2026-07-24（Asia/Singapore）

English handoff: [HANDOFF.md](HANDOFF.md)

## 开始前必须阅读

- 这是一个用于 GitHub Pages，并可选择使用 Firebase Hosting 的静态 HTML、CSS、JavaScript 应用。
- 每次继续开发前，必须先阅读 HANDOFF.md。
- 用户说 handoff 时，结束任务前必须更新英文和中文交接文档。
- 不要重置或覆盖用户已有的工作树修改。
- 情景、问卷、评分和 AR 内容保存在本地 JSON；Firebase 只保存账号、仪表板权限、学习进度、尝试、分数、反思和时间。
- 经理路线使用 REAL；员工路线使用 CARE。
- 第一次尝试是正式评估，后续尝试只显示学习进步。
- 选择反应时间只用于参与度分析，不能加入能力分数。
- 不要翻转视觉小说角色图片，并保留约 5px 的视觉边距。
- AR 相机不可用时，必须保留手动选卡备用方式。
- 未实际测试前，不要声称已完成 Firebase 正式部署、真实邮件流程、Firefox/Safari 测试或实体卡片识别。

## 当前状态

生产审计和最近的视觉小说布局修改已在本地实现。npm run build 会把可发布内容生成到已忽略的 public 文件夹。

主要页面：

- index.html：学习者主页、登录、问卷、AR、设置和进度。
- scenario.html：正式视觉小说页面。
- test3.html：旧链接重定向页面。
- admin.html：受保护的管理仪表板；入口不能放在 Settings 中。
- privacy.html：隐私和数据处理说明。

当前最终本地预览曾运行于 http://127.0.0.1:4177/。重新构建前，如果 Windows 锁定 public 文件夹，应先停止旧的静态服务器。

## 关键架构

- assets/js/firebase-client.js：Firebase、Auth、延迟加载 Firestore、邮箱标准化和管理员角色。
- assets/js/progress-store.js：本地/云端合并、尝试次数、保存、重试和完成状态。
- assets/js/scenario-engine.js：情景验证和 A/B/C 评分。
- assets/css/tokens.css：共享颜色、字体、圆角、焦点和动画变量。
- scripts/build-public.mjs：白名单式生产构建，不会发布开发脚本或样本数据。
- .github/workflows/pages.yml：GitHub Pages 自动测试、构建和发布。
- firestore.rules：学习者、viewer、owner 的最小权限规则。
- firestore.indexes.json：仪表板查询索引。
- FIREBASE_GITHUB_PAGES.md：英文 Firebase 与 GitHub Pages 操作指南。
- FIREBASE_GITHUB_PAGES.zh-CN.md：中文 Firebase 与 GitHub Pages 操作指南。

## 数据保存

- 游客进度只保存在当前设备。
- 登录用户的本地记录会与 Firestore 记录按用户、情景、尝试和时间合并。
- 离线或同步失败的记录不会丢失，并保留重试状态。
- 只有云端保存确认成功后，页面才显示已保存到训练记录。
- 反思正文单独保存在 scenarioReflections；仪表板列表只读取是否完成，打开学习者详情时才加载正文。
- 删除登录用户进度时，会删除其 scenarioProgress、scenarioResults、scenarioReflections，并清除 profile 中的问卷、角色和匿名 ID。
- 云端删除失败时不会先清除本地数据。

## 仪表板权限

唯一受保护 owner 邮箱：

liuguangxuan1230@gmail.com

权限集合：

dashboardAdminEmails/{标准化小写邮箱}

角色：

- owner：查看全部仪表板数据，并添加或删除只读 viewer。
- viewer：只能查看仪表板，不能改学习者数据或 viewer 名单。
- learner：只能读取和写入自己的规则允许数据。

只有登录邮箱在 dashboardAdminEmails 中拥有有效 owner/viewer 文档时，主导航才显示 Dashboard。owner 文档不能被删除或降级。

## 示例数据

已实现但尚未写入正式 Firestore 的固定示例包包含：

- 12 位虚构学习者
- 61 次情景尝试
- 57 次完成和 4 次中途退出
- 8 次重玩
- 41 份反思
- 53 条每个用户/情景的最新进度
- CARE、REAL、两条路线完成、A/B/C 分布和第一次/最新尝试进步

相关文件：

- scripts/dashboard-sample-data.mjs：唯一数据生成源。
- scripts/seed-firestore.mjs：默认预演、明确确认后才写入，并支持清理。
- sample-data/firestore-dashboard-sample.json：可检查的完整预览。
- tests/dashboard-sample-data.test.mjs：评分和数据状态测试。

所有虚构数据都有 seedNamespace = echoworks-dashboard-demo-v1 和 isSampleData = true，并使用不可投递的 echoworks.invalid 邮箱。虚构用户没有 Firebase Authentication 账号。

写入命令需要私密服务账号文件，并要求两次确认项目 ID：

~~~powershell
$env:GOOGLE_APPLICATION_CREDENTIALS='D:\FirebaseSecrets\echoworks-admin.json'
npm run sample:seed -- --write --project=echoworks-e3b4d --confirm-project=echoworks-e3b4d
~~~

清理只删除固定虚构学习者数据，并保留 owner 权限文档：

~~~powershell
npm run sample:cleanup -- --write --project=echoworks-e3b4d --confirm-project=echoworks-e3b4d
~~~

服务账号 JSON 是管理员私钥，绝对不能提交到 GitHub、放入 public 或通过聊天发送。网页端 firebase-config.js 是公开配置，不是私钥。

## Firestore 与 GitHub Pages

Firebase 项目 ID：echoworks-e3b4d。

Firebase CLI 浏览器登录失败时，可以使用同一个 Application Default Credential：

~~~powershell
$env:GOOGLE_APPLICATION_CREDENTIALS='D:\FirebaseSecrets\echoworks-admin.json'
firebase deploy --only firestore --project echoworks-e3b4d
~~~

规则和索引的本地测试已经通过，但尚未从本任务部署到正式项目。示例数据也尚未上传。

GitHub Pages：

1. 把已检查的版本推送或合并到 main。
2. 在 GitHub 仓库 Settings > Pages 中选择 GitHub Actions。
3. 等待 Deploy GitHub Pages 工作流成功。
4. 在 Firebase Authentication > Settings > Authorized domains 加入 GitHub Pages 主机名。
5. 以 owner 邮箱登录正式 HTTPS 网站，退出并重新登录一次，然后检查 Dashboard 导航和 admin.html。

完整步骤请阅读 FIREBASE_GITHUB_PAGES.zh-CN.md。

## 确认评分

2 = strong，1 = partial/risky，0 = missed。

| 路线 | 情景 / 维度 | A | B | C |
| --- | --- | ---: | ---: | ---: |
| Manager REAL | Recognise - The Late Arrival | 2 | 0 | 1 |
| Manager REAL | Evaluate - The Uneven Scale | 0 | 2 | 0 |
| Manager REAL | Advise - The Quiet One | 0 | 2 | 2 |
| Manager REAL | Link - The Star Who Stopped Caring | 0 | 2 | 0 |
| Employee CARE | Compose - The Ambush | 0 | 2 | 1 |
| Employee CARE | Analyze - The Rating That Stings | 2 | 0 | 0 |
| Employee CARE | Resolve - What Did That Mean? | 0 | 2 | 1 |
| Employee CARE | Execute - Three Weeks. One Goal. | 0 | 2 | 0 |

The Quiet One 的 B 和 C 都是 strong。管理者维度统一写作 Advise，不能写 Advice。

路线分数 = 总得分 / 8 × 100。

Pulse survey 与游戏能力维度必须分开报告，除非以后确认正式的对齐模型。

## 已通过测试

- npm run check：通过。
- npm test：11/11 通过。
- npm run test:rules：5/5 Firestore 模拟器套件通过。
- npm run test:browser：Chrome 与 Edge 通过。
- app、scenario、dashboard 的 Axe serious/critical 问题：0。
- 320px、390px、横屏、768px、1024px、1440px 和等效高倍缩放检查通过。
- 示例数据导出和 dry run 通过。
- 生产构建只包含白名单运行文件。

## 尚未完成的外部验证

- 正式 Firestore 规则和索引尚未部署。
- 示例数据尚未写入正式 Firestore。
- 需要使用临时真实账号测试验证邮件、密码重设、跨设备合并、云端删除和 owner/viewer 权限。
- Windows 环境没有完成 Firefox 和 Safari 测试。
- 需要在真实 Android/iOS 设备上通过 HTTPS 测试实体 AR 卡。
- 旧 Firestore 记录可能仍含内嵌 reflectionAnswers，需要 owner 后续迁移。

## 下一步

1. 阅读 FIREBASE_GITHUB_PAGES.zh-CN.md。
2. 在 D: 的项目目录外保存新生成的服务账号私钥。
3. 使用该凭据部署 Firestore 规则与索引。
4. 执行示例数据写入命令并以 owner 登录检查仪表板。
5. 检查工作树后推送到 main，并启用 GitHub Actions Pages。
6. 添加 Firebase 授权域名并完成临时真实账号测试。
7. 完成 Firefox、Safari 和实体手机 AR 卡测试。
8. 把所有确认后的修改作为一次明确的发布提交。
