# EchoWorks 项目交接文档

更新日期：2026-07-29（Asia/Singapore）

English handoff: [HANDOFF.md](HANDOFF.md)

## 开始前必须阅读

- 这是一个用于 GitHub Pages，并可选择使用 Firebase Hosting 的静态 HTML、CSS、JavaScript 应用。
- 每次继续开发前，必须先阅读 HANDOFF.md。
- 用户说 handoff 时，结束任务前必须更新英文和中文交接文档。
- 用户可见的网站修改完成后，除非用户明确要求只保留本地版本，否则必须运行发布检查和构建、提交并推送到 `main`、等待 GitHub Pages 发布完成，并提供正式网站链接。
- 不要重置或覆盖用户已有的工作树修改。
- 情景、问卷、评分和 AR 内容保存在本地 JSON；Firebase 只保存账号、仪表板权限、学习进度、尝试、分数、反思和时间。
- 经理路线使用 REAL；员工路线使用 CARE。
- 第一次尝试是正式评估，后续尝试只显示学习进步。
- 选择反应时间只用于参与度分析，不能加入能力分数。
- 不要翻转视觉小说角色图片，并保留约 5px 的视觉边距。
- AR 相机不可用时，必须保留手动选卡备用方式。
- 未实际测试前，不要声称已完成 Firebase 正式部署、真实邮件流程、Firefox/Safari 测试或实体卡片识别。

## 当前状态

生产审计和最近的视觉小说布局修改已在本地实现。

### 学习者界面版本（2026-07-28）

- 主页进度区现在直接使用 Your progress 标题，并删除重复的 learning path、next action、randomized case 和 quick tools 文案；时长显示为 5 min / scenario，八个情景未全部完成前状态为 Not Done。
- Continue learning 会先检查 pre-pulse：没有任何 pre-pulse 答案时进入 pre-pulse；已有至少一次回答时继续原有 scenario 路线。
- 手机和平板页头仅保留主页红十字图标，并新增红色 AR 图标快捷按钮；菜单改名为 Quick Access，加入 Scenario 入口，并在滚动时保持置顶。
- 首次游客和首次登录账号会看到两步、可用键盘操作的导航教程；完成状态按游客/账号保存到 feedbackPlaybook.tutorialSeen.v1.*。
- AR 页面保留相机与手动选卡，删除重复的动态详情区，重试按钮改为仅图标方形按钮；Facilitator flow 和 Workshop materials 改为默认折叠的原生下拉区。
- Settings 的 Danger zone 使用更清晰的红色浅底。
- 当前学习者页面的 app.css 与 app.js 缓存版本号为 20260729-clean-assets。

### 资源清理与统一 AR 角色模型（2026-07-29）

- 前一次清理共移除 40 个已淘汰文件（13.96 MB），包括重复角色帧、旧 AR 原型、无损办公室源图、过期情景数据和未使用的设计参考。
- AR 现在为每个框架字母提供一张专属姿势，统一存放在 `assets/ar-models`：`real-r`、`real-e`、`real-a`、`real-l`、`care-c`、`care-a`、`care-r`、`care-e`。
- 四张 REAL 图直接以 `assets/characters/manager-lowpoly-idle.webp` 为基准生成；四张 CARE 图直接以 `assets/characters/sarah-lowpoly-idle.webp` 为基准生成。原有脸部结构、闭眼黑条、身体比例、服装、配色、多边形切面、光照、正面镜头和画布全部锁定，只改变每张卡对应的身体姿势。
- 八张 AR 角色图都是透明的 `1024x1536` WebP（每张约 59-70 KB）。实物卡图和 MindAR 识别目标包没有更改。
- 情景页仍使用 `assets/characters` 中原有的 12 张静止/说话帧；本次只重做 AR，不修改视觉小说的角色呈现或由语音驱动的口型时序。
- `assets/data/ar-cards.json` 将每张卡直接映射到 `assets/ar-models/<card-id>-lowpoly.webp`；AR 缓存版本为 `20260729-base-locked-ar-poses`。
- `scripts/build-public.mjs` 现在发布 73 个白名单运行文件；生产包大小为 20.60 MB，并继续排除源文件和参考文档。
### 情景语音版本（2026-07-28）

- 情景旁白和角色对白现在会在学习者首次点击、触摸或键盘操作后，通过浏览器 Web Speech API 播放。
- 旁白、经理、员工和教练分别使用不同的语速、音高、音量和英文声音偏好；找不到偏好声音时，浏览器会使用可用的英文或默认声音。
- 原有声音按钮现在统一控制全部情景音频，并继续保存到 `feedbackPlaybook.dialogueSound`。静音会立即停止正在播放的语音；重新开启会朗读当前对白。
- 场景切换、重新开始、隐藏标签页或离开页面时都会先取消当前语音，避免对白重叠。完整的方括号舞台指示继续隐藏；方括号标记和所有圆括号表演提示会同时从屏幕对白与朗读内容中移除。
- 不需要生成音频文件或接入外部语音服务。浏览器不支持语音合成时，只要 Web Audio 可用，原有提示音和打字音仍会正常工作。
- 打字时会在第一个和之后每三个可见字符播放一次清晰但克制的点击声；空格不再造成不规律的静音间隔。静音情景音频后，新点击声会立即停止。
- 角色说话姿势现在由语音的开始和结束事件控制，而不是由文字打字时长控制。语音结束、出错、静音、切换场景或离开页面时都会恢复静止姿势。
- 情景脚本缓存版本号为 `20260728-audio-sync`。

npm run build 会把可发布内容生成到已忽略的 public 文件夹。

主要页面：

- index.html：学习者主页、登录、问卷、AR、设置和进度。
- scenario.html：正式视觉小说页面。
- test3.html：旧链接重定向页面。
- admin.html：受保护的管理仪表板；入口不能放在 Settings 中。
- privacy.html：隐私和数据处理说明。

当前本地生产预览使用 http://127.0.0.1:4176/。重新构建前，如果 Windows 锁定 public 文件夹，应先停止旧的静态服务器。

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

固定示例包已于 2026-07-24 写入正式 Firestore 项目 `echoworks-e3b4d`，包含：

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

规则和索引已于 2026-07-24 成功部署到正式项目。示例数据也已上传，并逐一验证了 168 份预期文档：1 份 owner 权限文档和 167 份固定示例文档。

GitHub Pages 已上线：`https://jinghua2128.github.io/EchoWorks/`。主页和 `admin.html` 已于 2026-07-24 确认返回 HTTP 200。Firebase Authentication 已启用邮箱/密码登录，并已授权 `jinghua2128.github.io`。`liuguangxuan1230@gmail.com` 的 Authentication 账号处于启用状态，同时拥有 `dashboardAdminEmails` owner 权限文档。

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

## 对话与 AR 约束

- 对话框与原有按钮共用同一套受保护的推进逻辑；保留点击/触摸、Enter/Space、文字选择保护、内部控件保护和 260ms 输入冷却。
- 保留屏幕滑动转场、清晰但克制的打字点击声、静音设置和减少动态效果支持。
- 浏览器语音会在用户操作后朗读可见情景对白；有可用声音时按旁白、经理、员工和教练使用不同配置，并在下一场景开始前取消上一句。
- 屏幕对白和朗读对白都不能显示方括号或圆括号标记。完整舞台指示保持隐藏；行内方括号中的正文会保留文字但移除括号，圆括号表演提示会完整移除。
- `feedbackPlaybook.dialogueSound` 同时控制语音、提示音和打字音；此实现不提交生成语音文件，浏览器语音不可用时保留原有音效作为降级方案。
- 当前情景角色使用 12 张轻量预渲染低多边形帧：每个角色各有 3 组对齐的静止/说话姿势。资源路径统一配置在 `assets/characters/character-models.js`，说话者、情绪、语气和轮次姿势选择位于 `assets/js/novel.js`。这不是实时 Three.js 角色系统。
- 不要翻转角色图片；相机识别不可用时继续提供 AR 手动选卡。
- 每个情景使用 `assets/scenes` 中的地点背景（会议室、绩效面谈办公室、走廊或规划工作区）；教练反馈可切换为原有 success/tense/mentor 背景，同时保留屏幕滑动转场。
- assets/ar-targets/echoworks-cards.mind 仍是可识别全部八张 CARE/REAL 实体卡的本地 MindAR 目标包。实体卡源图保留在 `assets/ar-cards`；AR 叠加图使用 `assets/ar-models` 中身份统一、按卡片区分的专属姿势。`assets/characters` 中的情景角色系统必须保持独立且不受本次修改影响。
- 目标索引固定为 REAL_R、REAL_E、REAL_A、REAL_L、CARE_C、CARE_A、CARE_R、CARE_E，对应索引 0 到 7；修改卡图或顺序后必须重新编译整个目标包。

## 已通过测试

- npm run check：通过。
- npm test：14/14 通过。
- npm run test:rules：5/5 Firestore 模拟器套件通过。
- npm run test:browser：Chrome 与 Edge 通过，包括首次教程、pre-pulse 前置路由、AR 下拉区、手机置顶页头、对话框点击/触摸、文字选择保护、键盘操作、输入冷却，以及固定语音引擎下的朗读、静音、取消、角色声音配置和真实打字动画音效检查。
- 新增浏览器验证：AR 会为每张卡加载对应的专属低多边形姿势；角色口型在文字完成后仍随语音继续，并在语音结束时恢复静止；可见对白和朗读对白均不含方括号或圆括号。
- app、scenario、dashboard 的 Axe serious/critical 问题：0。
- 320px、390px、横屏、768px、1024px、1440px 和等效高倍缩放检查通过。
- 生产构建包含 73 个精确列出的运行文件（20.60 MB）；其中包括 12 张情景角色帧、8 张专属透明 AR 模型姿势、4 张地点背景、8 张实体卡和一个 2.44 MB MindAR v2 目标包。
- 示例数据导出、dry run 和 168 份正式文档逐一检查通过。
- 生产构建只包含白名单运行文件。

## 尚未完成的外部验证

- 需要使用临时真实账号测试验证邮件、密码重设、跨设备合并、云端删除和 owner/viewer 权限。
- Windows 环境没有完成 Firefox 和 Safari 测试。
- 实际声音音色和口音取决于浏览器及操作系统已安装的语音。自动化测试已验证朗读路由、角色配置、静音和取消，但不能判断真实设备上的声音质量或音量。
- 仍需在真实 Android/iOS 设备上通过 HTTPS 测试全部 8 张实体 AR 卡；自动测试只验证目标包和手动预览，不代表真实相机识别已经验证。
- 旧 Firestore 记录可能仍含内嵌 reflectionAnswers，需要 owner 后续迁移。

## 下一步

1. 在正式网站使用 `liuguangxuan1230@gmail.com` 登录；如果登录状态早于权限更新，刷新一次，然后检查 Dashboard 导航、指标、反思详情和 viewer 管理。
2. 使用临时真实账号完成验证邮件、密码重设、跨设备合并、云端删除和 owner/viewer 权限测试。
3. 完成 Firefox、Safari、键盘、高倍缩放和全部 8 张实体手机 AR 卡测试。
4. 下次提交前检查现有的 `.firebaserc`、`firebase.json` 和交接文档修改，不要直接重置。
