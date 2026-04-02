import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { spacing } from '../../theme/theme';
import { loginScreenStyles } from '../../styles/styles';
import { CompanyPicker } from '../../components/CompanyPicker';

export function LoginScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const styles = loginScreenStyles;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.xxl }]}>
        <View style={[styles.geo, styles.geo1]} />
        <View style={[styles.geo, styles.geo2]} />
        <View style={[styles.geo, styles.geo3]} />
        <View style={[styles.geo, styles.geo4]} />
        <Text style={styles.appName}>Workforce</Text>
        <Text style={styles.tagline}>Precision in Motion</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.welcome}>Welcome back</Text>
        <Text style={styles.subWelcome}>Sign in to manage your shift</Text>

        <CompanyPicker variant="login" value={companyId} onChange={setCompanyId} />

        <Text style={[styles.label, { marginTop: spacing.xl }]}>EMAIL ADDRESS</Text>
        <View style={styles.input}>
          <Feather name="mail" size={20} color="#9CA3AF" style={styles.inputIcon} />
          <TextInput
            style={styles.inputField}
            placeholder="user@email.com"
            placeholderTextColor="#9CA3AF"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.labelRow}>
          <Text style={styles.label}>PASSWORD</Text>
          <TouchableOpacity activeOpacity={0.7}>
            <Text style={styles.forgot}>Forgot?</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.input}>
          <Feather name="lock" size={20} color="#9CA3AF" style={styles.inputIcon} />
          <TextInput
            style={[styles.inputField, styles.inputFieldPw]}
            placeholder="••••••••"
            placeholderTextColor="#9CA3AF"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setShowPassword(!showPassword)}
            activeOpacity={0.7}
          >
            <Feather name={showPassword ? 'eye-off' : 'eye'} size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

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

        <View style={styles.footer}>
          <Text style={styles.footerPrompt}>New user? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('CreateAccount')} activeOpacity={0.7}>
            <Text style={styles.footerLink}>Create an account</Text>
          </TouchableOpacity>
        </View>

       </View>

      <View style={styles.bottom} />
    </View>
  );
}
