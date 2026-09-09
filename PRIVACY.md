# “是啊！吃什么”隐私政策与数据披露

生效日期：2026 年 9 月 2 日

“是啊！吃什么”（FridgeChef）是一款本地优先的菜谱应用。本政策说明应用处理的数据、联网行为和用户选择。

## 本机数据

食材、个人菜谱、菜谱库、烹饪历史、推荐偏好、已安装的菜谱索引与 ONNX 模型，以及 AI 同意状态保存在用户设备中。Gemini API Key 保存在 Android 系统 SecureStore。应用不提供由开发者运营的账号、云同步服务器、广告或分析服务。

## Google Gemini 数据披露

只有在用户主动使用 AI 功能并同意首次显著披露后，应用才会把 Gemini API Key 和该次请求所需内容直接发送给 Google Gemini API。依功能不同，数据可能包括：

- 用户选择的食物照片；
- 食材名称、饮食偏好与推荐候选；
- 用户要求整理的菜谱文本；
- 用户提交用于提取菜谱的 YouTube 链接。

应用不会自动上传完整本地菜谱库。Google 按其自身条款和隐私政策处理收到的数据。用户不应在 AI 输入中包含敏感个人信息。用户可以拒绝首次披露，或随时在“设置 → 隐私政策与数据披露”中撤回同意；撤回后应用会阻止新的 Gemini 请求，但无法删除 Google 过去已经收到的数据。

## 下载与权限

菜谱/向量索引包及可选 ONNX 模型通过 HTTPS 从配置的托管方（目前为 Hugging Face）下载。托管方可能收到 IP 地址、User-Agent 和请求时间等常规网络元数据。下载内容必须具有安全相对路径、声明大小和 SHA-256 摘要，并在安装前完成校验。

相机权限只在用户选择拍摄食物照片时申请。Release 版本不申请悬浮窗、麦克风、媒体库或广泛存储权限。

## 共享、保留与删除

应用不出售个人数据。除用户主动调用的上述服务或法律要求外，开发者不会披露数据。本机数据保留至用户在应用中删除、清除应用数据或卸载应用。清除 API Key 会从 SecureStore 删除密钥。Google 和下载托管方独立决定其收到数据的保留期限，用户应参阅相应服务的政策和账号控制。

## 儿童、安全与变更

本通用烹饪应用不面向 13 岁以下儿童。应用采用 HTTPS、路径约束、临时安装目录、文件大小与 SHA-256 校验等措施，但任何系统都无法保证绝对安全。如本政策发生重大变化，本文件与应用内页面会更新生效日期。

隐私问题请通过应用商店页面列出的开发者支持方式联系。发布前，开发者须将本政策部署到公开可访问、不可编辑的网页，并把该 URL 填入 Google Play Console。

---

# FridgeChef Privacy Policy and Data Disclosure

Effective date: September 2, 2026

FridgeChef is a local-first recipe app. Ingredients, personal recipes, libraries, cooking history, preferences, installed indexes/models, and AI consent are stored on the device. The Gemini API key is stored in Android SecureStore. The app has no developer-operated account, sync server, advertising, or analytics.

After the user accepts a prominent first-use disclosure, an AI feature sends the Gemini API key and only the content required for that request directly to Google Gemini. This may include a selected food photo, ingredients, dietary preferences, recipe candidates or text, and a YouTube URL. Full local libraries are not uploaded automatically. Google processes submitted data under its own terms and privacy policies. Consent can be declined or revoked in Settings, which blocks new Gemini requests.

Recipe/index packs and the optional ONNX model are downloaded over HTTPS from their configured host, currently Hugging Face. The host may receive ordinary network metadata. Camera access is requested only when the user chooses to take a food photo. Release builds do not request overlay, microphone, media-library, or broad storage permissions.

The app does not sell personal data. Local data remains until deleted in the app, app storage is cleared, or the app is uninstalled. Provider-side retention is controlled by Google and the download host. The app is not directed to children under 13. For privacy questions, use the developer support contact on the store listing.
