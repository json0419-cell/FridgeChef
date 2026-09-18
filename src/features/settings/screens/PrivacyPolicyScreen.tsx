import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFeedback } from '../../../shared/components/AppFeedbackProvider';
import { useI18n } from '../../../i18n/i18n';
import { grantAiDataConsent, hasAiDataConsent, revokeAiDataConsent } from '../../../privacy/ai-data-consent';
import { colors, spacing, typography } from '../../../shared/theme/theme';
import type { PrivacyPolicyScreenProps } from '../../../types';

type Props = PrivacyPolicyScreenProps;

export function PrivacyPolicyScreen({ navigation, route }: Props) {
  const { language } = useI18n();
  const { showFeedback } = useFeedback();
  const copy = getCopy(language);
  const [consented, setConsented] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      void hasAiDataConsent().then((value) => mounted && setConsented(value));
      return () => {
        mounted = false;
      };
    }, []),
  );

  const updateConsent = async (next: boolean) => {
    try {
      if (next) {
        await grantAiDataConsent();
      } else {
        await revokeAiDataConsent();
      }
      setConsented(next);
      showFeedback({ tone: 'success', title: next ? copy.consentGranted : copy.consentRevoked });
      // A setup step that sent the user here expects them back once they agree.
      if (next && route.params?.returnAfterConsent && navigation.canGoBack()) {
        navigation.goBack();
      }
    } catch (error) {
      showFeedback({
        tone: 'error',
        title: copy.updateFailed,
        message: error instanceof Error ? error.message : copy.unknownError,
      });
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.effective}>{copy.effective}</Text>
        <Text style={styles.intro}>{copy.intro}</Text>

        {copy.sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.title}>{section.title}</Text>
            {section.paragraphs.map((paragraph) => (
              <Text key={paragraph} style={styles.body}>{paragraph}</Text>
            ))}
          </View>
        ))}

        <View style={styles.consentCard}>
          <Text style={styles.consentTitle}>{copy.consentTitle}</Text>
          <Text style={styles.status}>{consented ? copy.consentOn : copy.consentOff}</Text>
          <Text style={styles.body}>{copy.consentHelp}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void updateConsent(!consented)}
            style={({ pressed }) => [styles.button, consented && styles.revokeButton, pressed && styles.pressed]}
          >
            <Text style={[styles.buttonText, consented && styles.revokeButtonText]}>
              {consented ? copy.revoke : copy.agree}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function getCopy(language: string) {
  if (language === 'en') {
    return {
      effective: 'Effective date: September 2, 2026',
      intro: 'FridgeChef is a local-first recipe app. This notice explains what stays on your device and what leaves it only when you choose an online feature.',
      sections: [
        { title: '1. Data stored on your device', paragraphs: ['Ingredients, recipes, libraries, cooking history, preferences, installed indexes/models, and AI consent are stored locally. Your Gemini API key is stored in the operating system SecureStore. The app has no developer-operated account or sync server.'] },
        { title: '2. Google Gemini disclosure', paragraphs: ['When you actively use an AI feature, the app sends your Gemini API key and only the content needed for that request directly to the Google Gemini API. Depending on the feature, this may include a selected food photo, ingredient names, dietary preferences, recipe candidates or text, and a YouTube URL.', 'Your full local recipe libraries are not uploaded automatically. Google processes submitted data under its own terms and privacy policies. Do not submit sensitive personal information. You can cancel the first-use disclosure or revoke consent below; AI features then remain blocked until you agree again.'] },
        { title: '3. Downloads and permissions', paragraphs: ['Recipe/index packs and the optional ONNX model are downloaded over HTTPS from their configured host (currently Hugging Face). That host may receive standard network data such as your IP address and request metadata.', 'Camera access is requested only when you choose to take a food photo. Release builds do not request overlay, microphone, media-library, or broad storage permissions.'] },
        { title: '4. Sharing, ads, and analytics', paragraphs: ['The app does not sell personal data and does not include advertising or analytics SDKs. Data is disclosed only to the service you deliberately invoke, as described above, or when required by law.'] },
        { title: '5. Retention and deletion', paragraphs: ['Local data remains until you delete it in the app, clear app storage, or uninstall the app. Clearing the Gemini API key removes it from SecureStore. Google and download hosts control retention of data they receive; consult their policies and account controls.'] },
        { title: '6. Security, children, and changes', paragraphs: ['Downloads require HTTPS, safe relative paths, declared sizes, and SHA-256 verification before installation. No system is risk-free. This general-audience cooking app is not directed to children under 13. Material policy changes will be reflected here with a new effective date. For privacy questions, use the developer support contact on the app store listing.'] },
      ],
      consentTitle: 'AI data consent', consentOn: 'Status: agreed', consentOff: 'Status: not agreed',
      consentHelp: 'Revoking consent does not delete past requests from Google; use your Google account controls for provider-side data. It immediately blocks new Gemini requests from this app.',
      agree: 'Agree to AI Data Disclosure', revoke: 'Revoke AI Consent', consentGranted: 'AI consent saved', consentRevoked: 'AI consent revoked', updateFailed: 'Could not update consent', unknownError: 'Unknown error',
    };
  }

  return {
    effective: '生效日期：2026 年 9 月 2 日',
    intro: '“是啊！吃什么”是一款本地优先的菜谱应用。本说明列明哪些数据留在设备中，以及你主动使用联网功能时哪些数据会离开设备。',
    sections: [
      { title: '1. 保存在本机的数据', paragraphs: ['食材、菜谱、菜谱库、烹饪历史、偏好、已安装索引/模型及 AI 同意状态保存在本机。Gemini API Key 保存在操作系统 SecureStore 中。本应用不提供开发者运营的账号或同步服务器。'] },
      { title: '2. Google Gemini 数据披露', paragraphs: ['当你主动使用 AI 功能时，本应用会把 Gemini API Key 及完成该次请求所需的内容直接发送给 Google Gemini API。依功能不同，内容可能包括所选食物照片、食材名称、饮食偏好、候选菜谱或菜谱文本，以及 YouTube 链接。', '完整的本地菜谱库不会被自动上传。Google 会依其条款和隐私政策处理收到的数据。请勿提交敏感个人信息。你可取消首次披露或在下方撤回同意；重新同意前，AI 功能将保持停用。'] },
      { title: '3. 下载与权限', paragraphs: ['菜谱/索引包和可选 ONNX 模型通过 HTTPS 从配置的托管方（目前为 Hugging Face）下载。该托管方可能收到 IP 地址和请求元数据等常规网络信息。', '相机权限仅在你选择拍摄食物照片时请求。Release 版本不申请悬浮窗、麦克风、媒体库或广泛存储权限。'] },
      { title: '4. 共享、广告与分析', paragraphs: ['本应用不出售个人数据，不包含广告或分析 SDK。数据只会按上述说明发送给你主动调用的服务，或在法律要求时披露。'] },
      { title: '5. 保留与删除', paragraphs: ['本机数据会保留到你在应用中删除、清除应用数据或卸载应用为止。清除 Gemini API Key 会将其从 SecureStore 删除。Google 与下载托管方独立决定其收到数据的保留期限，请查阅其政策和账号控制。'] },
      { title: '6. 安全、儿童与政策变更', paragraphs: ['下载必须使用 HTTPS、安全相对路径、声明大小，并在安装前通过 SHA-256 校验。任何系统都无法保证绝对安全。本通用烹饪应用不面向 13 岁以下儿童。如政策发生重大变化，本页会更新生效日期。隐私问题请通过应用商店页面中的开发者支持方式联系。'] },
    ],
    consentTitle: 'AI 数据同意', consentOn: '状态：已同意', consentOff: '状态：未同意',
    consentHelp: '撤回同意不会删除 Google 已收到的历史请求；服务方数据请通过 Google 账号控制处理。撤回后，本应用会立即阻止新的 Gemini 请求。',
    agree: '同意 AI 数据披露', revoke: '撤回 AI 同意', consentGranted: '已保存 AI 同意', consentRevoked: '已撤回 AI 同意', updateFailed: '无法更新同意状态', unknownError: '未知错误',
  };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: spacing.lg, paddingBottom: 48, gap: spacing.lg },
  effective: { color: colors.muted, fontSize: 13, fontFamily: typography.body },
  intro: { color: colors.text, fontSize: 16, lineHeight: 25, fontFamily: typography.body },
  section: { gap: spacing.sm },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', fontFamily: typography.strong },
  body: { color: colors.muted, fontSize: 15, lineHeight: 23, fontFamily: typography.body },
  consentCard: { gap: spacing.sm, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#F5F7F5' },
  consentTitle: { color: colors.text, fontSize: 18, fontWeight: '800', fontFamily: typography.strong },
  status: { color: colors.primary, fontSize: 15, fontWeight: '700', fontFamily: typography.strong },
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.primary, paddingHorizontal: spacing.md },
  revokeButton: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.danger },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', fontFamily: typography.strong },
  revokeButtonText: { color: colors.danger },
  pressed: { opacity: 0.82 },
});
