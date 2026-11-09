M-shadow Studio
英语听说跟读训练桌面软件 · V1.2.0（2026/11）
把一段英语材料，变成「逐句精听 → 跟读打分 → 听写拼写 → 背生词 → 导出随身听」的完整训练流程。
![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11%20x64-0078D4) ![Electron](https://img.shields.io/badge/Electron-33-2B2E3A) ![React](https://img.shields.io/badge/React-18-61DAFB) ![Vite](https://img.shields.io/badge/Vite-6-646CFF) ![License](https://img.shields.io/badge/license-MIT-green)
本项目是面向 Windows 的本地桌面应用。语音识别在本地运行，配音与翻译按所选通道联网；素材、录音、生词库和设置都保存在程序目录，整个文件夹可以直接拷走。
目录
功能特性
界面预览
系统要求
快速开始
语音模型与外部组件
数据目录
项目结构
技术实现
测试
已知边界
第三方服务与隐私
License

功能特性
素材导入
文本：.txt / .md / .pdf / .docx，也支持直接「粘贴文本」建素材。
音频：.mp3 / .wav / .m4a / .aac / .flac，自动转码并识别成带时间轴的句子。
视频：.mp4 / .mov / .mkv / .webm，自动抽取音轨再识别。
视频链接：通过 yt-dlp 导入 B 站 / YouTube 等链接；有英文字幕时优先用字幕时间轴，没有字幕则走本地语音识别。
文件、文本、链接导入都是后台任务：列表顶部显示浅绿色进度条与当前阶段（读取素材 / 切分 / 翻译并配音），导入期间可以继续操作其他素材。
素材列表支持搜索标题、右键改名 / 置顶 / 取消置顶 / 删除；置顶支持多篇，后置顶的排更前；删除后列表立即移除，清理转后台。
智能断句与句子编辑
规则断句：保护 Mr. / U.S. / 小数等缩写，合并碎句，超长句按逗号、连词二次切分。
有真实音频时用 ASR 时间戳对齐；纯文本按词数比例估算时间轴。
每句右侧「⋯」菜单提供四个独立动作：
编辑：句框内直接变成输入框，Enter 保存，Esc 取消；
拆分：可一键按智能切点拆分，也可以点任意单词按选中位置拆分，下方实时预览前后句；
合并：默认勾选下一句，可继续往后勾选连续多句合并；
删除：删除该句。
拆分、合并、编辑后会清空旧的译文、配音、评分和录音，并在后台静默重译、重配音，避免旧字幕/旧音频绑在新文本上。
精听与跟读评分
点句子文字切换当前句；播放面板支持单句 / 全篇 / 循环播放，循环四态：关闭循环、单句循环、全篇循环、无敌循环。
跟读录音支持一键开始/停止，可设置「先播一遍再录」。
评分从三个维度给出结果：
准确度：漏词、读错词、多词，词级高亮；
流利度：语速与参考音差异、长停顿；
音量：麦克风音量是否合适、是否爆音。
输出中文改进建议，并保留每句历史录音，可回放、可导出。
语音识别可完全离线：内置 Whisper ONNX 模型，不依赖 Python / CUDA。
听写拼写
两种模式：单词听写、整句听写，题目只来自当前选中的文章。
顺序 / 随机出题；随机模式同样只从当前文章抽词，提示会挖空该词在原文中的句子。
单词按字母数挖空；答错逐词比对。
「提示」只显示中文，不会把词加入生词库；看过中文或提示的词按既有规则进入生词库。
答错且本题没看过中文/提示时，会提示「单词已加入生词库！」；看过中文时显示对应说明；看过提示则不显示。
生词背诵与生词库
从 txt / md / pdf / docx / csv 抽词或短语建生词库，支持逗号、斜杠、分号分隔的清单。
导入时先批量入库，再后台补全音标和中文释义；顶部「从文件导入生词」按钮显示绿色进度条，全部补完才算导入完成。
生词库支持：
搜索、排序、分页，每页词数可选 10 / 20 / 50 / 100 / 全部；
「全部」模式下一张表滚轮看到底，不分页；
下拉筛选「全部内容 / 全单词 / 全短语」；
表头全选、多选删除、列宽拖动；
点单词发音，中文释义/词性过长时悬浮显示完整内容。
导出弹窗支持：
格式：CSV / TXT；
导出项：英文单词（必选）、音标（可选）、中文意思（可选）；
导出路径可直接编辑，也可点「选择目录」；
支持后台导出，顶部按钮变成绿色进度条，导出期间不影响其他功能；
缺失的音标/释义会在导出前自动补齐，失败信息显示在弹窗内。
导出
整篇配音 MP3、跟读录音 MP3、配音+跟读合集。
SRT / LRC 字幕导出。
生词本 CSV / TXT 导出。
导出的 MP3 会自动削掉句首尾静音，句间停顿按标点自适应。
设置与界面
白天 / 夜晚主题，默认白天，切换后记住。
全应用 5 档语速：0.5× / 0.75× / 1.0× / 1.25× / 1.5×。
快捷键按「听写拼写 / 生词背诵」分区配置，数字键、单字母、方向键、F1–F12 都支持。
设置页分区：学习与跟读、听写与背诵、声音与导出、翻译识别与导入、数据与版本。
设置页滚动位置 60 秒内返回会自动恢复。
翻译通道：自动 / MyMemory 免费 / Google 免费端点 / 任意 OpenAI 兼容大模型（豆包、DeepSeek 等）。
语音识别模型：默认并推荐 small.en，另内置 tiny.en；支持把自己下载的 Whisper 模型包放进程序目录后在设置里选择。
内置环境自检：ffmpeg、本地语音模型、配音服务、yt-dlp、sharp。

界面预览
学习跟读
跟读评分
![学习跟读](https://aka.doubaocdn.com/s/5AtiD2OycD)
![跟读评分](https://aka.doubaocdn.com/s/e7yzIMnVUH)

听写拼写
设置
![听写拼写](https://aka.doubaocdn.com/s/ohLcgOLqpP)
![设置](https://aka.doubaocdn.com/s/79nUGZWm0F)

帮助与版本信息
夜晚模式
![帮助与版本信息](https://aka.doubaocdn.com/s/vHRyp1JfF9)
![夜晚模式](https://aka.doubaocdn.com/s/VqDNVMOMXz)

截图文件同时保存在仓库的 screenshots/ 目录；上面使用在线地址，便于 GitHub 与飞书预览直接显示。截图可能来自较早版本，界面细节以当前 V1.2.0 为准。
系统要求
项目
要求
操作系统
Windows 10 / Windows 11，64 位（x64）
处理器
Intel / AMD x64；Windows ARM 未适配，不保证可用
内存
建议 4GB 以上，8GB 更稳
硬盘
绿色版约 750MB；另需素材、录音、导出文件空间
麦克风
跟读录音与评分需要
网络
配音（Edge TTS）、翻译、视频链接导入需要；本地语音识别不需要
Node.js
仅从源码运行/打包时需要，建议 20+；绿色版不需要

不支持 32 位 Windows、Windows 7/8、macOS、Linux。Windows Server 不属于正式支持范围。

快速开始
方式一：使用绿色版
解压整个 M-shadow-Studio-*-win64.zip；
双击 M-shadow Studio.exe；
第一次启动若出现「Windows 已保护你的电脑」，点「更多信息」→「仍要运行」（未做代码签名的正常提示）；
想建桌面快捷方式，可双击 创建桌面快捷方式.bat。
不要只单独拷 exe：模型、resources、userdata 都在一起才完整。
方式二：从源码运行
# 环境：Node.js 20+，Windows 10/11 x64
npm install
npm run dev        # 开发模式：Vite + Electron
npm run build      # 只构建前端
npm start          # 构建前端后启动 Electron

也可以双击仓库根目录的 1-安装依赖.bat / 2-启动程序.bat。
打包 Windows 绿色版
npm run build
npx electron-builder --win --x64 --dir
# 产物：release/win-unpacked/

npm run dist:win 默认生成 NSIS 安装包；Linux 交叉打包 NSIS 需要 wine，没有 wine 时用上面的 --dir 出绿色版目录。

语音模型与外部组件
为了控制仓库体积，以下大文件不提交到 Git（已在 .gitignore 排除），克隆后需要自行放置：
Whisper 模型（语音识别）
放到：
resources/models/Xenova/whisper-small.en/
resources/models/Xenova/whisper-tiny.en/

每个模型目录至少包含：
config.json
generation_config.json
onnx/
  encoder_model_quantized.onnx
  decoder_model_merged_quantized.onnx

模型来源：Hugging Face / hf-mirror 上的 Xenova/whisper-small.en、Xenova/whisper-tiny.en（Transformers.js 格式）。默认使用 small.en，更准但更慢；tiny.en 更快。
自定义模型
把模型文件夹放到：
<程序目录>\userdata\models\Xenova\<你的模型文件夹>\

要求文件夹内同样有 config.json 和 ONNX 模型文件。重新进入设置页后，「语音识别 → 识别模型」下拉会出现「自定义」选项。内置目录 resources\models\Xenova 也支持，但 Program Files 下可能没有写权限，优先用 userdata\models\Xenova。
视频链接组件
resources/bin/yt-dlp.exe
resources/bin/ffmpeg.exe

yt-dlp.exe 需自行下载最新版；ffmpeg.exe 可来自 ffmpeg-static 或官方构建。缺少 yt-dlp.exe 时链接导入不可用，其他功能不受影响。

数据目录
默认保存在程序目录下的 userdata/（绿色版可整体拷走）。如果程序目录不可写（例如安装在受保护目录），会自动退化到系统用户数据目录。
userdata/
├─ store.json        素材库、设置、置顶、快捷键等
├─ vocab.json        生词库
├─ dict-cache.json   词典查询缓存
├─ media/            导入素材的音频
├─ tts/              配音缓存
├─ recordings/       跟读录音
├─ exports/          导出文件（默认导出目录）
├─ models/           自定义语音模型（可选）
├─ tmp/              临时文件
└─ logs/             日志

换电脑时，把整个程序文件夹（包括 userdata）一起复制即可。

项目结构
shadowing-studio/
├─ electron/                     Electron 主进程
│  ├─ main.js                   窗口、media:// 协议、IPC、导入/导出/评分调度
│  ├─ preload.js                contextBridge 暴露给渲染进程的 API
│  ├─ lib/
│  │  ├─ import.js              txt/pdf/docx/字幕/音频/视频/链接 导入
│  │  ├─ text.js                文本清洗、断句、时间轴估算、ASR 对齐
│  │  ├─ asr.js                 Whisper 子进程调度
│  │  ├─ ffmpeg.js              抽音轨、转码、拼接、音量/停顿分析
│  │  ├─ tts.js                 Edge TTS 配音与缓存
│  │  ├─ translate.js           翻译通道适配与降级
│  │  ├─ dict.js                词典查询、音标、释义缓存
│  │  ├─ vocab.js               词汇表、派生词、联想记忆
│  │  ├─ vocabstore.js          生词库持久化与批量写入
│  │  ├─ score.js               词级对齐、多维评分、中文建议
│  │  ├─ export.js              MP3 合成、SRT/LRC 生成
│  │  ├─ store.js               设置与素材库 JSON 持久化
│  │  └─ paths.js               数据目录管理
│  └─ scripts/asr.mjs           本地 Whisper（transformers.js + ONNX）
├─ src/                         React 渲染进程
│  ├─ App.jsx                   框架、三视图常驻、窗口三键、主题
│  ├─ store.js                  zustand 状态与业务动作
│  ├─ lib/                      播放引擎、录音器、词级 diff、工具
│  ├─ components/
│  │  ├─ Sidebar.jsx            素材列表、搜索、右键菜单、导入
│  │  ├─ StudyView.jsx          学习跟读、句子编辑/拆分/合并
│  │  ├─ SpellingView.jsx       单词/整句听写
│  │  ├─ VocabView.jsx          背单词、生词库、导入导出
│  │  ├─ PlayerPanel.jsx        播放控制、录音、跟读
│  │  ├─ SettingsView.jsx       设置页
│  │  └─ ...
│  └─ styles.css
├─ resources/
│  ├─ icon.ico / icon.png
│  ├─ bin/                      ffmpeg.exe / yt-dlp.exe（不提交）
│  └─ models/                   Whisper 模型（不提交）
├─ test/
│  ├─ smoke.mjs                 核心逻辑冒烟测试
│  ├─ e2e.mjs                   音频→识别→断句→翻译→配音全链路
│  └─ make-demo.mjs             生成演示素材
├─ package.json
├─ vite.config.js
└─ 使用说明.txt


技术实现
Electron 33 + React 18 + Vite 6：Windows 桌面端，前端构建为静态文件。
本地 ASR：@huggingface/transformers + ONNX Runtime，在独立子进程里跑 Whisper，不需要 Python / CUDA。
asar: false：ONNX 原生库、ffmpeg 可执行文件、ESM 子进程脚本在 Windows 上路径更稳。
media:// 自定义协议：手写 Range 请求，点某一句可精确跳到对应时间播放。
后台任务模型：导入、翻译、配音、生词补全、导出都按任务状态运行，避免长任务占住全局 busy 导致界面点不动。
数据一致性：句子拆分/合并/编辑后清空旧译文、配音、评分、录音，再后台补齐，避免旧数据绑定新文本。
打包瘦身：排除 Transformers 缓存中的重复模型副本；electronLanguages 只保留 en-US / zh-CN / zh-TW，显著减小 locales 体积。
主要 IPC 能力
import:url / import:text / import:file、translate:doc、tts:doc、score:run、vocab:*、doc:update/reorder/remove、window:*、app:diagnose 等；具体见 electron/main.js 与 electron/preload.js。

测试
npm test

覆盖断句、时间轴、评分算法、字幕生成，以及真实 Edge TTS / ffmpeg 拼接 / 翻译调用。部分用例依赖网络。
无界面冒烟测试（Linux 开发环境）：
SMOKE_TEST=1 SMOKE_JS="document.body.innerText.slice(0,80)" \
SMOKE_SHOT=/tmp/app.png \
xvfb-run -a --server-args="-screen 0 1300x900x24" npx electron . --no-sandbox


已知边界
评分是「识别文本 → 词级对齐 → 语速/停顿/音量」的方案，不是音素级发音分析；不能判断 /θ/ 舌位这类细节。
MyMemory 免费翻译有公共额度限制，长文可能中途限流；建议配置自己的大模型 Key。
扫描版 PDF 没有文字层，本软件不做 OCR。
视频链接依赖 yt-dlp 与站点可用性；YouTube 在国内需要代理。
Windows ARM、macOS、Linux 未做正式适配。
语音识别准确率与模型大小、录音质量、麦克风环境有关。

第三方服务与隐私
Edge TTS：配音会把句子文本发送到微软语音服务。
MyMemory / Google 翻译 / 自配大模型：翻译会把文本发送到对应服务商；敏感内容请改用本地或可信通道。
视频链接：由 yt-dlp 直接访问站点。
本地语音识别：录音只在本机处理，不会上传。
素材、录音、生词库、设置默认只保存在本机 userdata/。

License
MIT（见 package.json）。
