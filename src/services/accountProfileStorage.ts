import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserProfileSnapshot } from '../types/userProfile';

const STORAGE_KEY = '@workforce_account_profile_v1';

/** Shown until the user completes registration or replaces with saved data. */
export const DEFAULT_ACCOUNT_PROFILE: UserProfileSnapshot = {
  companyName: 'Blue Green Facility Services',
  fullLegalName: 'Alex Rivera',
  email: 'alex.rivera@example.com',
  phone: '+61 400 000 000',
  dateOfBirth: '01 / 15 / 1992',
  sex: 'male',
  maritalStatus: 'Single',
  address: 'Sydney NSW, Australia',
  emergencyContactName: 'Jamie Rivera',
  emergencyContactPhone: '+61 400 111 222',
  emergencyContactRelationship: 'Spouse',
  visaStatus: 'Australian Citizen',
  unrestrictedWorkRights: 'Yes',
  hoursPerWeek: '38',
  weeklyAvailabilitySummary: 'Mon–Fri: Morning',
  idDocumentsSummary: "Driver's Licence (uploaded), Passport (uploaded)",
  policeCheckExpiry: '—',
  policeCheckUploaded: 'No',
  fitToWorkExpiry: '—',
  fitToWorkUploaded: 'No',
  licencesSummary: 'White Card',
  insurancesSummary: '—',
  bankName: 'Demo Bank',
  bankAccountName: 'Alex Rivera',
  bankBranchCode: '062-000',
  bankAccountNumber: '****1234',
  modeOfTransport: 'Public transport',
};

export async function loadAccountProfile(): Promise<UserProfileSnapshot> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as UserProfileSnapshot;
      return { ...DEFAULT_ACCOUNT_PROFILE, ...parsed };
    }
  } catch {
    /* use default */
  }
  return { ...DEFAULT_ACCOUNT_PROFILE };
}

export async function saveAccountProfile(profile: UserProfileSnapshot): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}
