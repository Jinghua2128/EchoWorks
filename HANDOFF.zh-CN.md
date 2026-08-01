# EchoWorks 项目交接文档

更新日期：2026-08-01（Asia/Singapore）

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
- Continue learning 现在要求先完整完成至少一份角色对应的 pre-pulse，才会进入情景角色选择；只回答部分题目不会解锁角色，再次进入时会从第一道未回答题目继续。
- 手机和平板页头仅保留主页红十字图标，并新增红色 AR 图标快捷按钮；菜单改名为 Quick Access，加入 Scenario 入口，并在滚动时保持置顶。
- 首次游客和首次登录账号会看到两步、可用键盘操作的导航教程；完成状态按游客/账号保存到 feedbackPlaybook.tutorialSeen.v1.*。
- AR 页面保留相机与手动选卡，删除重复的动态详情区，重试按钮改为仅图标方形按钮；Facilitator flow 和 Workshop materials 改为默认折叠的原生下拉区。
- Settings 的 Danger zone 使用更清晰的红色浅底。
- 当前学习者页面的 app.css 与 app.js 缓存版本号为 `20260801-learning-gates`。

### 仪表板与角色问卷版本（2026-07-30）

- 仪表板顶部新增可快速浏览的 Feedback culture overview，并保留现有红、白、青绿和中性色，不更换品牌配色。概览会显示员工、经理和情景练习中表现最好与最需关注的领域，以及 Employee CARE、Manager REAL、情景应用和参与度摘要。
- 点击 Employee 或 Manager 问卷卡可查看 pre/post 维度对比。Learner progress 与 CARE / REAL result records 默认使用原生折叠区，桌面和手机都先显示重点信息。
- `assets/data/pulse-surveys.json` 现在包含四份独立问卷：Employee pre、Employee post、Manager pre、Manager post。每份有 6 道 1-5 分题目，共保存 24 个回答。
- Employee 维度为 Calm（2 题）、Clarity、Reflection、Execution、Overall satisfaction；Manager 维度为 Recognise、Evaluate、Advise、Link、Confidence、Overall satisfaction。
- 主页进度分别计算 12 道 pre-pulse 和 12 道 post-pulse。只有完整完成至少一份 Employee 或 Manager pre-pulse 后，才能开始对应的情景练习。
- 本地固定样本生成器和 JSON 预览已改用新的 24 回答结构。2026-07-24 已写入 Firestore 的旧样本仍是旧问卷结构；只有 owner 明确重新运行样本写入命令后，正式样本才会更新。
- 仪表板缓存版本为 `20260730-culture-overview`；学习者问卷数据缓存版本为 `20260730-role-pulse`。
### 按角色解锁的学习流程（2026-08-01）

- Employee 与 Manager 是两条独立学习路线。Employee Pre-Pulse 只解锁 Employee CARE 角色；Manager Pre-Pulse 只解锁 Manager REAL 角色。
- 被锁定的角色卡仍可点击，并会直接打开对应的 pre-pulse。完成问卷后会播放原有完成转场，返回 `scenario.html`，提示该路线已解锁，然后由学习者自行选择角色。
- 至少完成一个 Employee 情景后才会解锁 Employee Post-Pulse；至少完成一个 Manager 情景后才会解锁 Manager Post-Pulse。完成一条路线不会解锁另一条路线的 post-pulse。
- `assets/js/app.js` 负责 post-pulse 权限、问卷直达链接与 Continue learning；`assets/js/novel.js` 负责情景页直达保护，并在最终判断角色权限前，从学习者的 Firestore profile 恢复已登录账号的问卷答案。
- 游客使用相同流程，但进度只保存在本机。未完成的 pre-pulse 不会解锁角色，并会从第一道未回答题目继续。
- 发布验证已通过 16 项自动化测试和完整 Playwright 浏览器测试，覆盖 8 种响应式/缩放视口；axe 未发现 serious 或 critical 问题，浏览器控制台也没有错误。
### 资源清理与统一 AR 角色模型（2026-07-29）

- 前一次清理共移除 40 个已淘汰文件（13.96 MB），包括重复角色帧、旧 AR 原型、无损办公室源图、过期情景数据和未使用的设计参考。
- AR 现在为每个框架字母提供一张专属姿势，统一存放在 `assets/ar-models`：`real-r`、`real-e`、`real-a`、`real-l`、`care-c`、`care-a`、`care-r`、`care-e`。
- 四张 REAL 图直接以 `assets/characters/manager-lowpoly-idle.webp` 为基准生成；四张 CARE 图直接以 `assets/characters/sarah-lowpoly-idle.webp` 为基准生成。原有脸部结构、闭眼黑条、身体比例、服装、配色、多边形切面、光照、正面镜头和画布全部锁定，只改变每张卡对应的身体姿势。
- 八张 AR 角色图都是透明的 `1024x1536` WebP（每张约 59-70 KB）。实物卡图和 MindAR 识别目标包没有更改。
- 情景页使用四张已确认的经理/Sarah 静止与说话 WebP，并为每个角色增加一张透明四帧说话 GIF。GIF 保持已确认的低多边形角色身份，并加入短暂的张掌手势；所有语义姿势仍复用同一组身份锁定资源。
- `assets/data/ar-cards.json` 将每张卡直接映射到 `assets/ar-models/<card-id>-lowpoly.webp`；AR 缓存版本为 `20260729-base-locked-ar-poses`。
- `scripts/build-public.mjs` 现在发布 67 个白名单运行文件；生产包大小为 20.24 MB，并继续排除源文件、参考文档和被否决的生成式姿势。
### 情景语音版本（2026-07-29）

- 情景旁白和角色对白现在会在学习者首次点击、触摸或键盘操作后，通过浏览器 Web Speech API 播放。
- 旁白、经理、员工和教练分别使用不同的语速、音高、音量和英文声音偏好；找不到偏好声音时，浏览器会使用可用的英文或默认声音。
- 原有声音按钮现在统一控制全部情景音频，并继续保存到 `feedbackPlaybook.dialogueSound`。静音会立即停止正在播放的语音；重新开启会朗读当前对白。
- 场景切换、重新开始、隐藏标签页或离开页面时都会先取消当前语音，避免对白重叠。完整的方括号舞台指示继续隐藏；方括号标记和所有圆括号表演提示会同时从屏幕对白与朗读内容中移除。
- 不需要生成音频文件或接入外部语音服务。浏览器不支持语音合成时，只要 Web Audio 可用，原有提示音和打字音仍会正常工作。
- 打字时会在第一个和之后每三个可见字符播放一次清晰但克制的点击声；空格不再造成不规律的静音间隔。静音情景音频后，新点击声会立即停止。
- 旧的计时器、CSS 关键帧、`requestAnimationFrame` 和 Web Animations 说话实现均已移除。`assets/js/novel.js` 只保留一个控制器：在浏览器语音播放期间把当前角色切换为透明四帧 GIF，并在语音结束、出错、静音、切换场景、重玩或离开页面时恢复静止图。每张 GIF 循环播放说话、张掌手势、说话、静止四帧；减少动态效果模式使用静态说话 WebP。
- 屏幕宽度超过 920px 时，两名角色会使用 72-140px 响应式内缩，让笔记本和桌面视图中的对话距离更自然；平板与手机位置不变。
- 情景脚本与视觉 CSS 缓存版本号为 `20260801-learning-gates`。所有语义姿势状态使用该角色已确认的静止、说话和动态说话资源。

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

只有登录邮箱在 dashboardAdminEmails 中拥有有效 owner/viewer 文档时，主导航才显示 Dashboard。owner 文档不能被删除或降级。仪表板现在包含文化概览、pre/post 维度详情、默认折叠的学习者与结果记录、筛选、分页、反思详情和 owner 专用 viewer 管理。

## 示例数据

固定示例包已于 2026-07-24 写入正式 Firestore 项目 `echoworks-e3b4d`，包含：

- 12 位虚构学习者
- 61 次情景尝试
- 57 次完成和 4 次中途退出
- 8 次重玩
- 41 份反思
- 53 条每个用户/情景的最新进度
- CARE、REAL、两条路线完成、A/B/C 分布和第一次/最新尝试进步
- 本地生成器与预览中的四份角色问卷各有 6 个回答；需要重新运行确认后的写入命令才会替换正式 Firestore 中的旧问卷样本

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
- 当前情景角色使用六个已确认的低多边形资源：每个角色一组静止/说话 WebP，以及一张透明四帧说话 GIF。经理始终使用奶油色长尖耳模型；Sarah 始终使用棕褐色圆耳和白色内耳绒毛模型。GIF 只增加口型和张掌手势，不改变角色身份。资源路径统一配置在 `assets/characters/character-models.js`，动态播放时长继续由 `assets/js/novel.js` 中的语音时长驱动。
- 不要翻转角色图片；相机识别不可用时继续提供 AR 手动选卡。
- 每个情景使用 `assets/scenes` 中的地点背景（会议室、绩效面谈办公室、走廊或规划工作区）；教练反馈可切换为原有 success/tense/mentor 背景，同时保留屏幕滑动转场。
- assets/ar-targets/echoworks-cards.mind 仍是可识别全部八张 CARE/REAL 实体卡的本地 MindAR 目标包。实体卡源图保留在 `assets/ar-cards`；AR 叠加图使用 `assets/ar-models` 中身份统一、按卡片区分的专属姿势。`assets/characters` 中的情景角色系统必须保持独立且不受本次修改影响。
- 目标索引固定为 REAL_R、REAL_E、REAL_A、REAL_L、CARE_C、CARE_A、CARE_R、CARE_E，对应索引 0 到 7；修改卡图或顺序后必须重新编译整个目标包。

## 已通过测试

- npm run check：通过。
- npm test：15/15 通过。
- npm run test:rules：5/5 Firestore 模拟器套件通过。
- npm run test:browser：Chrome 与 Edge 通过；最新 Chrome 回归覆盖四份角色问卷的全部 24 个回答、pre-pulse 前置路由、文化概览、问卷维度详情、默认折叠记录、管理员权限、首次教程、AR 下拉区、手机置顶页头、对话框点击/触摸、文字选择保护、键盘操作、输入冷却，以及固定语音引擎下的朗读、静音、取消、角色声音配置和真实打字动画音效检查。
- 新增浏览器验证：AR 会为每张卡加载对应的专属低多边形姿势；说话角色会切换到对应 GIF，测试会验证 GIF 文件签名、笔记本内缩位置，并确认语音结束时恢复静止；可见对白和朗读对白均不含方括号或圆括号。
- app、scenario、dashboard 的 Axe serious/critical 问题：0。
- 320px、390px、横屏、768px、1024px、1440px 和等效高倍缩放检查通过。
- 生产构建包含 67 个精确列出的运行文件（20.24 MB）；其中包括 4 张已确认的静态情景角色帧、2 张带手势的透明四帧说话 GIF、8 张专属透明 AR 模型姿势、4 张地点背景、8 张实体卡和一个 2.44 MB MindAR v2 目标包。
- 示例数据导出、dry run 和 168 份正式文档逐一检查通过。
- 生产构建只包含白名单运行文件。

## 尚未完成的外部验证

- 需要使用临时真实账号测试验证邮件、密码重设、跨设备合并、云端删除和 owner/viewer 权限。
- Windows 环境没有完成 Firefox 和 Safari 测试。
- 实际声音音色和口音取决于浏览器及操作系统已安装的语音。自动化测试已验证朗读路由、角色配置、静音和取消，但不能判断真实设备上的声音质量或音量。
- 仍需在真实 Android/iOS 设备上通过 HTTPS 测试全部 8 张实体 AR 卡；自动测试只验证目标包和手动预览，不代表真实相机识别已经验证。
- 旧 Firestore 记录可能仍含内嵌 reflectionAnswers，需要 owner 后续迁移。

## 下一步

1. 在正式网站使用 `liuguangxuan1230@gmail.com` 登录，并检查文化概览、Employee/Manager 问卷对比、折叠记录、反思详情和 viewer 管理。
2. 需要正式样本显示新 24 回答结构时，再运行经过确认的样本写入命令。
3. 使用临时真实账号完成验证邮件、密码重设、跨设备合并、云端删除和 owner/viewer 权限测试。
4. 完成 Firefox、Safari、键盘、高倍缩放和全部 8 张实体手机 AR 卡测试。
5. 下次提交前检查现有的 `.firebaserc` 和 `firebase.json` 修改，不要直接重置。
