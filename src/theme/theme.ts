export const colors = {
  primary: '#003D7A',
  primaryDark: '#002855',
  primaryLight: '#0052A2',
  /** Login header / brand navy; onboarding forms use `accent` for controls */
  white: '#FFFFFF',
  background: '#FFFFFF',
  /** Shell behind cards on onboarding / profile flows */
  surfaceMuted: '#F5F6F8',
  card: '#FFFFFF',
  inputBg: '#E5E7EB',
  border: '#E5E7EB',
  text: { primary: '#000000', secondary: '#6B7280', label: '#003366', link: '#2563EB' },
  icon: '#9CA3AF',
  /** Progress, field labels, primary actions on light screens (matches create-account `profileBlue`) */
  accent: '#0056D2',
} as const;

/** Poppins font family - use globally for all screens */
export const fontFamily = {
  regular: 'Poppins-Regular',
  medium: 'Poppins-Medium',
  semiBold: 'Poppins-SemiBold',
  bold: 'Poppins-Bold',
} as const;

export const typography = {
  h1: { fontFamily: fontFamily.bold, fontSize: 28, letterSpacing: -0.5 },
  h2: { fontFamily: fontFamily.bold, fontSize: 24, letterSpacing: -0.5 },
  subtitle: { fontFamily: fontFamily.regular, fontSize: 15 },
  label: { fontFamily: fontFamily.bold, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' as const },
  body: { fontFamily: fontFamily.regular, fontSize: 16 },
  link: { fontFamily: fontFamily.semiBold, fontSize: 13 },
  linkBold: { fontFamily: fontFamily.bold, fontSize: 15 },
  button: { fontFamily: fontFamily.bold, fontSize: 17 },
  caption: { fontFamily: fontFamily.regular, fontSize: 15 },
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 28 } as const;
