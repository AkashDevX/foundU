import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  Keyboard,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommonActions, useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { spacing, colors, fontFamily } from '../../theme/theme';
import { loginScreenStyles } from '../../styles/loginScreenStyles';
import { CompanyPicker } from '../../components/CompanyPicker';
import { SweetAlert } from '../../components/SweetAlert';
import { useAppBootstrap } from '../../context/AppBootstrapContext';
import { loginEmployee } from '../../services/loginApi';
import {
  requestPasswordResetOtp,
  resetPasswordWithToken,
  validateNewPassword,
  verifyPasswordResetOtp,
} from '../../services/forgotPasswordApi';
import { setAuthToken, setLastCompanySlug, setSessionAuthenticated } from '../../services/authSessionStorage';
import {
  DEFAULT_ACCOUNT_PROFILE,
  loadAccountProfile,
  saveAccountProfile,
} from '../../services/accountProfileStorage';
import { refreshAndCacheAccountProfileFromApi } from '../../services/accountProfileApi';
import { API_BASE_URL } from '../../config/api';

type ForgotStep = 'email' | 'otp' | 'password' | 'done';

type MissingField = 'company' | 'email' | 'password';

function loginValidationAlert(missing: MissingField[]): { title: string; message: string } {
  if (missing.length === 1) {
    switch (missing[0]) {
      case 'company':
        return {
          title: 'Company required',
          message: 'Select a valid company before signing in.',
        };
      case 'email':
        return {
          title: 'Email required',
          message: 'The email address is blank.',
        };
      case 'password':
        return {
          title: 'Password required',
          message: 'The password is blank.',
        };
      default:
        break;
    }
  }
  const labels: Record<MissingField, string> = {
    company: 'company / organization',
    email: 'email address',
    password: 'password',
  };
  const parts = missing.map((m) => labels[m]);
  let listed: string;
  if (parts.length === 2) {
    listed = `${parts[0]} and ${parts[1]}`;
  } else {
    listed = `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
  }
  return {
    title: 'Empty fields',
    message: `The following fields are empty: ${listed}. Please fill them in to continue.`,
  };
}

export function LoginScreen() {
  const navigation = useNavigation<any>();
  const {
    companies,
    loading: bootstrapLoading,
    refreshing: bootstrapRefreshing,
    error: bootstrapError,
    refetch: refetchBootstrap,
  } = useAppBootstrap();
  const orgListLoading = bootstrapLoading && companies.length === 0;
  const insets = useSafeAreaInsets();
  const [companySlug, setCompanySlug] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [forgotStep, setForgotStep] = useState<ForgotStep>('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotResetToken, setForgotResetToken] = useState<string | null>(null);
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotShowPassword, setForgotShowPassword] = useState(false);
  const [forgotShowConfirmPassword, setForgotShowConfirmPassword] = useState(false);
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [validationAlert, setValidationAlert] = useState<{ title: string; message: string } | null>(null);
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const forgotEmailRef = useRef<TextInput>(null);
  const forgotOtpRef = useRef<TextInput>(null);
  const forgotNewPasswordRef = useRef<TextInput>(null);
  const forgotConfirmPasswordRef = useRef<TextInput>(null);

  const styles = loginScreenStyles;

  const resetForgotState = () => {
    setForgotStep('email');
    setForgotOtp('');
    setForgotResetToken(null);
    setForgotNewPassword('');
    setForgotConfirmPassword('');
    setForgotShowPassword(false);
    setForgotShowConfirmPassword(false);
    setForgotSubmitting(false);
  };

  const openForgotModal = () => {
    if (!companySlug) {
      setValidationAlert({
        title: 'Company required',
        message: 'Select your organization before resetting your password.',
      });
      return;
    }
    resetForgotState();
    setForgotEmail(email.trim());
    setForgotModalVisible(true);
  };

  const closeForgotModal = () => {
    if (forgotSubmitting) return;
    Keyboard.dismiss();
    setForgotModalVisible(false);
    resetForgotState();
  };

  const handleForgotSendOtp = async () => {
    if (forgotSubmitting) return;

    if (!companySlug) {
      setValidationAlert({
        title: 'Company required',
        message: 'Select your organization before resetting your password.',
      });
      return;
    }

    const trimmed = forgotEmail.trim();
    if (trimmed === '') {
      setValidationAlert({
        title: 'Email required',
        message: 'Enter the email address for your account.',
      });
      return;
    }

    Keyboard.dismiss();
    setForgotSubmitting(true);
    try {
      const result = await requestPasswordResetOtp({
        companySlug,
        email: trimmed,
      });
      if (!result.ok) {
        setValidationAlert({
          title: 'Could not send code',
          message: __DEV__ ? `${result.message}\n\nAPI: ${API_BASE_URL}` : result.message,
        });
        return;
      }
      setEmail(trimmed);
      setForgotOtp('');
      setForgotStep('otp');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setValidationAlert({
        title: 'Could not send code',
        message: __DEV__ ? `${msg}\n\nAPI: ${API_BASE_URL}` : 'Something went wrong. Please try again.',
      });
    } finally {
      setForgotSubmitting(false);
    }
  };

  const handleForgotVerifyOtp = async () => {
    if (forgotSubmitting || !companySlug) return;

    const code = forgotOtp.trim();
    if (!/^\d{6}$/.test(code)) {
      setValidationAlert({
        title: 'Code required',
        message: 'Enter the 6-digit verification code from your email.',
      });
      return;
    }

    Keyboard.dismiss();
    setForgotSubmitting(true);
    try {
      const result = await verifyPasswordResetOtp({
        companySlug,
        email: forgotEmail.trim(),
        otp: code,
      });
      if (!result.ok) {
        setValidationAlert({
          title: 'Verification failed',
          message: result.message,
        });
        return;
      }
      setForgotResetToken(result.resetToken);
      setForgotNewPassword('');
      setForgotConfirmPassword('');
      setForgotStep('password');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setValidationAlert({
        title: 'Verification failed',
        message: __DEV__ ? msg : 'Something went wrong. Please try again.',
      });
    } finally {
      setForgotSubmitting(false);
    }
  };

  const handleForgotResetPassword = async () => {
    if (forgotSubmitting || !companySlug || !forgotResetToken) return;

    const criteriaError = validateNewPassword(forgotNewPassword, forgotConfirmPassword);
    if (criteriaError) {
      setValidationAlert({
        title: 'Check your password',
        message: criteriaError,
      });
      return;
    }

    Keyboard.dismiss();
    setForgotSubmitting(true);
    try {
      const result = await resetPasswordWithToken({
        companySlug,
        resetToken: forgotResetToken,
        password: forgotNewPassword,
        passwordConfirmation: forgotConfirmPassword,
      });
      if (!result.ok) {
        setValidationAlert({
          title: 'Could not update password',
          message: result.message,
        });
        return;
      }
      setPassword('');
      setForgotStep('done');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setValidationAlert({
        title: 'Could not update password',
        message: __DEV__ ? msg : 'Something went wrong. Please try again.',
      });
    } finally {
      setForgotSubmitting(false);
    }
  };

  const goToMainApp = useCallback(() => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Main' }],
      }),
    );
  }, [navigation]);

  const handleSignIn = useCallback(async () => {
    const missing: MissingField[] = [];
    if (!companySlug) {
      missing.push('company');
    }
    if (email.trim() === '') {
      missing.push('email');
    }
    if (password.trim() === '') {
      missing.push('password');
    }
    if (missing.length > 0) {
      setValidationAlert(loginValidationAlert(missing));
      return;
    }

    const slug = companySlug as string;
    Keyboard.dismiss();
    setLoginSubmitting(true);
    try {
      const result = await loginEmployee({
        companySlug: slug,
        email: email.trim(),
        password,
      });
      if (!result.ok) {
        setValidationAlert({
          title: 'Sign in failed',
          message: __DEV__ ? `${result.message}\n\nAPI: ${API_BASE_URL}` : result.message,
        });
        return;
      }
      await setAuthToken(result.token);
      await setSessionAuthenticated(true);
      await setLastCompanySlug(slug);
      try {
        const existing = await loadAccountProfile();
        // Only carry over cached fields when the *same* user signs back in.
        // A different account must start clean so the previous user's name/photo
        // never leaks into the new session before /api/v1/me resolves.
        const isSameUser =
          !!existing.email &&
          existing.email.trim().toLowerCase() === email.trim().toLowerCase();
        const base = isSameUser ? existing : { ...DEFAULT_ACCOUNT_PROFILE };
        const org = companies.find((c) => c.slug === slug);
        await saveAccountProfile({
          ...base,
          email: email.trim(),
          companySlug: slug,
          registrationCompanySlug: slug,
          ...(org
            ? {
                companyName: org.name,
                registrationCompanyAppKey: org.appKey ?? base.registrationCompanyAppKey ?? undefined,
              }
            : {}),
        });
      } catch {
        /* profile merge is best-effort */
      }
      goToMainApp();
      void refreshAndCacheAccountProfileFromApi().catch(() => {
        /* best-effort — Dashboard refreshes profile when the tab becomes active */
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setValidationAlert({
        title: 'Sign in failed',
        message: __DEV__ ? `${msg}\n\nAPI: ${API_BASE_URL}` : msg,
      });
    } finally {
      setLoginSubmitting(false);
    }
  }, [companies, companySlug, email, password, goToMainApp]);

  const handleCreateAccount = useCallback(() => {
    navigation.navigate('CreateAccount');
  }, [navigation]);

  const dismissValidationAlert = useCallback(() => setValidationAlert(null), []);

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.loginScroll}
          contentContainerStyle={styles.loginScrollContent}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
          bounces
        >
          <View style={[styles.header, { paddingTop: insets.top + spacing.xxl }]}>
            <View style={[styles.geo, styles.geo1]} />
            <View style={[styles.geo, styles.geo2]} />
            <View style={[styles.geo, styles.geo3]} />
            <View style={[styles.geo, styles.geo4]} />
            <Text style={styles.appName}>CruLynk</Text>
            <Text style={styles.tagline}>Precision in Motion</Text>
          </View>

          <View
            style={[
              styles.card,
              { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xl },
            ]}
          >
            <Text style={styles.welcome}>Welcome back</Text>
            <Text style={styles.subWelcome}>Sign in to manage your shift</Text>

            <CompanyPicker
              variant="login"
              companies={companies}
              listingLoading={orgListLoading}
              value={companySlug}
              onChange={setCompanySlug}
            />

            {bootstrapRefreshing && companies.length > 0 ? (
              <Text style={bootstrapBannerStyles.refreshHint}>Updating organization list…</Text>
            ) : null}

            {!orgListLoading && companies.length === 0 ? (
              <View style={bootstrapBannerStyles.wrap}>
                <Text style={bootstrapBannerStyles.title}>
                  {bootstrapError ? 'Could not load organizations' : 'No organizations on server'}
                </Text>
                <Text style={bootstrapBannerStyles.body}>
                  {bootstrapError ??
                    (__DEV__
                      ? `The server at ${API_BASE_URL} responded but returned no companies.`
                      : 'No organizations were returned. Check your connection and tap Retry.')}
                </Text>
                {__DEV__ ? <Text style={bootstrapBannerStyles.api}>API: {API_BASE_URL}</Text> : null}
                <TouchableOpacity
                  style={bootstrapBannerStyles.retryBtn}
                  onPress={() => void refetchBootstrap()}
                  activeOpacity={0.7}
                  disabled={bootstrapRefreshing}
                >
                  <Text style={bootstrapBannerStyles.retryText}>
                    {bootstrapRefreshing ? 'Retrying…' : 'Retry'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <Text style={[styles.label, { marginTop: spacing.xl }]}>EMAIL ADDRESS</Text>
            <Pressable style={styles.input} onPress={() => emailRef.current?.focus()}>
              <Feather name="mail" size={20} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput
                ref={emailRef}
                style={styles.inputField}
                placeholder="user@email.com"
                placeholderTextColor="#9CA3AF"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </Pressable>

            <View style={styles.labelRow}>
              <Text style={styles.label}>PASSWORD</Text>
              <TouchableOpacity onPress={openForgotModal} activeOpacity={0.7}>
                <Text style={styles.forgot}>Forgot Password?</Text>
              </TouchableOpacity>
            </View>
            <Pressable style={styles.input} onPress={() => passwordRef.current?.focus()}>
              <Feather name="lock" size={20} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput
                ref={passwordRef}
                style={[styles.inputField, styles.inputFieldPw]}
                placeholder="••••••••"
                placeholderTextColor="#9CA3AF"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                returnKeyType="go"
                onSubmitEditing={() => {
                  Keyboard.dismiss();
                  handleSignIn();
                }}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword(!showPassword)}
                activeOpacity={0.7}
              >
                <Feather name={showPassword ? 'eye-off' : 'eye'} size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </Pressable>

            <TouchableOpacity
              style={[styles.signInBtn, loginSubmitting && signInOverlayStyles.signInDisabled]}
              activeOpacity={0.88}
              onPress={handleSignIn}
              disabled={loginSubmitting}
            >
              <Text style={styles.signInText}>{loginSubmitting ? 'Signing in…' : 'Sign In'}</Text>
            </TouchableOpacity>

            <View style={styles.footerStack}>
              <View style={styles.footerStackInner}>
                <View style={styles.footerRow}>
                  <Text style={styles.footerPrompt}>New user?</Text>
                  <TouchableOpacity onPress={handleCreateAccount} activeOpacity={0.7}>
                    <Text style={styles.footerLink}>Create an account</Text>
                  </TouchableOpacity>
                </View>
                <View style={[styles.footerRow, styles.footerRowGap]}>
                  <Text style={styles.footerPrompt}>New organisation?</Text>
                  <TouchableOpacity onPress={() => navigation.navigate('RequestOrganization')} activeOpacity={0.7}>
                    <Text style={styles.footerLink}>Request access</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={loginSubmitting} transparent animationType="fade">
        <View style={signInOverlayStyles.loadingOverlay} accessibilityElementsHidden>
          <View style={signInOverlayStyles.loadingCard}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={signInOverlayStyles.loadingText}>Contacting server…</Text>
            <Text style={signInOverlayStyles.loadingHint}>
              Checking your organization and credentials
            </Text>
          </View>
        </View>
      </Modal>

      <SweetAlert
        visible={validationAlert !== null}
        title={validationAlert?.title ?? ''}
        message={validationAlert?.message ?? ''}
        confirmText="OK"
        cancelText="Cancel"
        hideCancel
        variant="warning"
        onClose={dismissValidationAlert}
        onConfirm={dismissValidationAlert}
      />

      <Modal visible={forgotModalVisible} transparent animationType="fade" onRequestClose={closeForgotModal}>
        <View style={styles.forgotModalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeForgotModal} accessibilityLabel="Dismiss" />
          <View style={styles.forgotModalCard}>
            <View style={styles.forgotModalHeader}>
              <TouchableOpacity
                onPress={closeForgotModal}
                style={styles.forgotModalCloseBtn}
                hitSlop={12}
                accessibilityLabel="Close"
                disabled={forgotSubmitting}
              >
                <Feather name="x" size={24} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
            {forgotStep === 'email' ? (
              <>
                <View style={styles.forgotModalIconWrap}>
                  <Feather name="mail" size={28} color={colors.primary} />
                </View>
                <Text style={styles.forgotModalTitle}>Forgot your password?</Text>
                <Text style={styles.forgotModalBody}>
                  Enter your email and we will send a 6-digit verification code. After you verify it, you can create a
                  new password.
                </Text>
                <Text style={[styles.label, { marginTop: spacing.md }]}>EMAIL ADDRESS</Text>
                <Pressable style={styles.input} onPress={() => forgotEmailRef.current?.focus()}>
                  <Feather name="mail" size={20} color="#9CA3AF" style={styles.inputIcon} />
                  <TextInput
                    ref={forgotEmailRef}
                    style={styles.inputField}
                    placeholder="user@email.com"
                    placeholderTextColor="#9CA3AF"
                    value={forgotEmail}
                    onChangeText={setForgotEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!forgotSubmitting}
                    returnKeyType="send"
                    onSubmitEditing={() => {
                      void handleForgotSendOtp();
                    }}
                  />
                </Pressable>
                <TouchableOpacity
                  style={[styles.signInBtn, { marginTop: spacing.xl }, forgotSubmitting && { opacity: 0.7 }]}
                  activeOpacity={0.88}
                  disabled={forgotSubmitting}
                  onPress={() => {
                    void handleForgotSendOtp();
                  }}
                >
                  {forgotSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.signInText}>Send verification code</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.forgotModalBtnSecondary}
                  onPress={closeForgotModal}
                  activeOpacity={0.7}
                  disabled={forgotSubmitting}
                >
                  <Text style={styles.forgotModalBtnSecondaryText}>Back to sign in</Text>
                </TouchableOpacity>
              </>
            ) : null}

            {forgotStep === 'otp' ? (
              <>
                <View style={styles.forgotModalIconWrap}>
                  <Feather name="shield" size={28} color={colors.primary} />
                </View>
                <Text style={styles.forgotModalTitle}>Enter verification code</Text>
                <Text style={styles.forgotModalBody}>
                  We sent a 6-digit code to {forgotEmail.trim()}. Enter it below to continue.
                </Text>
                <Text style={[styles.label, { marginTop: spacing.md }]}>VERIFICATION CODE</Text>
                <Pressable style={styles.input} onPress={() => forgotOtpRef.current?.focus()}>
                  <Feather name="hash" size={20} color="#9CA3AF" style={styles.inputIcon} />
                  <TextInput
                    ref={forgotOtpRef}
                    style={styles.inputField}
                    placeholder="123456"
                    placeholderTextColor="#9CA3AF"
                    value={forgotOtp}
                    onChangeText={(t) => setForgotOtp(t.replace(/[^0-9]/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={6}
                    editable={!forgotSubmitting}
                    returnKeyType="done"
                    onSubmitEditing={() => {
                      void handleForgotVerifyOtp();
                    }}
                  />
                </Pressable>
                <TouchableOpacity
                  style={[styles.signInBtn, { marginTop: spacing.xl }, forgotSubmitting && { opacity: 0.7 }]}
                  activeOpacity={0.88}
                  disabled={forgotSubmitting}
                  onPress={() => {
                    void handleForgotVerifyOtp();
                  }}
                >
                  {forgotSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.signInText}>Verify code</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.forgotModalBtnSecondary}
                  onPress={() => {
                    if (!forgotSubmitting) {
                      void handleForgotSendOtp();
                    }
                  }}
                  activeOpacity={0.7}
                  disabled={forgotSubmitting}
                >
                  <Text style={styles.forgotModalBtnSecondaryText}>Resend code</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.forgotModalBtnSecondary}
                  onPress={() => {
                    if (!forgotSubmitting) setForgotStep('email');
                  }}
                  activeOpacity={0.7}
                  disabled={forgotSubmitting}
                >
                  <Text style={styles.forgotModalBtnSecondaryText}>Change email</Text>
                </TouchableOpacity>
              </>
            ) : null}

            {forgotStep === 'password' ? (
              <>
                <View style={styles.forgotModalIconWrap}>
                  <Feather name="lock" size={28} color={colors.primary} />
                </View>
                <Text style={styles.forgotModalTitle}>Create a new password</Text>
                <Text style={styles.forgotModalBody}>
                  Choose a new password (at least 8 characters), then confirm it to finish.
                </Text>
                <Text style={[styles.label, { marginTop: spacing.md }]}>NEW PASSWORD</Text>
                <Pressable style={styles.input} onPress={() => forgotNewPasswordRef.current?.focus()}>
                  <Feather name="lock" size={20} color="#9CA3AF" style={styles.inputIcon} />
                  <TextInput
                    ref={forgotNewPasswordRef}
                    style={[styles.inputField, styles.inputFieldPw]}
                    placeholder="New password"
                    placeholderTextColor="#9CA3AF"
                    value={forgotNewPassword}
                    onChangeText={setForgotNewPassword}
                    secureTextEntry={!forgotShowPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!forgotSubmitting}
                    returnKeyType="next"
                    onSubmitEditing={() => forgotConfirmPasswordRef.current?.focus()}
                  />
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={() => setForgotShowPassword((v) => !v)}
                    hitSlop={8}
                    accessibilityLabel={forgotShowPassword ? 'Hide password' : 'Show password'}
                  >
                    <Feather name={forgotShowPassword ? 'eye-off' : 'eye'} size={20} color="#9CA3AF" />
                  </TouchableOpacity>
                </Pressable>
                <Text style={[styles.label, { marginTop: spacing.xl }]}>CONFIRM PASSWORD</Text>
                <Pressable style={styles.input} onPress={() => forgotConfirmPasswordRef.current?.focus()}>
                  <Feather name="lock" size={20} color="#9CA3AF" style={styles.inputIcon} />
                  <TextInput
                    ref={forgotConfirmPasswordRef}
                    style={[styles.inputField, styles.inputFieldPw]}
                    placeholder="Confirm password"
                    placeholderTextColor="#9CA3AF"
                    value={forgotConfirmPassword}
                    onChangeText={setForgotConfirmPassword}
                    secureTextEntry={!forgotShowConfirmPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!forgotSubmitting}
                    returnKeyType="done"
                    onSubmitEditing={() => {
                      void handleForgotResetPassword();
                    }}
                  />
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={() => setForgotShowConfirmPassword((v) => !v)}
                    hitSlop={8}
                    accessibilityLabel={forgotShowConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    <Feather name={forgotShowConfirmPassword ? 'eye-off' : 'eye'} size={20} color="#9CA3AF" />
                  </TouchableOpacity>
                </Pressable>
                <Text style={styles.forgotModalHint}>Must be at least 8 characters and match the confirmation.</Text>
                <TouchableOpacity
                  style={[styles.signInBtn, { marginTop: spacing.md }, forgotSubmitting && { opacity: 0.7 }]}
                  activeOpacity={0.88}
                  disabled={forgotSubmitting}
                  onPress={() => {
                    void handleForgotResetPassword();
                  }}
                >
                  {forgotSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.signInText}>Update password</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : null}

            {forgotStep === 'done' ? (
              <>
                <View style={styles.forgotModalSuccessIcon}>
                  <Feather name="check" size={36} color="#059669" />
                </View>
                <Text style={styles.forgotModalTitle}>Password updated</Text>
                <Text style={styles.forgotModalBody}>
                  Your password has been changed. Sign in with your email and new password.
                </Text>
                <TouchableOpacity style={styles.signInBtn} activeOpacity={0.88} onPress={closeForgotModal}>
                  <Text style={styles.signInText}>Back to sign in</Text>
                </TouchableOpacity>
              </>
            ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const bootstrapBannerStyles = StyleSheet.create({
  wrap: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: '#B91C1C',
    marginBottom: spacing.xs,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: '#7F1D1D',
    lineHeight: 18,
  },
  api: {
    marginTop: spacing.sm,
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: '#991B1B',
  },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  retryText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: '#B91C1C',
  },
  refreshHint: {
    marginTop: spacing.sm,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.text.secondary,
  },
});

const signInOverlayStyles = StyleSheet.create({
  signInDisabled: { opacity: 0.85 },
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 28,
    alignItems: 'center',
    maxWidth: 300,
    width: '100%',
  },
  loadingText: {
    marginTop: 16,
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
  },
  loadingHint: {
    marginTop: 8,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
});
