import React, { useState, useRef } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { spacing, colors } from '../../theme/theme';
import { loginScreenStyles } from '../../styles/styles';
import { CompanyPicker } from '../../components/CompanyPicker';

export function LoginScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotEmailSent, setForgotEmailSent] = useState(false);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const forgotEmailRef = useRef<TextInput>(null);

  const styles = loginScreenStyles;

  const openForgotModal = () => {
    setForgotEmail(email.trim());
    setForgotEmailSent(false);
    setForgotModalVisible(true);
  };

  const closeForgotModal = () => {
    Keyboard.dismiss();
    setForgotModalVisible(false);
    setForgotEmailSent(false);
  };

  const handleForgotSendPress = () => {
    setForgotEmailSent(true);
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
            <Text style={styles.appName}>Workforce</Text>
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

            <CompanyPicker variant="login" value={companyId} onChange={setCompanyId} />

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
                  navigation.navigate('Main');
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
              style={styles.signInBtn}
              activeOpacity={0.88}
              onPress={() => {
                // TODO: Re-enable company (and credential) validation when auth API is wired
                navigation.navigate('Main');
              }}
            >
              <Text style={styles.signInText}>Sign In</Text>
            </TouchableOpacity>

            <View style={styles.footerStack}>
              <View style={styles.footerStackInner}>
                <View style={styles.footerRow}>
                  <Text style={styles.footerPrompt}>New user?</Text>
                  <TouchableOpacity onPress={() => navigation.navigate('CreateAccount')} activeOpacity={0.7}>
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
              >
                <Feather name="x" size={24} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>

            {!forgotEmailSent ? (
              <>
                <View style={styles.forgotModalIconWrap}>
                  <Feather name="mail" size={28} color={colors.primary} />
                </View>
                <Text style={styles.forgotModalTitle}>Forgot your password?</Text>
                <Text style={styles.forgotModalBody}>
                  If you have forgotten your password, we will send an automated email to your address with a temporary
                  password. Use it to sign in, then choose a new password.
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
                    returnKeyType="send"
                    onSubmitEditing={handleForgotSendPress}
                  />
                </Pressable>
                <TouchableOpacity
                  style={[styles.signInBtn, { marginTop: spacing.xl }]}
                  activeOpacity={0.88}
                  onPress={handleForgotSendPress}
                >
                  <Text style={styles.signInText}>Send reset email</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.forgotModalBtnSecondary} onPress={closeForgotModal} activeOpacity={0.7}>
                  <Text style={styles.forgotModalBtnSecondaryText}>Back to sign in</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.forgotModalSuccessIcon}>
                  <Feather name="check" size={36} color="#059669" strokeWidth={2.5} />
                </View>
                <Text style={styles.forgotModalTitle}>Check your email</Text>
                <Text style={styles.forgotModalBody}>
                  We have sent an email to your inbox with a temporary password. Follow the instructions in the message
                  to sign in and update your password.
                </Text>
                <Text style={styles.forgotModalHint}>
                  Did not receive it? Check your spam folder or try again in a few minutes.
                </Text>
                <TouchableOpacity style={styles.signInBtn} activeOpacity={0.88} onPress={closeForgotModal}>
                  <Text style={styles.signInText}>Back to sign in</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
